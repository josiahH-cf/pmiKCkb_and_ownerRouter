import { workspaceMessageBasisFingerprint } from "@/lib/lease-renewal/message-claim-basis";
export { workspaceMessageBasisFingerprint } from "@/lib/lease-renewal/message-claim-basis";
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
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  RENEWAL_WORKSPACE_COLLECTIONS,
  renewalWorkspaceDocId,
} from "@/lib/firestore/renewal-workspace";
import {
  MessagePreparationRecordSchema,
  SaveMessagePreparationSchema,
} from "@/lib/lease-renewal/renewal-message-preparation";

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
      "The saved message belongs to a different lease, cycle or channel.",
      409,
    );
  return record;
}

/** Stores reviewed inputs and deliberate prose edits, never a Gmail receipt or a sent marker. */
export async function saveMessagePreparation(
  actor: AuthenticatedUser,
  raw: unknown,
  currentBasis: { sourceFingerprint: string; workspaceFingerprint: string },
  db: Firestore = getAdminFirestore(),
) {
  assertActor(actor, true);
  const input = SaveMessagePreparationSchema.parse(raw);
  const currentSourceFingerprint = currentBasis.sourceFingerprint;
  if (input.sourceFingerprint !== currentSourceFingerprint)
    throw new EditableLayerError(
      "Source facts changed. Reload the message and review its current facts; your edits remain available.",
      409,
    );
  const ref = db
    .collection(MESSAGE_PREPARATION_COLLECTIONS.head)
    .doc(identity(input.leaseId, input.cycleId, input.channel));
  const audit = db
    .collection(MESSAGE_PREPARATION_COLLECTIONS.activity)
    .doc(input.operationId);
  const workspace = db
    .collection(RENEWAL_WORKSPACE_COLLECTIONS.head)
    .doc(renewalWorkspaceDocId(input.leaseId));
  const requestHash = hashExecutionPreview({ actorUid: actor.uid, ...input });
  const duplicate = await db.runTransaction(async (transaction) => {
    const [snapshot, prior, head] = await Promise.all([
      transaction.get(ref),
      transaction.get(audit),
      transaction.get(workspace),
    ]);
    if (prior.exists) {
      if (prior.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This saved-message request changed. Reload before saving.",
          409,
        );
      return true;
    }
    if (!head.exists || head.get("cycleId") !== input.cycleId)
      throw new EditableLayerError(
        "The renewal cycle changed. Review this cycle before saving its message.",
        409,
      );
    if (
      workspaceMessageBasisFingerprint(head.data()!) !== currentBasis.workspaceFingerprint
    )
      throw new EditableLayerError(
        "The owner terms or comp preparation changed while this message was being saved. Reload and review.",
        409,
      );
    const current = snapshot.exists
      ? MessagePreparationRecordSchema.parse(snapshot.data())
      : null;
    if ((current?.revision ?? 0) !== input.expectedRevision)
      throw new EditableLayerError(
        "Another operator changed this message. Reload before saving.",
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
      cycleId: input.cycleId,
      channel: input.channel,
      revision: (current?.revision ?? 0) + 1,
      inputs: input.inputs,
      // A changed input set needs deliberate review. Saving an unfinished edit never grants export readiness.
      reviewedSourceFingerprint: input.reviewed ? currentSourceFingerprint : null,
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
    transaction.create(audit, {
      request_hash: requestHash,
      leaseId: input.leaseId,
      cycleId: input.cycleId,
      channel: input.channel,
      actorUid: actor.uid,
      recordedAt: now,
      previous_revision: current?.revision ?? 0,
      next_state: record,
    });
    return false;
  });
  return {
    duplicate,
    record: await getMessagePreparation(
      actor,
      input.leaseId,
      input.cycleId,
      input.channel,
      db,
    ),
  };
}
