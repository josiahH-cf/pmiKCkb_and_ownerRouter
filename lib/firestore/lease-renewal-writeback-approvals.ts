// KB-owned persistence for the Lease Renewal Phase-2 write-back APPROVAL control plane
// (Q-WRITEBACK-METHOD). A resolution QUEUES an append-only proposed write-back; an Admin then
// authorizes (Approve) or rejects (Return) that queued proposal here. Only the human decision and its
// append-only Activity persist, in the KB's own Firestore, keyed by the flag's source_trigger_key.
//
// GOVERNANCE: this layer NEVER executes a sheet / system-of-record write. Approving records human
// authorization for the future, separately-approved write; it does not perform it. Every record
// carries `production_allowed:false` and `executed:false`, and the reachable states are the audited
// FSM's non-executing subset (`writeback-approval.ts`). Admin-only: authorizing a write is strictly
// more sensitive than resolving a flag (OQ-APPR-1 — approve is an admin-tier function).

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  getLeaseRenewalResolution,
  resolutionDocId,
} from "@/lib/firestore/lease-renewal-resolutions";
import type {
  LeaseRenewalWritebackApprovalActivityRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import {
  planWritebackApprovalDecision,
  WRITEBACK_AWAITING_APPROVAL,
  type WritebackApprovalState,
} from "@/lib/lease-renewal/writeback-approval";

export const LEASE_RENEWAL_WRITEBACK_COLLECTIONS = {
  approvals: "lease_renewal_writeback_approvals",
  approvalActivity: "lease_renewal_writeback_approval_activity",
} as const;

export const DecideWritebackApprovalInputSchema = z.object({
  run_id: z.string().min(1),
  source_trigger_key: z.string().min(1),
  decision: z.enum(["approve", "return"]),
  reason: z.string().trim().min(1, "A plain-English reason is required."),
});
export type DecideWritebackApprovalInput = z.input<
  typeof DecideWritebackApprovalInputSchema
>;

// Bulk decisions share ONE mandatory reason across every selected proposal (S13 decision 2); the
// upper bound only guards against a runaway request — a run's queued proposals stay far below it.
export const DecideWritebackApprovalsBulkInputSchema = z.object({
  run_id: z.string().min(1),
  source_trigger_keys: z.array(z.string().min(1)).min(1).max(200),
  decision: z.enum(["approve", "return"]),
  reason: z.string().trim().min(1, "A plain-English reason is required."),
});
export type DecideWritebackApprovalsBulkInput = z.input<
  typeof DecideWritebackApprovalsBulkInputSchema
>;

/** Outcome of one proposal inside a bulk decision. Exactly one of `state`/`error` is present. */
export interface WritebackApprovalBulkItemResult {
  source_trigger_key: string;
  ok: boolean;
  /** The decided state when `ok` (mirrors the single-decision readback). */
  state?: LeaseRenewalWritebackApprovalRecord["state"];
  /** Plain-English failure for this one item when not `ok`; the others still proceed. */
  error?: string;
}

export interface WritebackApprovalBulkResult {
  results: WritebackApprovalBulkItemResult[];
  decided_count: number;
  failed_count: number;
}

/**
 * Approve or return a queued write-back proposal (§4.0 admin-gated control plane). Requires the
 * Admin capability. Reads the resolution to confirm a QUEUED proposal exists, validates the
 * transition (rejecting double-approve / re-return), upserts the decision (idempotent by
 * source_trigger_key), and appends an append-only Activity entry. A re-resolution that changed the
 * proposed value makes any prior approval stale, so this treats it as a fresh decision rather than
 * silently authorizing a different value. NEVER executes a system-of-record write.
 */
export async function decideWritebackApproval(
  actor: AuthenticatedUser,
  input: DecideWritebackApprovalInput,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseRenewalWritebackApprovalRecord> {
  assertCan(actor, "manageAdmin");
  const parsed = DecideWritebackApprovalInputSchema.parse(input);

  const resolution = await getLeaseRenewalResolution(
    actor,
    parsed.source_trigger_key,
    db,
  );
  if (!resolution) {
    throw new EditableLayerError(
      "No resolution exists for this flag. Resolve it before approving a write-back.",
      404,
    );
  }
  if (resolution.run_id !== parsed.run_id) {
    throw new EditableLayerError("This proposal belongs to a different run.", 400);
  }

  const proposal = resolution.proposed_writeback;
  if (resolution.status !== "Resolved" || !proposal || proposal.status !== "Queued") {
    throw new EditableLayerError(
      "There is no queued write-back proposal to approve for this flag.",
      400,
    );
  }

  const docId = resolutionDocId(parsed.source_trigger_key);

  // Read the existing approval, validate the transition, and write — all inside ONE transaction, so a
  // concurrent second Admin decision cannot both read "Awaiting Approval" and bypass the
  // double-approve / re-return guard. An illegal transition throws inside the transaction and aborts
  // it, so no duplicate record or Activity row lands.
  await db.runTransaction(async (transaction) => {
    const ref = approvalRef(db, docId);
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists
      ? (snapshot.data() as LeaseRenewalWritebackApprovalRecord | undefined)
      : undefined;

    // A re-resolution that changed the queued value makes a prior approval stale: ignore it (allow a
    // fresh decision) rather than silently authorizing a different value.
    const stale = existing
      ? existing.proposed_value !== proposal.value ||
        existing.source_of_value !== proposal.source_of_value
      : false;
    const priorState: WritebackApprovalState | undefined =
      existing && !stale ? existing.state : undefined;

    const plan = planWritebackApprovalDecision(
      parsed.decision,
      priorState ?? WRITEBACK_AWAITING_APPROVAL,
    );
    const createdAt = existing?.created_at ?? FieldValue.serverTimestamp();

    // Full set (no merge) so a re-decision never leaves stale snapshot fields behind.
    transaction.set(
      ref,
      stripUndefined({
        id: docId,
        source_trigger_key: parsed.source_trigger_key,
        run_id: resolution.run_id,
        field_key: resolution.field_key,
        field_label: resolution.field_label,
        severity: resolution.severity,
        state: plan.state,
        proposed_value: proposal.value,
        source_of_value: proposal.source_of_value,
        reason: parsed.reason,
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
        source_trigger_key: parsed.source_trigger_key,
        run_id: resolution.run_id,
        actor_uid: actor.uid,
        action: parsed.decision,
        previous_state: priorState,
        new_state: plan.state,
        reason: parsed.reason,
        created_at: FieldValue.serverTimestamp(),
      }),
    );
  });

  const readback = await getWritebackApproval(actor, parsed.source_trigger_key, db);
  if (!readback) {
    throw new EditableLayerError("Approval could not be read back after write.", 404);
  }
  return readback;
}

/**
 * Decide MANY queued proposals in one request with ONE shared mandatory reason (S13 B2). Runs the
 * existing single-proposal transaction per key, so every invariant holds unchanged per item: the
 * Admin gate, resolve-before-approve, the transition table, the stale-snapshot rule, and one
 * append-only Activity row per decision (each stamped with the shared reason + this decider). Items
 * are decided sequentially and independently: one item's failure (already approved, missing
 * resolution, wrong run) is reported for that item only and never blocks the rest. Never executes a
 * system-of-record write.
 */
export async function decideWritebackApprovalsBulk(
  actor: AuthenticatedUser,
  input: DecideWritebackApprovalsBulkInput,
  db: Firestore = getAdminFirestore(),
): Promise<WritebackApprovalBulkResult> {
  // Fail fast for non-Admins before touching any item (the per-item call re-asserts this).
  assertCan(actor, "manageAdmin");
  const parsed = DecideWritebackApprovalsBulkInputSchema.parse(input);

  // Dedupe while preserving order so a doubled key cannot record two Activity rows for one decision.
  const keys = [...new Set(parsed.source_trigger_keys)];

  const results: WritebackApprovalBulkItemResult[] = [];
  for (const key of keys) {
    try {
      const approval = await decideWritebackApproval(
        actor,
        {
          run_id: parsed.run_id,
          source_trigger_key: key,
          decision: parsed.decision,
          reason: parsed.reason,
        },
        db,
      );
      results.push({ source_trigger_key: key, ok: true, state: approval.state });
    } catch (error) {
      const message =
        error instanceof EditableLayerError
          ? error.message
          : "This decision could not be recorded.";
      results.push({ source_trigger_key: key, ok: false, error: message });
    }
  }

  const decided = results.filter((result) => result.ok).length;
  return {
    results,
    decided_count: decided,
    failed_count: results.length - decided,
  };
}

export async function getWritebackApproval(
  actor: AuthenticatedUser,
  sourceTriggerKey: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseRenewalWritebackApprovalRecord | null> {
  assertCan(actor, "read");
  const snapshot = await approvalRef(db, resolutionDocId(sourceTriggerKey)).get();
  if (!snapshot.exists) return null;
  return readRecord<LeaseRenewalWritebackApprovalRecord>(snapshot.id, snapshot.data()!);
}

export async function listWritebackApprovalsForRun(
  actor: AuthenticatedUser,
  runId: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseRenewalWritebackApprovalRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db
    .collection(LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvals)
    .where("run_id", "==", runId)
    .get();
  return snapshot.docs
    .map((doc) => readRecord<LeaseRenewalWritebackApprovalRecord>(doc.id, doc.data()))
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export async function listWritebackApprovalActivity(
  actor: AuthenticatedUser,
  sourceTriggerKey: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseRenewalWritebackApprovalActivityRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db
    .collection(LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvalActivity)
    .where("source_trigger_key", "==", sourceTriggerKey)
    .get();
  return snapshot.docs
    .map((doc) =>
      readRecord<LeaseRenewalWritebackApprovalActivityRecord>(doc.id, doc.data()),
    )
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

/**
 * Load the append-only approval Activity for a WHOLE run in ONE query, grouped by the flag's
 * source_trigger_key (never N per-flag reads). Each flag's trail is sorted oldest→newest (newest
 * last) so the run page can render a chronological history under its approval control. Read-only.
 */
export async function listWritebackApprovalActivityForRun(
  actor: AuthenticatedUser,
  runId: string,
  db: Firestore = getAdminFirestore(),
): Promise<Map<string, LeaseRenewalWritebackApprovalActivityRecord[]>> {
  assertCan(actor, "read");
  const snapshot = await db
    .collection(LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvalActivity)
    .where("run_id", "==", runId)
    .get();

  const byKey = new Map<string, LeaseRenewalWritebackApprovalActivityRecord[]>();
  for (const doc of snapshot.docs) {
    const record = readRecord<LeaseRenewalWritebackApprovalActivityRecord>(
      doc.id,
      doc.data(),
    );
    const trail = byKey.get(record.source_trigger_key);
    if (trail) {
      trail.push(record);
    } else {
      byKey.set(record.source_trigger_key, [record]);
    }
  }
  for (const trail of byKey.values()) {
    trail.sort((left, right) => left.created_at.localeCompare(right.created_at));
  }
  return byKey;
}

function approvalRef(db: Firestore, docId: string) {
  return db.collection(LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvals).doc(docId);
}

function activityRef(db: Firestore, docId: string) {
  return db.collection(LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvalActivity).doc(docId);
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested write-back approval action.",
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
