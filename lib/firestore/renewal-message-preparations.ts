import { workspaceMessageBasisFingerprint } from "@/lib/lease-renewal/message-claim-basis";
export { workspaceMessageBasisFingerprint };
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { retainSenderSignature } from "@/lib/firestore/renewal-sender-signatures";
import {
  writeMessageBodyOverride,
  writeMessageSubjectOverride,
} from "@/lib/firestore/renewal-message-body-overrides";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  currentRenewalWorkspaceState,
  ensureRenewalWorkRecord,
  getRenewalWorkspace,
  renewalWorkspaceHeadRefs,
} from "@/lib/firestore/renewal-workspace";
import {
  MessagePreparationRecordSchema,
  SaveMessagePreparationSchema,
} from "@/lib/lease-renewal/renewal-message-preparation";
import type { RenewalWorkBasis } from "@/lib/lease-renewal/workspace-state";

export const MESSAGE_PREPARATION_COLLECTIONS = {
  head: "renewal_message_preparations",
  activity: "renewal_message_preparation_activity",
} as const;
function identity(leaseId: string, cycleId: string, channel: "owner" | "tenant") {
  return hashExecutionPreview({ leaseId, cycleId, channel });
}
function assertActor(actor: AuthenticatedUser, write = false) {
  if (
    !can(actor.role, write ? "edit" : "read") ||
    (write && isVerificationAccount(actor))
  )
    throw new EditableLayerError("Renewals staff access is required.", 403);
  if (write) assertMutationAllowed(requireEnvironmentDescriptor());
}
export async function getMessagePreparation(
  actor: AuthenticatedUser,
  leaseId: string,
  cycleId: string,
  channel: "owner" | "tenant",
  db: Firestore = getAdminFirestore(),
) {
  assertActor(actor);
  const snapshot = await db
    .collection(MESSAGE_PREPARATION_COLLECTIONS.head)
    .doc(identity(leaseId, cycleId, channel))
    .get();
  if (!snapshot.exists) return null;
  const record = MessagePreparationRecordSchema.parse(snapshot.data());
  if (
    record.leaseId !== leaseId ||
    record.cycleId !== cycleId ||
    record.channel !== channel
  )
    throw new EditableLayerError(
      "The saved message belongs to a different lease, work record or channel.",
      409,
    );
  return record;
}

export interface SaveMessagePreparationContext {
  /**
   * S154: the lease's real basis for a work record established by this save. Omitted or failing,
   * the record is saved on the lease without a date. Never asked of the person.
   */
  resolveBasis?: () => Promise<RenewalWorkBasis | null>;
}

/**
 * S161/S162: stores the message inputs and the authored subject and body. It is application
 * persistence only: never a Gmail receipt, a sent marker, a review or an approval, and it reaches
 * no provider. S154: no cycle step precedes it. The first save of a lease's message establishes the
 * work record its storage is keyed by. Missing business values, a changed source fact and an
 * unrecorded owner or tenant response never refuse a save; only an actual concurrent edit of the
 * same message does.
 */
export async function saveMessagePreparation(
  actor: AuthenticatedUser,
  raw: unknown,
  context: SaveMessagePreparationContext = {},
  db: Firestore = getAdminFirestore(),
) {
  assertActor(actor, true);
  const input = SaveMessagePreparationSchema.parse(raw);
  const recordChanged = () =>
    new EditableLayerError(
      "This lease's work record changed while you were editing. Your wording is kept on screen; reload the message, then save it again.",
      409,
    );
  let workRecord = await getRenewalWorkspace(actor, input.leaseId, db);
  if (!workRecord) {
    // Nothing is stored for this lease yet, so only a first save can be meant. A save that
    // expects an earlier record or revision is a conflict and establishes nothing.
    if (input.cycleId) throw recordChanged();
    if (input.expectedRevision !== 0)
      throw new EditableLayerError(
        "Another person changed this message. Your entry is kept; choose Save my entry to keep yours.",
        409,
      );
    workRecord = await ensureRenewalWorkRecord(
      actor,
      input.leaseId,
      db,
      context.resolveBasis,
    );
  }
  if (input.cycleId && input.cycleId !== workRecord.cycleId) throw recordChanged();
  const cycleId = workRecord.cycleId;
  const ref = db
    .collection(MESSAGE_PREPARATION_COLLECTIONS.head)
    .doc(identity(input.leaseId, cycleId, input.channel));
  const audit = db
    .collection(MESSAGE_PREPARATION_COLLECTIONS.activity)
    .doc(input.operationId);
  const heads = renewalWorkspaceHeadRefs(db, input.leaseId);
  const requestHash = hashExecutionPreview({ actorUid: actor.uid, ...input });
  const duplicate = await db.runTransaction(async (transaction) => {
    const [snapshot, prior, dated, leaseBound] = await Promise.all([
      transaction.get(ref),
      transaction.get(audit),
      transaction.get(heads.dated),
      transaction.get(heads.leaseBound),
    ]);
    if (prior.exists) {
      if (prior.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This save was already used for different wording. Your entry is kept; save it again.",
          409,
        );
      return true;
    }
    const head = currentRenewalWorkspaceState(db, input.leaseId, dated, leaseBound);
    if (!head || head.cycleId !== cycleId)
      throw new EditableLayerError(
        "This lease's work record changed while you were editing. Your wording is kept on screen; reload the message, then save it again.",
        409,
      );
    const current = snapshot.exists
      ? MessagePreparationRecordSchema.parse(snapshot.data())
      : null;
    if ((current?.revision ?? 0) !== input.expectedRevision)
      throw new EditableLayerError(
        "Another person changed this message. Your entry is kept; choose Save my entry to keep yours.",
        409,
      );
    const sameSignature =
      current?.inputs.signature &&
      input.inputs.signature &&
      !input.adoptSignature &&
      hashExecutionPreview(current.inputs.signature) ===
        hashExecutionPreview(input.inputs.signature);
    const now = new Date().toISOString();
    const record = MessagePreparationRecordSchema.parse({
      schemaVersion: "renewal-message-preparation/v2",
      leaseId: input.leaseId,
      cycleId,
      channel: input.channel,
      revision: (current?.revision ?? 0) + 1,
      inputs: input.inputs,
      // There is no review step. The field keeps the stored shape the previous release reads.
      reviewedSourceFingerprint: null,
      signatureActorUid: input.inputs.signature
        ? sameSignature
          ? current!.signatureActorUid
          : actor.uid
        : null,
      signatureEmail: input.inputs.signature
        ? sameSignature
          ? current!.signatureEmail
          : actor.email
        : null,
      updatedAt: now,
      updatedByUid: actor.uid,
    });
    transaction.set(ref, record);
    // Authored wording belongs to exactly this revision; a revision saved without it clears it.
    const bodyOverride = writeMessageBodyOverride(transaction, db, actor, {
      leaseId: input.leaseId,
      cycleId,
      channel: input.channel,
      revision: record.revision,
      body: input.bodyOverride ?? null,
      now,
    });
    const subjectOverride = writeMessageSubjectOverride(transaction, db, actor, {
      leaseId: input.leaseId,
      cycleId,
      channel: input.channel,
      revision: record.revision,
      subject: input.subjectOverride ?? null,
      now,
    });
    // S120: the sender's own signature is retained for reuse on their next lease or cycle.
    retainSenderSignature(transaction, db, actor, record);
    transaction.create(audit, {
      request_hash: requestHash,
      leaseId: input.leaseId,
      cycleId,
      channel: input.channel,
      actorUid: actor.uid,
      recordedAt: now,
      previous_revision: current?.revision ?? 0,
      next_state: record,
      // The audit keeps hashes only; the wording itself lives in the override records.
      body_override: bodyOverride,
      subject_override: subjectOverride,
    });
    return false;
  });
  return {
    duplicate,
    cycleId,
    record: await getMessagePreparation(actor, input.leaseId, cycleId, input.channel, db),
  };
}
