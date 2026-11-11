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
  MessageBodyOverrideRecordSchema,
  messageBodyOverrideRef,
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
  MessageRuleBasisSchema,
  SaveMessagePreparationSchema,
  type MessageRuleBasis,
} from "@/lib/lease-renewal/renewal-message-preparation";
import {
  OfferChargeSelectionSchema,
  type OfferChargeSelection,
} from "@/lib/lease-renewal/offer-charges";
import type { RenewalWorkBasis } from "@/lib/lease-renewal/workspace-state";

export const MESSAGE_PREPARATION_COLLECTIONS = {
  head: "renewal_message_preparations",
  activity: "renewal_message_preparation_activity",
  // S250 R-S250-7: the agreement rule each saved revision was built on, beside the record (the
  // record's own stored shape is unchanged, so an earlier release still reads it).
  ruleBases: "renewal_message_rule_bases",
  // S264 R-S264-2: the tenant offer's charge review for each saved revision, beside the record
  // for the same reason.
  offerSelections: "renewal_offer_charge_selections",
} as const;

const OFFER_SELECTION_SCHEMA_VERSION = "renewal-offer-charge-selection/v1";

/** S264: the saved charge review for one revision of the tenant message. */
export type OfferChargeSelectionRead =
  | { readonly state: "saved"; readonly selection: OfferChargeSelection }
  | { readonly state: "none" }
  | { readonly state: "unreadable" };

/**
 * S264 R-S264-2: the charge review saved with the tenant message's revision. A review saved with
 * an earlier revision is not this revision's; an unreadable one is reported, never read as empty.
 */
export async function getOfferChargeSelection(
  actor: AuthenticatedUser,
  leaseId: string,
  cycleId: string,
  revision: number,
  db: Firestore = getAdminFirestore(),
): Promise<OfferChargeSelectionRead> {
  assertActor(actor);
  try {
    const snapshot = await db
      .collection(MESSAGE_PREPARATION_COLLECTIONS.offerSelections)
      .doc(identity(leaseId, cycleId, "tenant"))
      .get();
    if (!snapshot.exists || snapshot.get("revision") !== revision)
      return { state: "none" };
    if (snapshot.get("leaseId") !== leaseId || snapshot.get("cycleId") !== cycleId)
      return { state: "unreadable" };
    const parsed = OfferChargeSelectionSchema.safeParse(snapshot.get("selection"));
    return parsed.success
      ? { state: "saved", selection: parsed.data }
      : { state: "unreadable" };
  } catch {
    return { state: "unreadable" };
  }
}

/** The doc that holds the tenant message's charge review, for a claim's transaction. */
export function offerChargeSelectionRef(db: Firestore, leaseId: string, cycleId: string) {
  return db
    .collection(MESSAGE_PREPARATION_COLLECTIONS.offerSelections)
    .doc(identity(leaseId, cycleId, "tenant"));
}

/**
 * S250 R-S250-7: the agreement rule the message's saved revision was built on; null when that
 * revision recorded none (or was saved before this existed).
 */
export async function getMessageRuleBasis(
  actor: AuthenticatedUser,
  leaseId: string,
  cycleId: string,
  channel: "owner" | "tenant",
  revision: number,
  db: Firestore = getAdminFirestore(),
): Promise<MessageRuleBasis | null> {
  assertActor(actor);
  const snapshot = await db
    .collection(MESSAGE_PREPARATION_COLLECTIONS.ruleBases)
    .doc(identity(leaseId, cycleId, channel))
    .get();
  if (!snapshot.exists || snapshot.get("revision") !== revision) return null;
  const parsed = MessageRuleBasisSchema.nullable().safeParse(snapshot.get("ruleBasis"));
  return parsed.success ? parsed.data : null;
}
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
  if (input.offerCharges && input.channel !== "tenant")
    throw new EditableLayerError("Offer charges belong to the tenant offer.", 400);
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
  const bodyRef = messageBodyOverrideRef(db, input.leaseId, cycleId, input.channel);
  const selectionRef = offerChargeSelectionRef(db, input.leaseId, cycleId);
  const requestHash = hashExecutionPreview({ actorUid: actor.uid, ...input });
  const duplicate = await db.runTransaction(async (transaction) => {
    const [snapshot, prior, dated, leaseBound, priorBody, priorSelection] =
      await Promise.all([
        transaction.get(ref),
        transaction.get(audit),
        transaction.get(heads.dated),
        transaction.get(heads.leaseBound),
        transaction.get(bodyRef),
        input.channel === "tenant" ? transaction.get(selectionRef) : null,
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
    // An unrelated edit preserves earlier wording and its actual author. Only an exact
    // takeover of the body can make it active for the current sender.
    const priorWording = priorBody.exists
      ? MessageBodyOverrideRecordSchema.parse(priorBody.data())
      : null;
    const keepPriorWording =
      priorWording &&
      priorWording.revision === current?.revision &&
      priorWording.updatedByUid !== actor.uid &&
      !input.replacePriorSenderWording;
    const bodyOverride = keepPriorWording
      ? {
          textHash: hashExecutionPreview({ text: priorWording.text }),
          baseHash: priorWording.baseHash,
        }
      : writeMessageBodyOverride(transaction, db, actor, {
          leaseId: input.leaseId,
          cycleId,
          channel: input.channel,
          revision: record.revision,
          body: input.bodyOverride ?? null,
          now,
        });
    if (keepPriorWording)
      transaction.set(bodyRef, { ...priorWording, revision: record.revision });
    const subjectOverride = writeMessageSubjectOverride(transaction, db, actor, {
      leaseId: input.leaseId,
      cycleId,
      channel: input.channel,
      revision: record.revision,
      subject: input.subjectOverride ?? null,
      now,
    });
    // S250 R-S250-7: the agreement rule this revision was built on, kept beside the record.
    if (input.ruleBasis !== undefined)
      transaction.set(
        db
          .collection(MESSAGE_PREPARATION_COLLECTIONS.ruleBases)
          .doc(identity(input.leaseId, cycleId, input.channel)),
        {
          leaseId: input.leaseId,
          cycleId,
          channel: input.channel,
          revision: record.revision,
          ruleBasis: input.ruleBasis,
          recordedAt: now,
          recordedByUid: actor.uid,
        },
      );
    // S264 R-S264-2: the charge review saves with this revision. A save that carries none (an
    // earlier page, or a re-save that only renews the revision) keeps the review the previous
    // revision saved, so a refresh or retry never loses a staff decision.
    let offerChargesHash: string | null = null;
    if (input.channel === "tenant") {
      const carried =
        input.offerCharges === undefined &&
        priorSelection?.exists &&
        priorSelection.get("revision") === current?.revision
          ? OfferChargeSelectionSchema.safeParse(priorSelection.get("selection"))
          : null;
      const selection =
        input.offerCharges ?? (carried?.success ? carried.data : undefined);
      if (selection) {
        offerChargesHash = hashExecutionPreview({ selection });
        transaction.set(selectionRef, {
          schemaVersion: OFFER_SELECTION_SCHEMA_VERSION,
          leaseId: input.leaseId,
          cycleId,
          channel: "tenant",
          revision: record.revision,
          selection,
          recordedAt: now,
          recordedByUid: actor.uid,
        });
      }
    }
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
      ...(offerChargesHash ? { offer_charges: offerChargesHash } : {}),
    });
    return false;
  });
  return {
    duplicate,
    cycleId,
    record: await getMessagePreparation(actor, input.leaseId, cycleId, input.channel, db),
  };
}
