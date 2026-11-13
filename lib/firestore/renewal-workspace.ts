import { resolveCurrentCompScreenshotAttachment } from "@/lib/firestore/lease-renewal-progress";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { can } from "@/lib/auth/roles";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { RenewalMarketBasisSchema } from "@/lib/lease-renewal/market-basis-schema";
import {
  SheetFieldIntentSchema,
  type SheetFieldIntent,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";
import { captureApprovedWorkingTerms } from "@/lib/lease-documents/owner-approval-binding";
import { readChargePolicyIn } from "@/lib/firestore/lease-charge-policy";
import { readPacketInputsIn } from "@/lib/firestore/lease-packet-inputs";
import {
  RENEWAL_WORKING_RECORD_COLLECTIONS,
  RenewalWorkingRecordSchema,
  parseRenewalWorkingRecord,
  renewalWorkingRecordRef,
} from "@/lib/firestore/renewal-working-record";
import { COMMUNICATION_SEQUENCE_COLLECTIONS } from "@/lib/gmail-hub/sequence-store";
import {
  prepareOfferAnswerIn,
  readOfferAnswer,
  type PreparedOfferAnswer,
} from "@/lib/firestore/renewal-offer-answers";
import { OfferAnswerInputSchema } from "@/lib/lease-renewal/offer-answers";
import {
  OFF_CYCLE_DECISIONS,
  OFF_CYCLE_REASON_MAX,
} from "@/lib/lease-renewal/off-cycle-review";
import type { FrozenOfferSnapshot } from "@/lib/lease-renewal/offer-snapshot";
import type { CommunicationInboundEvidence } from "@/lib/gmail-hub/sequence-model";
import {
  ApprovedWorkingTermsSchema,
  OwnerApprovalEvidenceSchema,
  missingOwnerApprovalItems,
  type OwnerApprovalEvidence,
  CycleBasisSchema,
  LeaseBoundBasisSchema,
  MANUAL_ACTIVITIES,
  RenewalTermsSchema,
  RenewalWorkspaceActionSchema,
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  workBasisDateIso,
  type ApprovedWorkingTerms,
  type RenewalCycleBasis,
  type RenewalWorkBasis,
  type RenewalWorkspaceState,
  type WorkingTermRevisions,
} from "@/lib/lease-renewal/workspace-state";
import { currentWorkingTermRevisions } from "@/lib/lease-renewal/tenant-answer-terms";
import {
  projectCurrentCycleWorkingRecord,
  storedWorkingRevision,
} from "@/lib/lease-renewal/current-cycle-terms";
import {
  ApprovedBaseSchema,
  type ApprovedBase,
} from "@/lib/lease-renewal/owner-approval-scope";
import {
  planApprovedBaseChange,
  type ApprovedBaseWorkingChange,
} from "@/lib/lease-renewal/owner-answer-terms";

export const RENEWAL_WORKSPACE_COLLECTIONS = {
  head: "lease_renewal_workspaces",
  // S154: a work record saved while the source reported no lease end or review date. It lives
  // apart from the dated heads so every reader of that collection keeps its exact dated shape.
  leaseBoundHead: "lease_renewal_lease_bound_workspaces",
  cycles: "lease_renewal_workspace_cycles",
  activity: "lease_renewal_workspace_activity",
  observations: "lease_renewal_market_observations",
} as const;
const leaseId = z.string().regex(/^[1-9]\d*$/);
const staff = z
  .object({
    eventId: z.string(),
    actorUid: z.string(),
    recordedAt: z.string().datetime(),
    source: z.string().min(1),
    reason: z.string().optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    termsRevision: z.number().int().nonnegative(),
  })
  .strict();
const stateSchema = z
  .object({
    schemaVersion: z.literal("renewal-workspace/v1"),
    leaseId,
    cycleId: z.string().uuid(),
    // S262 R-S262-5: the cycle this record replaced; null for the lease's first cycle.
    previousCycleId: z.string().uuid().nullable().optional(),
    basis: CycleBasisSchema,
    revision: z.number().int().nonnegative(),
    termsRevision: z.number().int().nonnegative(),
    ownerResponse: staff
      .extend({
        outcome: z.enum([
          "approved_terms",
          "revision_requested",
          "declined_non_renewal",
          "no_response",
          // S251: the owner wants to renew this tenant; the rent is decided separately.
          "renew_tenant",
        ]),
        terms: RenewalTermsSchema.optional(),
        approvedWorkingTerms: ApprovedWorkingTermsSchema.optional(),
        approval: OwnerApprovalEvidenceSchema.optional(),
        // S262 R-S262-1/3: the exact approved amount, the base revision it covers and its scope.
        approvedBase: ApprovedBaseSchema.optional(),
      })
      .nullable(),
    tenantResponse: staff
      .extend({
        outcome: z.enum([
          "awaiting_response",
          "accepted",
          "counter_change_requested",
          "declined_nonrenewing",
          "needs_verification",
        ]),
        workingTermRevisions: z
          .object({
            rent: z.number().int().nonnegative(),
            effectiveDate: z.number().int().nonnegative(),
            endDate: z.number().int().nonnegative(),
          })
          .strict()
          .optional(),
      })
      .nullable(),
    activities: z
      .record(
        z.string(),
        staff.extend({
          outcome: z.enum(["not_started", "waiting", "done", "not_applicable"]),
          applicabilityPolicy: z.string().trim().min(1).max(240).optional(),
        }),
      )
      .refine((value) => Object.keys(value).every((key) => key in MANUAL_ACTIVITIES)),
    // S251 R-S251-6: "Rent for this renewal" on this cycle; absent on records made before S251.
    rentChoice: staff
      .extend({ choice: z.enum(["keep_current", "propose_change"]) })
      .nullable()
      .optional(),
    completion: staff.nullable(),
    preparation: z
      .object({
        market: RenewalMarketBasisSchema.extend({
          compScreenshotRef: z
            .string()
            .regex(/^drive:[A-Za-z0-9_-]{10,200}$/)
            .optional(),
        }),
        source: z.string(),
        analysisReference: z.string().optional(),
        observationId: z.string().uuid().optional(),
        recordedAt: z.string().datetime(),
        recordedByUid: z.string(),
        revision: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
    sourceUpdates: z.record(
      z.string(),
      z
        .object({
          eventId: z.string(),
          intent: SheetFieldIntentSchema,
          state: z.enum(["pending", "prepared", "verified", "unavailable"]),
          proposalId: z.string().optional(),
          executionId: z.string().optional(),
          reason: z.string().optional(),
          // S248 R-S248-11: a value from the app's own confirmed send, bound to that message.
          derivedFrom: z
            .object({
              sequenceId: z.string().min(1).max(128),
              occurrenceId: z.string().regex(/^[0-9a-f]{64}$/),
            })
            .strict()
            .optional(),
        })
        .strict(),
    ),
    // S282 R-S282-1/3: the off-cycle end date reviews on this cycle, oldest first; absent on
    // records made before S282. Each names the exact end date value it reviewed.
    endDateReviews: z
      .array(
        z
          .object({
            eventId: z.string().min(1),
            cycleId: z.string().uuid(),
            endDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            decision: z.enum(OFF_CYCLE_DECISIONS),
            reason: z.string().trim().min(1).max(OFF_CYCLE_REASON_MAX),
            actorUid: z.string().min(1),
            actorLabel: z.string().min(1),
            recordedAt: z.string().datetime(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
const leaseBoundStateSchema = stateSchema.extend({ basis: LeaseBoundBasisSchema });
export { stateSchema as RenewalWorkspaceStateSchema };
export const SaveRenewalWorkspaceSchema = z
  .object({
    leaseId,
    // S154: null when the editor holds no work record yet; the first save establishes it.
    cycleId: z.string().uuid().nullable(),
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
    action: RenewalWorkspaceActionSchema,
    /**
     * S264 R-S264-6: the exact offer the answer covers, recorded in its own collection with the
     * answer: a tenant decision's confirmed send or verified external offer (or that it has no
     * one exact offer), or the reviewed offer an owner approval of the exact terms covers.
     */
    offer: OfferAnswerInputSchema.optional(),
  })
  .strict();
export const StartRenewalCycleSchema = z
  .object({
    leaseId,
    expectedCycleId: z.string().uuid().nullable(),
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
    basis: CycleBasisSchema,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export function renewalWorkspaceDocId(id: string) {
  return createHash("sha256").update(leaseId.parse(id)).digest("hex");
}
function assertActor(actor: AuthenticatedUser, write = false) {
  if (write) assertMutationAllowed(requireEnvironmentDescriptor());
  if (
    !can(actor.role, write ? "edit" : "read") ||
    (write && isVerificationAccount(actor))
  )
    throw new EditableLayerError("Renewals staff authority is required.", 403);
}
function parseAnyState(raw: unknown): RenewalWorkspaceState {
  return (raw as { basis?: { kind?: unknown } } | null)?.basis?.kind === "lease_bound"
    ? leaseBoundStateSchema.parse(raw)
    : stateSchema.parse(raw);
}
function parseState(raw: unknown, id: string): RenewalWorkspaceState {
  const state = parseAnyState(raw);
  if (state.leaseId !== id)
    throw new EditableLayerError(
      "The saved workspace identity does not match this lease.",
      409,
    );
  return state;
}
/** Both work-record heads of one lease, for a reader that needs them inside its transaction. */
export function renewalWorkspaceHeadRefs(db: Firestore, id: string) {
  return headRefs(db, id);
}
/** The current work record from both head snapshots: a dated cycle first, else lease-bound. */
export function currentRenewalWorkspaceState(
  db: Firestore,
  id: string,
  dated: FirebaseFirestore.DocumentSnapshot,
  leaseBound: FirebaseFirestore.DocumentSnapshot,
): RenewalWorkspaceState | null {
  return currentHead(headRefs(db, id), dated, leaseBound, id)?.state ?? null;
}
function headRefs(db: Firestore, id: string) {
  const docId = renewalWorkspaceDocId(id);
  return {
    dated: db.collection(RENEWAL_WORKSPACE_COLLECTIONS.head).doc(docId),
    leaseBound: db.collection(RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead).doc(docId),
  };
}
/** The current head: a dated cycle when one exists, otherwise the lease-bound record. */
function currentHead(
  refs: ReturnType<typeof headRefs>,
  dated: FirebaseFirestore.DocumentSnapshot,
  leaseBound: FirebaseFirestore.DocumentSnapshot,
  id: string,
) {
  if (dated.exists) return { ref: refs.dated, state: parseState(dated.data(), id) };
  if (leaseBound.exists)
    return { ref: refs.leaseBound, state: parseState(leaseBound.data(), id) };
  return null;
}
export async function getRenewalWorkspace(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalWorkspaceState | null> {
  assertActor(actor);
  const refs = headRefs(db, id);
  const [dated, leaseBound] = await Promise.all([
    refs.dated.get(),
    refs.leaseBound.get(),
  ]);
  return currentHead(refs, dated, leaseBound, id)?.state ?? null;
}
export async function listRenewalWorkspaces(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
) {
  assertActor(actor);
  const [dated, leaseBound] = await Promise.all([
    db.collection(RENEWAL_WORKSPACE_COLLECTIONS.head).get(),
    db.collection(RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead).get(),
  ]);
  const result = new Map<string, RenewalWorkspaceState>();
  // Lease-bound records first so a dated cycle established later takes their place.
  for (const doc of [...leaseBound.docs, ...dated.docs]) {
    const state = parseAnyState(doc.data());
    if (doc.id !== renewalWorkspaceDocId(state.leaseId))
      throw new EditableLayerError("A saved workspace identity is invalid.", 409);
    result.set(state.leaseId, state);
  }
  return result;
}
export async function listRenewalWorkspaceActivity(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
) {
  assertActor(actor);
  leaseId.parse(id);
  const result = await db
    .collection(RENEWAL_WORKSPACE_COLLECTIONS.activity)
    .where("lease_id", "==", id)
    .get();
  return result.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) =>
      String((a as Record<string, unknown>).recorded_at).localeCompare(
        String((b as Record<string, unknown>).recorded_at),
      ),
    );
}
/** Exact identity is resolved from current source before starting; old provider progress is untouched. */
export async function startRenewalCycle(
  actor: AuthenticatedUser,
  raw: unknown,
  verifiedBasis: RenewalCycleBasis,
  db: Firestore = getAdminFirestore(),
) {
  assertActor(actor, true);
  const input = StartRenewalCycleSchema.parse(raw);
  if (
    hashExecutionPreview(input.basis) !==
    hashExecutionPreview(CycleBasisSchema.parse(verifiedBasis))
  )
    throw new EditableLayerError(
      "The reviewed cycle context changed. Refresh and review it.",
      409,
    );
  const requestHash = hashExecutionPreview({ actorUid: actor.uid, ...input });
  const head = db
    .collection(RENEWAL_WORKSPACE_COLLECTIONS.head)
    .doc(renewalWorkspaceDocId(input.leaseId));
  const event = db
    .collection(RENEWAL_WORKSPACE_COLLECTIONS.activity)
    .doc(input.operationId);
  const refs = headRefs(db, input.leaseId);
  await db.runTransaction(async (tx) => {
    const [snapshot, leaseBound, prior] = await Promise.all([
      tx.get(head),
      tx.get(refs.leaseBound),
      tx.get(event),
    ]);
    if (prior.exists) {
      if (prior.get("request_hash") !== requestHash)
        throw new EditableLayerError("The cycle request changed.", 409);
      return;
    }
    const current = snapshot.exists ? parseState(snapshot.data(), input.leaseId) : null;
    if (
      (current?.cycleId ?? null) !== input.expectedCycleId ||
      (current?.revision ?? 0) !== input.expectedRevision
    )
      throw new EditableLayerError(
        "The current cycle changed. Reload before starting another.",
        409,
      );
    // S262 R-S262-5: the new cycle names the one it replaces, so earlier future terms stay history.
    const replaced =
      current ?? currentHead(refs, snapshot, leaseBound, input.leaseId)?.state ?? null;
    const next = {
      ...emptyRenewalWorkspace(input.leaseId, input.operationId, verifiedBasis),
      previousCycleId: replaced?.cycleId ?? null,
    };
    const now = new Date().toISOString();
    tx.set(head, next);
    tx.create(
      db.collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles).doc(input.operationId),
      next,
    );
    tx.create(event, {
      lease_id: input.leaseId,
      cycle_id: next.cycleId,
      actor_uid: actor.uid,
      recorded_at: now,
      request_hash: requestHash,
      action: { kind: "start_cycle", basis: verifiedBasis, reason: input.reason },
      previous_cycle_id: current?.cycleId ?? null,
      next_state: next,
    });
  });
  return { state: await getRenewalWorkspace(actor, input.leaseId, db) };
}
/** The basis recorded when no source basis can be resolved: lease-bound, with no date. */
export const LEASE_BOUND_WORK_BASIS: RenewalWorkBasis = Object.freeze({
  kind: "lease_bound",
  source: "No lease end or review date was available when this work was first saved",
});
/**
 * S154: whether saved work on a completed record belongs to a new cycle. Only a real, different
 * source date starts one; an unresolved or unchanged basis keeps the existing record.
 */
function startsNewCycle(current: RenewalWorkspaceState, basis: RenewalWorkBasis | null) {
  const nextDate = basis ? workBasisDateIso(basis) : null;
  return Boolean(
    current.completion && nextDate && nextDate !== workBasisDateIso(current.basis),
  );
}
/** S234 R-S234-1: one owner of record from the lease's current source read. */
export interface OwnerRosterEntry {
  readonly label: string;
  readonly sourceRef: string;
}
/** S234 R-S234-1: how the store checks an approval's party against the current owner roster. */
export interface OwnerApprovalVerification {
  /** The current source read's owners; null when the roster cannot be read. */
  readonly ownerRoster: () => Promise<readonly OwnerRosterEntry[] | null>;
}
/**
 * PR #162 review: one fingerprint for the roster an approval form showed. Source references are
 * field paths, so a replaced or reordered owner keeps a path; the fingerprint and the label bind the
 * choice to the people staff actually saw.
 */
export function ownerRosterFingerprint(roster: readonly OwnerRosterEntry[]): string {
  return createHash("sha256")
    .update(JSON.stringify(roster.map((entry) => [entry.sourceRef, entry.label])))
    .digest("hex");
}
const ROSTER_CHANGED =
  "The lease's owner list changed since this page was opened, so the approval was not recorded. Reload the lease and choose who approved again.";
const ROSTER_UNREADABLE =
  "The lease's current owner list could not be read, so the approval was not recorded. Refresh the lease data and record it again.";

/**
 * Atomic optimistic concurrency + immutable request identity. No provider receipt or completion
 * flag. S154: the first actual save establishes the work record from the lease's real basis, so no
 * cycle step precedes ordinary recording; opening a lease creates nothing.
 */
export async function saveRenewalWorkspace(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
  resolveBasis?: () => Promise<RenewalWorkBasis | null>,
  verifyApproval?: OwnerApprovalVerification,
  /** S264 R-S264-6: the current tenant offer, read fresh for an owner approval of its charges. */
  verifyOffer?: {
    readonly currentOfferSnapshot: () => Promise<FrozenOfferSnapshot | null>;
  },
) {
  assertActor(actor, true);
  const input = SaveRenewalWorkspaceSchema.parse(raw),
    requestHash = hashExecutionPreview({ actorUid: actor.uid, ...input });
  // S264 R-S264-6: an answer names its exact offer only on the answer itself, and an amount-only
  // owner answer never covers the offer's charges.
  if (
    input.offer &&
    input.action.kind !== "tenant_response" &&
    input.action.kind !== "owner_response"
  )
    throw new EditableLayerError("Only an owner or tenant answer covers an offer.", 400);
  if (
    input.offer?.kind === "owner_reviewed_offer" &&
    input.action.kind === "owner_response" &&
    input.action.approvedBase?.scope === "amount_only"
  )
    throw new EditableLayerError(
      "Base rent only covers the amount alone. To record that the owner approved the offer's charges, record the exact terms.",
      400,
    );
  const reviewedOffer =
    input.offer?.kind === "owner_reviewed_offer"
      ? ((await verifyOffer?.currentOfferSnapshot().catch(() => null)) ?? null)
      : null;
  if (input.offer?.kind === "owner_reviewed_offer" && !reviewedOffer)
    throw new EditableLayerError(
      "The current offer charges could not be read, so the owner's approval of them was not recorded. Your entries are kept; reload and review the offer charges again.",
      409,
    );
  // S234 R-S234-1: an approval's party is one owner from the lease's current source read, or a
  // named representative; the roster is read before the transaction and an unreadable roster
  // records nothing. A linked reply is checked inside the transaction below.
  const approvalInput =
    input.action.kind === "owner_response" && input.action.outcome === "approved_terms"
      ? input.action.approval
      : undefined;
  let verifiedParty: OwnerApprovalEvidence["party"] | null = null;
  if (approvalInput && !missingOwnerApprovalItems(approvalInput)) {
    const roster = await verifyApproval?.ownerRoster().catch(() => null);
    if (!roster) throw new EditableLayerError(ROSTER_UNREADABLE, 409);
    const party = approvalInput.party!;
    if (party.kind === "owner") {
      if (ownerRosterFingerprint(roster) !== party.rosterFingerprint)
        throw new EditableLayerError(ROSTER_CHANGED, 409);
      const owner = roster.find((entry) => entry.sourceRef === party.sourceRef);
      if (!owner)
        throw new EditableLayerError(
          "Choose an owner from this lease's current owner list, or Authorized representative with a name and capacity.",
          409,
        );
      if (owner.label !== party.label) throw new EditableLayerError(ROSTER_CHANGED, 409);
      verifiedParty = { kind: "owner", label: owner.label, sourceRef: owner.sourceRef };
    } else verifiedParty = party;
  }
  const refs = headRefs(db, input.leaseId),
    event = db.collection(RENEWAL_WORKSPACE_COLLECTIONS.activity).doc(input.operationId);
  // The source basis is read before the transaction: only when no record exists yet, or when new
  // work arrives on a completed record. Reopening or completing stays on the record it names.
  const [preDated, preLeaseBound] = await Promise.all([
    refs.dated.get(),
    refs.leaseBound.get(),
  ]);
  const pre = currentHead(refs, preDated, preLeaseBound, input.leaseId);
  const continuesRecord =
    input.action.kind === "reopen" || input.action.kind === "complete";
  let sourceBasis: RenewalWorkBasis | null = null;
  if (!pre || (pre.state.completion && !continuesRecord)) {
    try {
      sourceBasis = (await resolveBasis?.()) ?? null;
    } catch {
      // An unavailable source never blocks the save or supplies a guessed date.
      sourceBasis = null;
    }
  }
  const duplicate = await db.runTransaction(async (tx) => {
    const [dated, leaseBound, prior] = await Promise.all([
      tx.get(refs.dated),
      tx.get(refs.leaseBound),
      tx.get(event),
    ]);
    if (prior.exists) {
      if (prior.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This recorded request changed. Reload before correcting it.",
          409,
        );
      return true;
    }
    const head = currentHead(refs, dated, leaseBound, input.leaseId);
    const current = head?.state ?? null;
    if (
      (current?.cycleId ?? null) !== input.cycleId ||
      (current?.revision ?? 0) !== input.expectedRevision
    )
      throw new EditableLayerError(
        "Another operator changed this record. Your entry is kept; reload and review the current record.",
        409,
      );
    const now = new Date().toISOString();
    const establish =
      !current || (!continuesRecord && startsNewCycle(current, sourceBasis));
    const basis = sourceBasis ?? LEASE_BOUND_WORK_BASIS;
    // S262 R-S262-5: an established cycle names the one it replaces (null for the first).
    const base = establish
      ? {
          ...emptyRenewalWorkspace(input.leaseId, randomUUID(), basis),
          previousCycleId: current?.cycleId ?? null,
        }
      : current;
    const cycleId = base.cycleId;
    // S66 (AC-S66-8): an owner approval covers the exact Working terms and calculated charges
    // current as it is recorded. They are read here, in the same transaction, never from the page.
    let approvedWorkingTerms: ApprovedWorkingTerms | null = null;
    // S262 R-S262-2 (ARCH-S262-2): an answer with an Amount approved writes the approved working
    // base, and preserves Rent to recommend, in this same transaction or not at all.
    let approvedBase: ApprovedBase | null = null;
    let workingChange: ApprovedBaseWorkingChange | null = null;
    if (
      input.action.kind === "owner_response" &&
      input.action.outcome === "approved_terms"
    ) {
      const [workingSnapshot, packetInputs, chargePolicy] = await Promise.all([
        tx.get(renewalWorkingRecordRef(db, input.leaseId)),
        readPacketInputsIn(tx, db, input.leaseId),
        readChargePolicyIn(tx, db),
      ]);
      const stored = workingSnapshot.exists
        ? parseRenewalWorkingRecord(workingSnapshot.data(), input.leaseId)
        : null;
      // S262 R-S262-5: only the Working terms current for this cycle can be approved.
      const projected = projectCurrentCycleWorkingRecord(stored, base);
      const amount = input.action.approvedBase;
      if (amount) {
        if (
          storedWorkingRevision(projected, "terms_rent") !==
            amount.expectedWorkingRevision ||
          storedWorkingRevision(projected, "recommended_rent") !==
            amount.expectedRecommendationRevision
        )
          throw new EditableLayerError(
            "Rent to recommend or the offer amount changed after you reviewed the owner's answer, so the answer was not saved. Your entries are kept; review the answer again.",
            409,
          );
        workingChange = planApprovedBaseChange({
          leaseId: input.leaseId,
          stored,
          projected,
          cycleId,
          amount: amount.amount,
          ownerResponseEventId: input.operationId,
          actor: { uid: actor.uid, label: actor.email },
          recordedAt: now,
          newEventId: randomUUID,
        });
        approvedBase = {
          amount: amount.amount,
          scope: amount.scope,
          cycleId,
          workingRevision: workingChange.workingRevision,
          recommended: workingChange.recommended,
        };
        if (amount.scope === "exact_terms") {
          // The owner approved the base and the renewal dates as they stand now.
          approvedWorkingTerms = captureApprovedWorkingTerms({
            leaseId: input.leaseId,
            working: projectCurrentCycleWorkingRecord(
              workingChange.record ?? stored,
              base,
            ),
            inputs: packetInputs,
            policy: chargePolicy,
          });
          if (!approvedWorkingTerms)
            throw new EditableLayerError(
              "Save the renewal start and end dates for this renewal before recording that the owner approved them. To record the amount alone, choose Base rent only.",
              409,
            );
        }
      } else
        approvedWorkingTerms = captureApprovedWorkingTerms({
          leaseId: input.leaseId,
          working: projected,
          inputs: packetInputs,
          policy: chargePolicy,
        });
    }
    // S234 R-S234-5: a tenant answer keeps the Working term revisions it answered, read here in
    // the same transaction, so a later terms save shows it answers earlier terms.
    let workingTermRevisions: WorkingTermRevisions | null = null;
    if (input.action.kind === "tenant_response") {
      const workingSnapshot = await tx.get(renewalWorkingRecordRef(db, input.leaseId));
      workingTermRevisions = currentWorkingTermRevisions(
        projectCurrentCycleWorkingRecord(
          workingSnapshot.exists
            ? parseRenewalWorkingRecord(workingSnapshot.data(), input.leaseId)
            : null,
          base,
        ),
      );
    }
    // S264 R-S264-6: the exact offer the answer covers, read and checked before any write.
    let offerAnswer: PreparedOfferAnswer | null = null;
    if (
      input.offer &&
      (input.action.kind === "tenant_response" || input.action.kind === "owner_response")
    )
      offerAnswer = await prepareOfferAnswerIn(tx, db, {
        leaseId: input.leaseId,
        cycleId,
        eventId: input.operationId,
        party: input.action.kind === "owner_response" ? "owner" : "tenant",
        outcome: input.action.outcome,
        answer: input.offer,
        actorUid: actor.uid,
        recordedAt: now,
        reviewedOffer,
      });
    let approvalEvidence: OwnerApprovalEvidence | null = null;
    if (approvalInput && verifiedParty) {
      const channel = approvalInput.channel!;
      let verifiedChannel: OwnerApprovalEvidence["channel"];
      if (channel.kind === "linked_reply") {
        // The reply must be a person's reply recorded on this lease's own owner renewal thread.
        const sequence = await tx.get(
          db
            .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
            .doc(channel.sequenceId),
        );
        const context = sequence.get("context") as
          | { entityType?: string; entityId?: string; purpose?: string }
          | undefined;
        const reply = (
          (sequence.get("inbound") as CommunicationInboundEvidence[] | undefined) ?? []
        ).find((entry) => entry.id === channel.evidenceId && entry.kind === "human");
        if (
          !sequence.exists ||
          context?.entityType !== "renewal_lease" ||
          context.entityId !== input.leaseId ||
          context.purpose !== "renewal_owner" ||
          !reply
        )
          throw new EditableLayerError(
            "Select a reply received in this lease's own owner renewal thread.",
            409,
          );
        verifiedChannel = {
          kind: "linked_reply",
          sequenceId: channel.sequenceId,
          senderEmail: reply.senderEmail,
          threadId: reply.threadId,
          messageId: reply.messageId,
          receivedAt: new Date(reply.receivedAtMs).toISOString(),
        };
      } else verifiedChannel = channel;
      approvalEvidence = {
        party: verifiedParty,
        channel: verifiedChannel,
        occurredAt: approvalInput.occurredAt!,
      };
    }
    const next = planRenewalWorkspaceAction(base, input.action, {
      eventId: input.operationId,
      actorUid: actor.uid,
      recordedAt: now,
      approvedWorkingTerms,
      approvalEvidence,
      workingTermRevisions,
      approvedBase,
      // S282 R-S282-1: a recorded review names the signed-in staff identity, read here.
      actorLabel: actor.email,
    });
    if (
      input.action.kind === "preparation" &&
      next.preparation &&
      input.action.observationId !== undefined
    ) {
      if (input.action.observationId === null) {
        delete next.preparation.market.provider;
        delete next.preparation.observationId;
      } else {
        const observation = await tx.get(
          db
            .collection(RENEWAL_WORKSPACE_COLLECTIONS.observations)
            .doc(input.action.observationId),
        );
        if (
          !observation.exists ||
          observation.get("lease_id") !== input.leaseId ||
          observation.get("cycle_id") !== cycleId ||
          observation.get("operation") !== "comps"
        )
          throw new EditableLayerError(
            "Select comp evidence retrieved for this exact lease and work record.",
            409,
          );
        const market = RenewalMarketBasisSchema.parse(observation.get("market"));
        if (!market.provider)
          throw new EditableLayerError(
            "This lookup did not return a usable provider basis. Retained preparation is unchanged.",
            409,
          );
        next.preparation.market = {
          ...next.preparation.market,
          provider: market.provider,
        };
        next.preparation.observationId = input.action.observationId;
      }
    }
    if (input.action.kind === "preparation" && input.action.trendObservationId) {
      const observation = await tx.get(
        db
          .collection(RENEWAL_WORKSPACE_COLLECTIONS.observations)
          .doc(input.action.trendObservationId),
      );
      if (
        !next.preparation?.market.provider ||
        !observation.exists ||
        observation.get("lease_id") !== input.leaseId ||
        observation.get("cycle_id") !== cycleId ||
        observation.get("operation") !== "trend" ||
        observation.get("comp_observation_id") !== next.preparation.observationId
      )
        throw new EditableLayerError(
          "Select a trend retrieved with these exact comps.",
          409,
        );
      const trend = observation.get("trend");
      if (trend)
        next.preparation.market.provider = RenewalMarketBasisSchema.parse({
          provider: { ...next.preparation.market.provider, trend },
        }).provider!;
    }
    if (input.action.kind === "preparation" && next.preparation) {
      const attachment = await resolveCurrentCompScreenshotAttachment(
        tx,
        db,
        input.leaseId,
      );
      delete next.preparation.market.compScreenshotRef;
      if (attachment) next.preparation.market.compScreenshotRef = attachment.ref;
    }
    const valid = parseState(next, input.leaseId);
    const target = valid.basis.kind === "lease_bound" ? refs.leaseBound : refs.dated;
    if (establish)
      // The prior cycle document and its activity stay exactly as recorded.
      tx.create(db.collection(RENEWAL_WORKSPACE_COLLECTIONS.activity).doc(randomUUID()), {
        lease_id: input.leaseId,
        cycle_id: cycleId,
        actor_uid: actor.uid,
        recorded_at: now,
        action: {
          kind: "start_cycle",
          basis: base.basis,
          reason: "Established by the first saved work",
        },
        previous_cycle_id: current?.cycleId ?? null,
        next_state: base,
      });
    if (workingChange?.record) {
      // S262 R-S262-2: the approved base and the preserved recommendation, with their activity.
      tx.set(
        renewalWorkingRecordRef(db, input.leaseId),
        RenewalWorkingRecordSchema.parse(workingChange.record),
      );
      for (const written of workingChange.events)
        tx.create(
          db.collection(RENEWAL_WORKING_RECORD_COLLECTIONS.activity).doc(written.id),
          { ...written.doc, request_hash: requestHash },
        );
    }
    const offerRecord = offerAnswer?.write(tx, approvedWorkingTerms) ?? null;
    tx.set(target, valid);
    tx.set(db.collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles).doc(cycleId), valid);
    tx.create(event, {
      lease_id: input.leaseId,
      cycle_id: cycleId,
      actor_uid: actor.uid,
      recorded_at: now,
      request_hash: requestHash,
      action: input.action,
      ...(offerRecord
        ? {
            offer_answer: {
              kind: offerRecord.attribution.kind,
              snapshot_id: offerRecord.offer?.snapshotId ?? null,
            },
          }
        : {}),
      previous_revision: base.revision,
      next_state: valid,
    });
    return false;
  });
  return {
    state: await getRenewalWorkspace(actor, input.leaseId, db),
    duplicate,
    // S264 R-S264-6: the recorded offer coverage, read back from its own record.
    ...(input.offer ? { offerAnswer: await readOfferAnswer(db, input.operationId) } : {}),
  };
}

/**
 * S154: the current work record, established empty when a deliberate save other than a staff
 * record needs one to bind to (saved comp evidence, a saved message). It follows the same basis
 * rule as the first recorded action and never replaces an existing record.
 */
export async function ensureRenewalWorkRecord(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
  resolveBasis?: () => Promise<RenewalWorkBasis | null>,
): Promise<RenewalWorkspaceState> {
  assertActor(actor, true);
  const existing = await getRenewalWorkspace(actor, id, db);
  if (existing) return existing;
  let sourceBasis: RenewalWorkBasis | null = null;
  try {
    sourceBasis = (await resolveBasis?.()) ?? null;
  } catch {
    sourceBasis = null;
  }
  const refs = headRefs(db, id);
  await db.runTransaction(async (tx) => {
    const [dated, leaseBound] = await Promise.all([
      tx.get(refs.dated),
      tx.get(refs.leaseBound),
    ]);
    if (currentHead(refs, dated, leaseBound, id)) return;
    // S262 R-S262-5: the lease's first work record; it replaces no earlier cycle.
    const base = parseState(
      {
        ...emptyRenewalWorkspace(id, randomUUID(), sourceBasis ?? LEASE_BOUND_WORK_BASIS),
        previousCycleId: null,
      },
      id,
    );
    tx.create(db.collection(RENEWAL_WORKSPACE_COLLECTIONS.activity).doc(randomUUID()), {
      lease_id: id,
      cycle_id: base.cycleId,
      actor_uid: actor.uid,
      recorded_at: new Date().toISOString(),
      action: {
        kind: "start_cycle",
        basis: base.basis,
        reason: "Established by the first saved work",
      },
      previous_cycle_id: null,
      next_state: base,
    });
    tx.set(base.basis.kind === "lease_bound" ? refs.leaseBound : refs.dated, base);
    tx.set(db.collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles).doc(base.cycleId), base);
  });
  const state = await getRenewalWorkspace(actor, id, db);
  if (!state)
    throw new EditableLayerError(
      "The work record could not be read back. Your entry is kept; save it again.",
      409,
    );
  return state;
}

/**
 * S248 R-S248-11: hold the operating Sheet value a derived outreach record prepares, exactly as a
 * staff record holds its value: pending until staff deliberately prepare it, then confirmed
 * separately. The caller has re-derived the record from the stored evidence. A staff value already
 * held for the field is never replaced; the same derived value again changes nothing.
 */
export async function recordDerivedSourceUpdate(
  actor: AuthenticatedUser,
  input: {
    leaseId: string;
    cycleId: string;
    eventId: string;
    intent: SheetFieldIntent;
    derivedFrom: { sequenceId: string; occurrenceId: string };
  },
  db: Firestore = getAdminFirestore(),
): Promise<RenewalWorkspaceState> {
  assertActor(actor, true);
  const refs = headRefs(db, input.leaseId);
  const audit = db.collection(RENEWAL_WORKSPACE_COLLECTIONS.activity).doc(randomUUID());
  return db.runTransaction(async (tx) => {
    const [dated, leaseBound] = await Promise.all([
      tx.get(refs.dated),
      tx.get(refs.leaseBound),
    ]);
    const located = currentHead(refs, dated, leaseBound, input.leaseId);
    const current = located?.state ?? null;
    if (!current || !located || current.cycleId !== input.cycleId)
      throw new EditableLayerError(
        "This lease's work record changed. Reload the current activity.",
        409,
      );
    const existing = current.sourceUpdates[input.intent.field];
    if (existing) {
      if (
        existing.eventId === input.eventId &&
        existing.derivedFrom?.occurrenceId === input.derivedFrom.occurrenceId
      )
        return current;
      throw new EditableLayerError(
        "A recorded value already holds this Sheet update. Prepare that one from Source updates.",
        409,
      );
    }
    const next = parseState(
      {
        ...current,
        revision: current.revision + 1,
        sourceUpdates: {
          ...current.sourceUpdates,
          [input.intent.field]: {
            eventId: input.eventId,
            intent: input.intent,
            state: "pending",
            derivedFrom: input.derivedFrom,
          },
        },
      },
      input.leaseId,
    );
    tx.set(located.ref, next);
    tx.set(db.collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles).doc(input.cycleId), next);
    tx.create(audit, {
      lease_id: input.leaseId,
      cycle_id: input.cycleId,
      actor_uid: actor.uid,
      recorded_at: new Date().toISOString(),
      action: {
        kind: "derived_source_update",
        field: input.intent.field,
        eventId: input.eventId,
        derivedFrom: input.derivedFrom,
      },
      previous_revision: current.revision,
    });
    return next;
  });
}
/** Server-derived source status, conditional on the same current staff event and cycle. */
export async function recordWorkspaceSourceStatus(
  actor: AuthenticatedUser,
  input: {
    leaseId: string;
    cycleId: string;
    field: string;
    eventId: string;
    update: Pick<
      RenewalWorkspaceState["sourceUpdates"][string],
      "state" | "proposalId" | "executionId" | "reason"
    >;
  },
  db: Firestore = getAdminFirestore(),
) {
  assertActor(actor, true);
  const refs = headRefs(db, input.leaseId);
  const audit = db.collection(RENEWAL_WORKSPACE_COLLECTIONS.activity).doc(randomUUID());
  await db.runTransaction(async (tx) => {
    const [dated, leaseBound] = await Promise.all([
      tx.get(refs.dated),
      tx.get(refs.leaseBound),
    ]);
    const located = currentHead(refs, dated, leaseBound, input.leaseId);
    const current = located?.state ?? null;
    const head = located?.ref ?? refs.dated;
    const entry = current?.sourceUpdates[input.field];
    if (
      !current ||
      current.cycleId !== input.cycleId ||
      !entry ||
      entry.eventId !== input.eventId
    )
      throw new EditableLayerError(
        "The staff fact changed while its source update was being prepared. Review the current record.",
        409,
      );
    const updated = {
      eventId: entry.eventId,
      intent: entry.intent,
      // S248 R-S248-11: a derived value keeps the message it is bound to through each status.
      ...(entry.derivedFrom ? { derivedFrom: entry.derivedFrom } : {}),
      ...input.update,
    };
    if (hashExecutionPreview(entry) === hashExecutionPreview(updated)) return;
    const next = parseState(
      {
        ...current,
        revision: current.revision + 1,
        sourceUpdates: { ...current.sourceUpdates, [input.field]: updated },
      },
      input.leaseId,
    );
    tx.set(head, next);
    tx.set(db.collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles).doc(input.cycleId), next);
    tx.create(audit, {
      lease_id: input.leaseId,
      cycle_id: input.cycleId,
      actor_uid: actor.uid,
      recorded_at: new Date().toISOString(),
      action: {
        kind: "source_update_status",
        field: input.field,
        eventId: input.eventId,
        ...input.update,
      },
      previous_revision: current.revision,
      next_state: next,
    });
  });
}
