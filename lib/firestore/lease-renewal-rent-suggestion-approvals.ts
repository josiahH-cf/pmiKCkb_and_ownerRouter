// KB-owned persistence for the Lease Renewal comp-derived rent-suggestion APPROVAL control plane
// (S29, D-RENT-SUGGEST). The app computes a comp-derived SUGGESTED renewal rent number SERVER-SIDE from
// the lease's own captured comp basis (never a client-supplied figure); an Admin then Approves (authorizes
// placing that exact number in the owner-notice draft) or Returns it here. Only the human decision and its
// append-only Activity persist, keyed by lease id.
//
// GOVERNANCE: this layer NEVER executes a send or a system-of-record write. Approving records human
// authorization to place the number in a DRAFT; a human still reviews and sends. Every record carries
// `production_allowed:false` and `executed:false`, and the reachable states are the approval FSM's
// non-executing subset (rent-suggestion-approval.ts). Admin-only: authorizing an owner-money number is
// strictly more sensitive than any read (manageAdmin). The approved number is recomputed and re-verified
// on every decision and every read, so a changed comp basis makes a prior approval stale by construction —
// a different number is NEVER silently authorized.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getRenewalProgress } from "@/lib/firestore/lease-renewal-progress";
import type {
  LeaseRenewalRentSuggestionApprovalActivityRecord,
  LeaseRenewalRentSuggestionApprovalRecord,
  LeaseRenewalRentSuggestionComp,
} from "@/lib/firestore/types";
import { DECISION_REASON_CODES } from "@/lib/lease-renewal/reason-codes";
import {
  compsFromMarketBasis,
  computeRentSuggestion,
  type RentSuggestion,
} from "@/lib/lease-renewal/rent-suggestion";
import {
  planRentSuggestionApprovalDecision,
  RENT_SUGGESTION_AWAITING_APPROVAL,
  type RentSuggestionApprovalState,
} from "@/lib/lease-renewal/rent-suggestion-approval";

export const LEASE_RENEWAL_RENT_SUGGESTION_COLLECTIONS = {
  approvals: "lease_renewal_rent_suggestion_approvals",
  approvalActivity: "lease_renewal_rent_suggestion_approval_activity",
} as const;

export const DecideRentSuggestionApprovalInputSchema = z.object({
  lease_id: z.string().min(1),
  decision: z.enum(["approve", "return"]),
  // Every rent-number decision requires a plain-English reason (no code-only follow-on: owner money is
  // strictly more sensitive than a routine flag resolution).
  reason: z.string().trim().min(1, "A plain-English reason is required."),
  reason_code: z.enum(DECISION_REASON_CODES).optional(),
});
export type DecideRentSuggestionApprovalInput = z.input<
  typeof DecideRentSuggestionApprovalInputSchema
>;

/** The exact authorization the owner-draft composer and the draft-safety gate consume, server-resolved. */
export interface ApprovedRentSuggestion {
  approvalId: string;
  value: number;
  comps: LeaseRenewalRentSuggestionComp[];
}

/**
 * Recompute the lease's comp-derived rent suggestion SERVER-SIDE from its own captured comp basis. This is
 * the single authoritative source of the number — it is never taken from the client. Read-gated.
 */
export async function resolveLeaseRentSuggestion(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RentSuggestion> {
  assertCan(actor, "read");
  const progress = await getRenewalProgress(actor, leaseId, db);
  const market = progress?.ownerDecision?.market;
  const comps = market ? compsFromMarketBasis(market) : [];
  return computeRentSuggestion({ comps });
}

/**
 * Approve or return the computed rent suggestion for a lease (Admin-gated control plane). Recomputes the
 * suggestion server-side, refuses when there is no defensible number, validates the transition (rejecting
 * double-approve / re-return), upserts the decision (idempotent by lease id), and appends an append-only
 * Activity entry. A recompute that changed the value or the comp sources makes any prior approval stale, so
 * this treats it as a fresh decision rather than silently authorizing a different number. NEVER executes a
 * send or a system-of-record write.
 */
export async function decideRentSuggestionApproval(
  actor: AuthenticatedUser,
  input: DecideRentSuggestionApprovalInput,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseRenewalRentSuggestionApprovalRecord> {
  assertCan(actor, "manageAdmin");
  const parsed = DecideRentSuggestionApprovalInputSchema.parse(input);
  const leaseId = parsed.lease_id.trim();
  if (leaseId === "") {
    throw new EditableLayerError("A lease id is required.", 400);
  }

  const suggestion = await resolveLeaseRentSuggestion(actor, leaseId, db);
  if (suggestion.status !== "suggested" || suggestion.suggestedRent === null) {
    throw new EditableLayerError(
      "There is no suggested rent number to decide for this lease. Capture comp data first.",
      400,
    );
  }
  const value = suggestion.suggestedRent;
  const comps = suggestion.comps.map(toStoredComp);

  const docId = approvalDocId(leaseId);

  // Read the existing approval, validate the transition, and write — all inside ONE transaction, so a
  // concurrent second Admin decision cannot both read "Awaiting Approval" and bypass the double-approve /
  // re-return guard. An illegal transition throws inside the transaction and aborts it.
  await db.runTransaction(async (transaction) => {
    const ref = approvalRef(db, docId);
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists
      ? (snapshot.data() as LeaseRenewalRentSuggestionApprovalRecord | undefined)
      : undefined;

    // A recompute that changed the value or the comp sources makes a prior approval stale: ignore it
    // (allow a fresh decision) rather than silently authorizing a different value.
    const stale = existing ? isStale(existing, value, comps) : false;
    const priorState: RentSuggestionApprovalState | undefined =
      existing && !stale ? existing.state : undefined;

    const plan = planRentSuggestionApprovalDecision(
      parsed.decision,
      priorState ?? RENT_SUGGESTION_AWAITING_APPROVAL,
    );
    const createdAt = existing?.created_at ?? FieldValue.serverTimestamp();

    // Full set (no merge) so a re-decision never leaves a stale value or sources behind.
    transaction.set(
      ref,
      stripUndefined({
        id: docId,
        lease_id: leaseId,
        state: plan.state,
        approved_value: value,
        approved_comps: comps,
        method: suggestion.method,
        reason: parsed.reason,
        reason_code: parsed.reason_code,
        decided_by_uid: actor.uid,
        production_allowed: plan.productionAllowed,
        executed: plan.executed,
        created_at: createdAt,
        updated_at: FieldValue.serverTimestamp(),
      }),
    );

    const activityId = uuidv7();
    transaction.set(
      activityRef(db, activityId),
      stripUndefined({
        id: activityId,
        lease_id: leaseId,
        actor_uid: actor.uid,
        action: parsed.decision,
        previous_state: priorState,
        new_state: plan.state,
        reason: parsed.reason,
        reason_code: parsed.reason_code,
        created_at: FieldValue.serverTimestamp(),
      }),
    );
  });

  const readback = await getRentSuggestionApproval(actor, leaseId, db);
  if (!readback) {
    throw new EditableLayerError("Approval could not be read back after write.", 404);
  }
  return readback;
}

export async function getRentSuggestionApproval(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseRenewalRentSuggestionApprovalRecord | null> {
  assertCan(actor, "read");
  const snapshot = await approvalRef(db, approvalDocId(leaseId)).get();
  if (!snapshot.exists) return null;
  return readRecord<LeaseRenewalRentSuggestionApprovalRecord>(
    snapshot.id,
    snapshot.data()!,
  );
}

/**
 * The exact approved number a DRAFT may carry, or null. Returns a value ONLY when a stored approval is in
 * the `Approved` state AND still matches the current server recompute (same value, same comp sources). A
 * changed comp basis (a different recomputed number) makes the approval stale, so this returns null and the
 * draft reverts to `Needs Verification`. This is the single server-side source the owner-draft composer and
 * the draft-safety gate consume; the number is never client-trusted.
 */
export async function getApprovedRentSuggestion(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<ApprovedRentSuggestion | null> {
  assertCan(actor, "read");
  const record = await getRentSuggestionApproval(actor, leaseId, db);
  if (!record || record.state !== "Approved") return null;
  const suggestion = await resolveLeaseRentSuggestion(actor, leaseId, db);
  if (suggestion.status !== "suggested" || suggestion.suggestedRent === null) return null;
  const comps = suggestion.comps.map(toStoredComp);
  if (isStale(record, suggestion.suggestedRent, comps)) return null;
  return {
    approvalId: record.id,
    value: record.approved_value,
    comps: record.approved_comps,
  };
}

export async function listRentSuggestionApprovalActivity(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseRenewalRentSuggestionApprovalActivityRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db
    .collection(LEASE_RENEWAL_RENT_SUGGESTION_COLLECTIONS.approvalActivity)
    .where("lease_id", "==", leaseId)
    .get();
  return snapshot.docs
    .map((doc) =>
      readRecord<LeaseRenewalRentSuggestionApprovalActivityRecord>(doc.id, doc.data()),
    )
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

/** Deterministic, Firestore-safe doc id derived from the RentVine lease id. */
export function approvalDocId(leaseId: string): string {
  return leaseId.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}

function toStoredComp(comp: {
  rent: number;
  source: string;
  label?: string;
}): LeaseRenewalRentSuggestionComp {
  const stored: LeaseRenewalRentSuggestionComp = { rent: comp.rent, source: comp.source };
  if (comp.label !== undefined) stored.label = comp.label;
  return stored;
}

/** Stable key for a comp set so a re-ordered or changed source list is detected as a different set. */
function compsKey(comps: readonly LeaseRenewalRentSuggestionComp[]): string {
  return comps.map((comp) => `${comp.rent}|${comp.source}|${comp.label ?? ""}`).join(";");
}

function isStale(
  existing: LeaseRenewalRentSuggestionApprovalRecord,
  value: number,
  comps: readonly LeaseRenewalRentSuggestionComp[],
): boolean {
  return (
    existing.approved_value !== value ||
    compsKey(existing.approved_comps ?? []) !== compsKey(comps)
  );
}

function approvalRef(db: Firestore, docId: string) {
  return db.collection(LEASE_RENEWAL_RENT_SUGGESTION_COLLECTIONS.approvals).doc(docId);
}

function activityRef(db: Firestore, docId: string) {
  return db
    .collection(LEASE_RENEWAL_RENT_SUGGESTION_COLLECTIONS.approvalActivity)
    .doc(docId);
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested rent-suggestion action.",
      403,
    );
  }
}

function readRecord<T>(id: string, data: Record<string, unknown>): T {
  return normalizeFirestoreValue({ ...data, id }) as T;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      return (toDate.call(value) as Date).toISOString();
    }
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
