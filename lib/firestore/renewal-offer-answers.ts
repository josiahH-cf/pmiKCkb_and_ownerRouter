// S264 R-S264-6: the exact offer each recorded answer covers, in its own collection keyed by the
// answer's event. The work record save prepares and writes it in the same transaction as the
// answer (all reads first), so an answer and the offer it covers are recorded together or not at
// all. Older versions of the app never read this collection: they keep reading each answer as
// before, which is never a wider approval than the one recorded here.

import type { Firestore, Transaction } from "firebase-admin/firestore";

import { EditableLayerError } from "@/lib/firestore/errors";
import { offerChargeMappingVersionIn } from "@/lib/firestore/renewal-offer-charge-mappings";
import { COMMUNICATION_SEQUENCE_COLLECTIONS } from "@/lib/gmail-hub/sequence-store";
import {
  buildOfferAnswersView,
  OFFER_ANSWER_SCHEMA_VERSION,
  readOfferAnswerRecord,
  TENANT_DECISION_OUTCOMES,
  type OfferAnswerAttribution,
  type OfferAnswerInput,
  type OfferAnswerRecord,
  type OfferAnswersView,
} from "@/lib/lease-renewal/offer-answers";
import {
  offerSnapshotIdentity,
  offerSnapshotIntact,
  type FrozenOfferSnapshot,
} from "@/lib/lease-renewal/offer-snapshot";
import type {
  ApprovedWorkingTerms,
  RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

export const OFFER_ANSWER_COLLECTION = "renewal_offer_answers";
const DRAFT_SNAPSHOTS = "renewal_message_draft_snapshots";
const EXECUTIONS = "action_executions";

const NOT_LINKABLE =
  "This sent message does not keep the exact offer it carried, so the answer cannot be linked to it. Record the answer without a linked offer, or use a verified external offer.";
const DRAFT_NOT_USABLE =
  "This prepared offer cannot be used: it is not this lease's current tenant offer draft with its exact charges. Choose the offer the tenant actually received.";
const OWNER_OFFER_CHANGED =
  "The offer changed while the owner's approval was being recorded, so its charges were not bound. Your entries are kept; review the offer charges and record the approval again.";

export function offerAnswerRef(db: Firestore, eventId: string) {
  return db.collection(OFFER_ANSWER_COLLECTION).doc(eventId);
}

/** What the work record save hands this module, read and checked before it plans the answer. */
export interface PreparedOfferAnswer {
  /** Writes the record in the caller's transaction, after every read. */
  readonly write: (
    tx: Transaction,
    approvedTerms: ApprovedWorkingTerms | null,
  ) => OfferAnswerRecord;
}

/**
 * Read and verify, inside the save's transaction and before any write, the exact offer an answer
 * names. Tenant decisions name a confirmed send (its frozen offer) or a staff-verified external
 * offer (an app-prepared draft with its frozen offer and the staff reference); the owner's
 * reviewed offer is the snapshot read just before the transaction, checked here against the
 * mapping version and bound with the approved base and dates.
 */
export async function prepareOfferAnswerIn(
  tx: Transaction,
  db: Firestore,
  input: {
    readonly leaseId: string;
    readonly cycleId: string;
    readonly eventId: string;
    readonly party: "tenant" | "owner";
    readonly outcome: string;
    readonly answer: OfferAnswerInput;
    readonly actorUid: string;
    readonly recordedAt: string;
    /** The owner's reviewed offer, read before the transaction and equal to what staff reviewed. */
    readonly reviewedOffer: FrozenOfferSnapshot | null;
  },
): Promise<PreparedOfferAnswer> {
  const { answer } = input;
  let attribution: OfferAnswerAttribution;
  let offer: FrozenOfferSnapshot | null = null;
  if (input.party === "tenant") {
    if (!TENANT_DECISION_OUTCOMES.has(input.outcome))
      throw new EditableLayerError("Only a tenant decision answers an offer.", 400);
    if (answer.kind === "owner_reviewed_offer")
      throw new EditableLayerError(
        "Choose the offer the tenant's answer responds to.",
        400,
      );
    if (answer.kind === "linked_communication") {
      const [sequence, occurrence] = await Promise.all([
        tx.get(
          db
            .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
            .doc(answer.sequenceId),
        ),
        tx.get(
          db
            .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences)
            .doc(answer.occurrenceId),
        ),
      ]);
      const context = sequence.get("context") as
        | { entityType?: string; entityId?: string; purpose?: string }
        | undefined;
      const authorization = sequence.get("authorization") as
        | { revision?: number; offerSnapshot?: FrozenOfferSnapshot }
        | null
        | undefined;
      if (
        !sequence.exists ||
        context?.entityType !== "renewal_lease" ||
        context.entityId !== input.leaseId ||
        context.purpose !== "renewal_tenant" ||
        !occurrence.exists ||
        occurrence.get("sequenceId") !== answer.sequenceId ||
        occurrence.get("state") !== "sent" ||
        occurrence.get("index") !== 0
      )
        throw new EditableLayerError(
          "Choose a confirmed send of this lease's tenant offer.",
          409,
        );
      // The offer frozen with the sent message itself; for sends recorded before it was kept
      // there, the authorization it was sent under, while that authorization still stands.
      const frozen =
        (occurrence.get("offerSnapshot") as FrozenOfferSnapshot | undefined) ??
        (authorization?.revision === occurrence.get("authorizationRevision")
          ? authorization?.offerSnapshot
          : undefined);
      if (
        !frozen ||
        !offerSnapshotIntact(frozen) ||
        frozen.snapshot.leaseId !== input.leaseId ||
        frozen.snapshot.cycleId !== input.cycleId
      )
        throw new EditableLayerError(NOT_LINKABLE, 409);
      offer = frozen;
      const sentAtMs = occurrence.get("sentAtMs");
      attribution = {
        kind: "linked_communication",
        sequenceId: answer.sequenceId,
        occurrenceId: answer.occurrenceId,
        sentAtMs: typeof sentAtMs === "number" ? sentAtMs : null,
      };
    } else if (answer.kind === "external_offer") {
      const [draft, execution] = await Promise.all([
        tx.get(db.collection(DRAFT_SNAPSHOTS).doc(answer.executionId)),
        tx.get(db.collection(EXECUTIONS).doc(answer.executionId)),
      ]);
      const claimed = draft.get("claimBasis.offerCharges") as
        | {
            snapshotId?: string;
            snapshotHash?: string;
            snapshot?: FrozenOfferSnapshot["snapshot"];
          }
        | undefined;
      const frozen =
        claimed?.snapshotId && claimed.snapshotHash && claimed.snapshot
          ? {
              snapshotId: claimed.snapshotId,
              snapshotHash: claimed.snapshotHash,
              snapshot: claimed.snapshot,
            }
          : null;
      if (
        !draft.exists ||
        draft.get("leaseId") !== input.leaseId ||
        draft.get("cycleId") !== input.cycleId ||
        draft.get("channel") !== "tenant" ||
        !execution.exists ||
        execution.get("state") !== "Succeeded" ||
        !frozen ||
        !offerSnapshotIntact(frozen)
      )
        throw new EditableLayerError(DRAFT_NOT_USABLE, 409);
      offer = frozen;
      attribution = {
        kind: "external_offer",
        executionId: answer.executionId,
        reference: answer.reference,
        reviewedByUid: input.actorUid,
      };
    } else attribution = { kind: "unattributed" };
  } else {
    if (input.outcome !== "approved_terms" || answer.kind !== "owner_reviewed_offer")
      throw new EditableLayerError(
        "Only an owner approval of the exact terms can cover the offer's charges.",
        400,
      );
    const reviewed = input.reviewedOffer;
    if (
      !reviewed ||
      reviewed.snapshotId !== answer.snapshotId ||
      reviewed.snapshotHash !== answer.snapshotHash ||
      reviewed.snapshot.leaseId !== input.leaseId ||
      reviewed.snapshot.cycleId !== input.cycleId
    )
      throw new EditableLayerError(OWNER_OFFER_CHANGED, 409);
    const mappingVersion = await offerChargeMappingVersionIn(tx, db);
    if (mappingVersion !== reviewed.snapshot.mappingVersion)
      throw new EditableLayerError(OWNER_OFFER_CHANGED, 409);
    offer = reviewed;
    attribution = { kind: "owner_reviewed_offer", reviewedByUid: input.actorUid };
  }
  return {
    write(writeTx, approvedTerms) {
      let bound = offer;
      if (input.party === "owner") {
        // The owner approved the reviewed offer with the exact terms this answer records: the
        // same base amount and the same dates. The approved base may take a new revision in
        // this transaction; the bound offer is the one current once it does.
        const snapshot = offer!.snapshot;
        if (
          !approvedTerms ||
          snapshot.base.rent === null ||
          Math.abs(snapshot.base.rent - approvedTerms.rent) >= 0.005 ||
          snapshot.dates.effectiveDate !== approvedTerms.effectiveDate ||
          snapshot.dates.endDate !== approvedTerms.endDate ||
          snapshot.dates.effectiveRevision !==
            approvedTerms.fieldRevisions.effectiveDate ||
          snapshot.dates.endRevision !== approvedTerms.fieldRevisions.endDate
        )
          throw new EditableLayerError(OWNER_OFFER_CHANGED, 409);
        const next = {
          ...snapshot,
          base: { rent: snapshot.base.rent, revision: approvedTerms.fieldRevisions.rent },
        };
        bound = { ...offerSnapshotIdentity(next), snapshot: next };
      }
      const record: OfferAnswerRecord = {
        schemaVersion: OFFER_ANSWER_SCHEMA_VERSION,
        leaseId: input.leaseId,
        cycleId: input.cycleId,
        eventId: input.eventId,
        party: input.party,
        outcome: input.outcome,
        attribution,
        offer: bound,
        recordedAt: input.recordedAt,
        recordedByUid: input.actorUid,
      };
      writeTx.create(offerAnswerRef(db, input.eventId), record);
      return record;
    },
  };
}

/** The record for one answer's event; null when none was recorded or it is not intact. */
export async function readOfferAnswer(
  db: Firestore,
  eventId: string | null | undefined,
): Promise<OfferAnswerRecord | null> {
  if (!eventId) return null;
  const snapshot = await offerAnswerRef(db, eventId).get();
  return snapshot.exists ? readOfferAnswerRecord(snapshot.data()) : null;
}

/**
 * The exact offer the current tenant acceptance answers, for packet parity: the recorded answer of
 * the work record's current tenant response, when it is an acceptance of these terms that names
 * one exact offer. Anything else compares nothing. Never throws.
 */
export async function readAcceptedTenantOffer(
  db: Firestore,
  workspace: {
    readonly cycleId: string;
    readonly termsRevision: number;
    readonly tenantResponse: {
      readonly outcome: string;
      readonly eventId: string;
      readonly termsRevision: number;
    } | null;
  } | null,
): Promise<FrozenOfferSnapshot | null> {
  const response = workspace?.tenantResponse;
  if (
    !workspace ||
    response?.outcome !== "accepted" ||
    response.termsRevision !== workspace.termsRevision
  )
    return null;
  const record = await readOfferAnswer(db, response.eventId).catch(() => null);
  return record?.party === "tenant" && record.cycleId === workspace.cycleId
    ? record.offer
    : null;
}

export interface OfferAnswerCandidate {
  readonly kind: "linked_communication" | "external_offer";
  /** The sequence and sent occurrence, or the prepared draft's execution. */
  readonly sequenceId?: string;
  readonly occurrenceId?: string;
  readonly executionId?: string;
  /** When it was sent (a confirmed send) or prepared (an app-prepared draft). */
  readonly atMs: number | null;
  readonly offer: FrozenOfferSnapshot;
}

/**
 * The exact offers a tenant decision can answer on this cycle: each confirmed first send of the
 * tenant offer that kept its frozen offer, and each app-prepared Gmail draft with its frozen offer
 * (usable only with a staff reference that it was sent). Newest first; nothing is chosen here.
 */
export async function listOfferAnswerCandidates(
  db: Firestore,
  leaseId: string,
  cycleId: string,
): Promise<OfferAnswerCandidate[]> {
  const [sequences, drafts] = await Promise.all([
    db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
      .where("context.entityId", "==", leaseId)
      .limit(50)
      .get(),
    db.collection(DRAFT_SNAPSHOTS).where("leaseId", "==", leaseId).limit(50).get(),
  ]);
  const candidates: OfferAnswerCandidate[] = [];
  for (const sequence of sequences.docs) {
    const context = sequence.get("context") as { entityType?: string; purpose?: string };
    if (context?.entityType !== "renewal_lease" || context.purpose !== "renewal_tenant")
      continue;
    const authorization = sequence.get("authorization") as {
      revision?: number;
      offerSnapshot?: FrozenOfferSnapshot;
    } | null;
    const occurrences = await db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences)
      .where("sequenceId", "==", sequence.id)
      .limit(20)
      .get();
    for (const occurrence of occurrences.docs) {
      if (occurrence.get("state") !== "sent" || occurrence.get("index") !== 0) continue;
      const frozen =
        (occurrence.get("offerSnapshot") as FrozenOfferSnapshot | undefined) ??
        (authorization?.revision === occurrence.get("authorizationRevision")
          ? authorization?.offerSnapshot
          : undefined);
      if (!frozen || !offerSnapshotIntact(frozen) || frozen.snapshot.cycleId !== cycleId)
        continue;
      const sentAtMs = occurrence.get("sentAtMs");
      candidates.push({
        kind: "linked_communication",
        sequenceId: sequence.id,
        occurrenceId: occurrence.id,
        atMs: typeof sentAtMs === "number" ? sentAtMs : null,
        offer: frozen,
      });
    }
  }
  for (const draft of drafts.docs) {
    if (draft.get("channel") !== "tenant" || draft.get("cycleId") !== cycleId) continue;
    const claimed = draft.get("claimBasis.offerCharges") as
      | {
          snapshotId?: string;
          snapshotHash?: string;
          snapshot?: FrozenOfferSnapshot["snapshot"];
        }
      | undefined;
    if (!claimed?.snapshotId || !claimed.snapshotHash || !claimed.snapshot) continue;
    const frozen = {
      snapshotId: claimed.snapshotId,
      snapshotHash: claimed.snapshotHash,
      snapshot: claimed.snapshot,
    };
    if (!offerSnapshotIntact(frozen)) continue;
    const execution = await db.collection(EXECUTIONS).doc(draft.id).get();
    if (!execution.exists || execution.get("state") !== "Succeeded") continue;
    const createdAt = Date.parse(String(execution.get("updated_at") ?? ""));
    candidates.push({
      kind: "external_offer",
      executionId: draft.id,
      atMs: Number.isFinite(createdAt) ? createdAt : null,
      offer: frozen,
    });
  }
  return candidates.sort((left, right) => (right.atMs ?? 0) - (left.atMs ?? 0));
}

/**
 * The response editors' view for one work record: the offers a tenant decision can name, and the
 * current tenant and owner answers' coverage of `current` (the offer as it stands now), each read
 * from the answer's own record. The tenant message's own read carries it, so it is read again
 * whenever that message is.
 */
export async function readOfferAnswersView(
  db: Firestore,
  workspace: RenewalWorkspaceState,
  current: FrozenOfferSnapshot | null,
): Promise<OfferAnswersView> {
  const [candidates, tenantRecord, ownerRecord] = await Promise.all([
    listOfferAnswerCandidates(db, workspace.leaseId, workspace.cycleId),
    readOfferAnswer(db, workspace.tenantResponse?.eventId),
    readOfferAnswer(db, workspace.ownerResponse?.eventId),
  ]);
  const ofCycle = (record: OfferAnswerRecord | null) =>
    record?.cycleId === workspace.cycleId && record.leaseId === workspace.leaseId
      ? record
      : null;
  return buildOfferAnswersView({
    workspace,
    current,
    candidates,
    tenantRecord: ofCycle(tenantRecord),
    ownerRecord: ofCycle(ownerRecord),
  });
}
