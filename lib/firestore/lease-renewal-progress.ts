// KB-owned persistence for the Phase-A LIVE renewal PROGRESS state (the clickable front-to-back flow).
//
// One record per lease (docId = sanitized RentVine lease id) plus an append-only Activity trail. It holds
// ONLY the operator's own forward progress — the recorded owner decision, the tenant-offer draft id once
// created, and a complete flag. Every field is derived from operator action inside the auth boundary.
//
// GOVERNANCE: this layer changes NO system of record. RentVine stays GET-only and the Sheet stays
// read-only; recording a decision here never composes, sends, or writes back. The transition rules live
// in the pure lib/lease-renewal/renewal-progress.ts planners; this layer only reads/writes Firestore.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  LeaseRenewalProgressActivityRecord,
  LeaseRenewalProgressRecord,
} from "@/lib/firestore/types";
import {
  planMarkComplete,
  planRecordOwnerDecision,
  planRecordTenantOfferDraft,
  type RenewalOwnerDecision,
  type RenewalProgress,
  type RenewalProgressPlan,
} from "@/lib/lease-renewal/renewal-progress";

export const LEASE_RENEWAL_PROGRESS_COLLECTIONS = {
  progress: "lease_renewal_progress",
  progressActivity: "lease_renewal_progress_activity",
} as const;

type ProgressActivityAction = LeaseRenewalProgressActivityRecord["action"];

/** Record (or replace) the owner's rent decision for a lease, advancing it to the Tenant-offer step. */
export async function recordOwnerDecision(
  actor: AuthenticatedUser,
  leaseId: string,
  decision: RenewalOwnerDecision,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalProgress> {
  return applyTransition(
    actor,
    leaseId,
    (current) => planRecordOwnerDecision(current, decision),
    "owner_decision",
    db,
  );
}

/** Stamp the created tenant-offer Gmail draft id and advance the lease to Build docs. */
export async function recordTenantOfferDraft(
  actor: AuthenticatedUser,
  leaseId: string,
  draftId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalProgress> {
  return applyTransition(
    actor,
    leaseId,
    (current) => planRecordTenantOfferDraft(current, draftId),
    "tenant_offer_drafted",
    db,
  );
}

/** Mark the renewal complete for a lease (operator confirms the process is done). */
export async function markRenewalComplete(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalProgress> {
  return applyTransition(
    actor,
    leaseId,
    (current) => planMarkComplete(current),
    "mark_complete",
    db,
  );
}

/** Read one lease's progress, or null when the operator has not touched it yet. Read-gated. */
export async function getRenewalProgress(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalProgress | null> {
  assertCan(actor, "read");
  const snapshot = await progressRef(db, progressDocId(leaseId)).get();
  if (!snapshot.exists) return null;
  return toRenewalProgress(readRecord(snapshot.id, snapshot.data()!));
}

/**
 * Read every progress record as a Map keyed by lease id, for the live desk's stage projection. Read-gated
 * and bounded — only leases an operator has actually touched carry a record, so this is a small read.
 */
export async function listAllRenewalProgress(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<Map<string, RenewalProgress>> {
  assertCan(actor, "read");
  const snapshot = await db.collection(LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress).get();
  const byLease = new Map<string, RenewalProgress>();
  for (const doc of snapshot.docs) {
    const progress = toRenewalProgress(readRecord(doc.id, doc.data()));
    byLease.set(progress.leaseId, progress);
  }
  return byLease;
}

/**
 * Shared transition core: edit-gate, read the current record inside a transaction, run the pure planner
 * (which validates and throws EditableLayerError on a bad/out-of-order move), then persist the new state
 * plus an append-only Activity row. Reads the record back so the caller returns the canonical shape.
 */
async function applyTransition(
  actor: AuthenticatedUser,
  leaseId: string,
  plan: (current: RenewalProgress | null) => RenewalProgressPlan,
  action: ProgressActivityAction,
  db: Firestore,
): Promise<RenewalProgress> {
  assertCan(actor, "edit");
  const trimmedLeaseId = leaseId.trim();
  if (trimmedLeaseId === "") {
    throw new EditableLayerError("A lease id is required.", 400);
  }
  const docId = progressDocId(trimmedLeaseId);

  await db.runTransaction(async (transaction) => {
    const ref = progressRef(db, docId);
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists
      ? toRenewalProgress(readRecord(snapshot.id, snapshot.data()!))
      : null;
    const createdAt = snapshot.exists
      ? (snapshot.get("created_at") ?? FieldValue.serverTimestamp())
      : FieldValue.serverTimestamp();

    const next = plan(current);

    // Full set (no merge) so a re-recorded decision never leaves a stale draft id or charges behind.
    transaction.set(
      ref,
      stripUndefined({
        id: docId,
        lease_id: trimmedLeaseId,
        stage_index: next.stageIndex,
        owner_decision: next.ownerDecision
          ? stripUndefined({
              decision: next.ownerDecision.decision,
              offered_rent: next.ownerDecision.offeredRent,
              charges: next.ownerDecision.charges,
              info_form_url: next.ownerDecision.infoFormUrl,
              market: next.ownerDecision.market
                ? stripUndefined({
                    zillow_low: next.ownerDecision.market.zillowLow,
                    zillow_high: next.ownerDecision.market.zillowHigh,
                    pmi_number: next.ownerDecision.market.pmiNumber,
                    comps_url: next.ownerDecision.market.compsUrl,
                    comp_screenshot_ref: next.ownerDecision.market.compScreenshotRef,
                    comp_source: next.ownerDecision.market.compSource,
                    comp_retrieved_at: next.ownerDecision.market.compRetrievedAt,
                  })
                : undefined,
            })
          : undefined,
        tenant_offer_draft_id: next.tenantOfferDraftId ?? undefined,
        complete: next.complete,
        updated_by_uid: actor.uid,
        created_at: createdAt,
        updated_at: FieldValue.serverTimestamp(),
      }),
    );

    const activityId = uuidv7();
    transaction.set(
      activityRef(db, activityId),
      stripUndefined({
        id: activityId,
        lease_id: trimmedLeaseId,
        actor_uid: actor.uid,
        action,
        stage_index: next.stageIndex,
        created_at: FieldValue.serverTimestamp(),
      }),
    );
  });

  const saved = await getRenewalProgress(actor, trimmedLeaseId, db);
  if (!saved) {
    throw new EditableLayerError("Progress could not be read back after write.", 404);
  }
  return saved;
}

/** Deterministic, Firestore-safe doc id derived from the RentVine lease id. */
export function progressDocId(leaseId: string): string {
  return leaseId.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}

function progressRef(db: Firestore, docId: string) {
  return db.collection(LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress).doc(docId);
}

function activityRef(db: Firestore, docId: string) {
  return db.collection(LEASE_RENEWAL_PROGRESS_COLLECTIONS.progressActivity).doc(docId);
}

/** Project the persisted (snake_case) record onto the app-shaped RenewalProgress. */
function toRenewalProgress(record: LeaseRenewalProgressRecord): RenewalProgress {
  const decision = record.owner_decision;
  return {
    leaseId: record.lease_id,
    stageIndex: record.stage_index,
    ownerDecision: decision
      ? {
          decision: decision.decision,
          offeredRent: decision.offered_rent,
          ...(decision.charges ? { charges: decision.charges } : {}),
          ...(decision.info_form_url ? { infoFormUrl: decision.info_form_url } : {}),
          ...(decision.market
            ? {
                market: {
                  ...(decision.market.zillow_low !== undefined
                    ? { zillowLow: decision.market.zillow_low }
                    : {}),
                  ...(decision.market.zillow_high !== undefined
                    ? { zillowHigh: decision.market.zillow_high }
                    : {}),
                  ...(decision.market.pmi_number !== undefined
                    ? { pmiNumber: decision.market.pmi_number }
                    : {}),
                  ...(decision.market.comps_url !== undefined
                    ? { compsUrl: decision.market.comps_url }
                    : {}),
                  ...(decision.market.comp_screenshot_ref !== undefined
                    ? { compScreenshotRef: decision.market.comp_screenshot_ref }
                    : {}),
                  ...(decision.market.comp_source !== undefined
                    ? { compSource: decision.market.comp_source }
                    : {}),
                  ...(decision.market.comp_retrieved_at !== undefined
                    ? { compRetrievedAt: decision.market.comp_retrieved_at }
                    : {}),
                },
              }
            : {}),
        }
      : null,
    tenantOfferDraftId: record.tenant_offer_draft_id ?? null,
    complete: record.complete === true,
  };
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested lease-renewal action.",
      403,
    );
  }
}

function readRecord(
  id: string,
  data: Record<string, unknown>,
): LeaseRenewalProgressRecord {
  return normalizeFirestoreValue({ ...data, id }) as LeaseRenewalProgressRecord;
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
