// KB-owned persistence for the Lease Renewal Phase-1 resolution loop (connector design §3.5).
//
// The reconciliation FLAGS are recomputed deterministically from the run (simulation today); only a
// human RESOLUTION and its append-only Activity persist here, in the KB's own Firestore. The three
// resolution paths are: pick a source, enter a corrected value, or "flag is wrong / the sheet is
// already right". A required plain-English reason is captured for every path.
//
// GOVERNANCE: this layer NEVER executes a sheet / system-of-record write. A pick-a-source or
// corrected-value resolution only QUEUES a proposed write-back (`production_allowed: false`) for the
// future Phase-2 admin-enabled, per-write-button-press surface; nothing here writes to Sheets,
// Rentvine, Dotloop, Gmail, QuickBooks, or Boom.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  LeaseRenewalProposedWriteback,
  LeaseRenewalResolutionActivityRecord,
  LeaseRenewalResolutionKind,
  LeaseRenewalResolutionRecord,
  LeaseRenewalResolutionStatus,
  QueueRiskLevel,
} from "@/lib/firestore/types";
import { getSimulationRun } from "@/lib/lease-renewal/simulation";
import type { RenewalRunResult } from "@/lib/lease-renewal/pipeline";
import { DECISION_REASON_CODES } from "@/lib/lease-renewal/reason-codes";

export const LEASE_RENEWAL_COLLECTIONS = {
  resolutions: "lease_renewal_resolutions",
  resolutionActivity: "lease_renewal_resolution_activity",
} as const;

export const ResolveLeaseRenewalFlagInputSchema = z.object({
  run_id: z.string().min(1),
  source_trigger_key: z.string().min(1),
  kind: z.enum(["pick_source", "corrected_value", "flag_incorrect"]),
  chosen_source: z.string().min(1).optional(),
  corrected_value: z.string().min(1).optional(),
  reason: z.string().trim().min(1, "A plain-English reason is required."),
  // Additive enumerated reason code (S13 H2); optional so existing callers are unaffected.
  reason_code: z.enum(DECISION_REASON_CODES).optional(),
});
export type ResolveLeaseRenewalFlagInput = z.input<
  typeof ResolveLeaseRenewalFlagInputSchema
>;
type ParsedResolveInput = z.output<typeof ResolveLeaseRenewalFlagInputSchema>;

/** A flag, reduced to what the resolution planner needs. Decoupled from the reconciliation type. */
export interface ResolvableFlag {
  source_trigger_key: string;
  run_id: string;
  field_key: string;
  field_label: string;
  severity: QueueRiskLevel;
  candidate_sources: { source: string; value: string | number | boolean | null }[];
}

export interface ResolutionPlan {
  status: LeaseRenewalResolutionStatus;
  resolution_kind: LeaseRenewalResolutionKind;
  chosen_source?: string;
  corrected_value?: string;
  proposed_writeback?: LeaseRenewalProposedWriteback;
}

function stringifyValue(value: string | number | boolean | null): string {
  return value === null ? "" : String(value);
}

/**
 * Pure resolution planner (no I/O). Validates the kind-specific payload and derives the new status
 * plus the QUEUED (never executed) proposed write-back. Throws EditableLayerError on a bad payload.
 */
export function planLeaseRenewalResolution(
  flag: ResolvableFlag,
  input: ParsedResolveInput,
): ResolutionPlan {
  switch (input.kind) {
    case "pick_source": {
      if (!input.chosen_source) {
        throw new EditableLayerError("Pick a source requires a chosen source.", 400);
      }
      const chosen = flag.candidate_sources.find(
        (candidate) => candidate.source === input.chosen_source,
      );
      if (!chosen) {
        throw new EditableLayerError(
          "The chosen source is not one of this flag's candidates.",
          400,
        );
      }
      return {
        status: "Resolved",
        resolution_kind: "pick_source",
        chosen_source: chosen.source,
        proposed_writeback: {
          field_key: flag.field_key,
          value: stringifyValue(chosen.value),
          source_of_value: chosen.source,
          status: "Queued",
          production_allowed: false,
        },
      };
    }
    case "corrected_value": {
      if (!input.corrected_value) {
        throw new EditableLayerError("Enter a corrected value requires a value.", 400);
      }
      return {
        status: "Resolved",
        resolution_kind: "corrected_value",
        corrected_value: input.corrected_value,
        proposed_writeback: {
          field_key: flag.field_key,
          value: input.corrected_value,
          source_of_value: "corrected_value",
          status: "Queued",
          production_allowed: false,
        },
      };
    }
    case "flag_incorrect": {
      // "The flag is wrong / the sheet is already right" — no write-back; feeds the §5.3
      // false-positive rate. The required reason captures why the deterministic rule misfired.
      return { status: "Dismissed", resolution_kind: "flag_incorrect" };
    }
  }
}

function toResolvableFlag(
  run: RenewalRunResult,
  sourceTriggerKey: string,
): ResolvableFlag | null {
  const flag = run.flags.find(
    (outcome) => outcome.queueMapping?.queueItem.source_trigger_key === sourceTriggerKey,
  );
  if (!flag) return null;
  return {
    source_trigger_key: sourceTriggerKey,
    run_id: run.runId,
    field_key: flag.fieldKey,
    field_label: flag.fieldLabel,
    severity: flag.reconciliation.severity,
    candidate_sources: flag.reconciliation.candidates.map((candidate) => ({
      source: candidate.source,
      value: candidate.value,
    })),
  };
}

/**
 * Injectable run source so tests / a live runner can supply the run. May be async: the resolve route
 * injects a resolver that rebuilds the live-review run (a network read), so this awaits its result.
 */
export type RunResolver = (
  runId: string,
) => RenewalRunResult | null | Promise<RenewalRunResult | null>;

/**
 * Resolve one reconciliation flag (§3.5). Requires the Approver capability; a High or Blocked flag
 * requires an Admin. Upserts the resolution (idempotent by source_trigger_key) and appends an
 * append-only Activity entry. Never executes a system-of-record write.
 */
export async function resolveLeaseRenewalFlag(
  actor: AuthenticatedUser,
  input: ResolveLeaseRenewalFlagInput,
  db: Firestore = getAdminFirestore(),
  getRun: RunResolver = getSimulationRun,
): Promise<LeaseRenewalResolutionRecord> {
  assertCan(actor, "approve");
  const parsed = ResolveLeaseRenewalFlagInputSchema.parse(input);

  const run = await getRun(parsed.run_id);
  if (!run) throw new EditableLayerError("Renewal run was not found.", 404);

  const flag = toResolvableFlag(run, parsed.source_trigger_key);
  if (!flag) {
    throw new EditableLayerError("No open flag matches that key in this run.", 404);
  }

  if (
    (flag.severity === "High" || flag.severity === "Blocked") &&
    !can(actor.role, "manageAdmin")
  ) {
    throw new EditableLayerError(
      "High or Blocked flags can only be resolved by an Admin.",
      403,
    );
  }

  const plan = planLeaseRenewalResolution(flag, parsed);
  const docId = resolutionDocId(parsed.source_trigger_key);

  await db.runTransaction(async (transaction) => {
    const ref = resolutionRef(db, docId);
    const snapshot = await transaction.get(ref);
    const previousStatus = snapshot.exists
      ? (snapshot.get("status") as LeaseRenewalResolutionStatus | undefined)
      : undefined;
    const createdAt = snapshot.exists
      ? (snapshot.get("created_at") ?? FieldValue.serverTimestamp())
      : FieldValue.serverTimestamp();

    // Full set (no merge) so a re-resolution never leaves a stale proposed_writeback behind.
    transaction.set(
      ref,
      stripUndefined({
        id: docId,
        source_trigger_key: flag.source_trigger_key,
        run_id: flag.run_id,
        field_key: flag.field_key,
        field_label: flag.field_label,
        severity: flag.severity,
        status: plan.status,
        resolution_kind: plan.resolution_kind,
        chosen_source: plan.chosen_source,
        corrected_value: plan.corrected_value,
        reason: parsed.reason,
        reason_code: parsed.reason_code,
        resolved_by_uid: actor.uid,
        proposed_writeback: plan.proposed_writeback,
        created_at: createdAt,
        updated_at: FieldValue.serverTimestamp(),
      }),
    );

    const activityId = uuidv7();
    transaction.set(
      activityRef(db, activityId),
      stripUndefined({
        id: activityId,
        source_trigger_key: flag.source_trigger_key,
        run_id: flag.run_id,
        actor_uid: actor.uid,
        action: plan.resolution_kind,
        previous_status: previousStatus,
        new_status: plan.status,
        reason: parsed.reason,
        reason_code: parsed.reason_code,
        created_at: FieldValue.serverTimestamp(),
      }),
    );
  });

  const resolution = await getLeaseRenewalResolution(
    actor,
    parsed.source_trigger_key,
    db,
  );
  if (!resolution) {
    throw new EditableLayerError("Resolution could not be read back after write.", 404);
  }
  return resolution;
}

export async function getLeaseRenewalResolution(
  actor: AuthenticatedUser,
  sourceTriggerKey: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseRenewalResolutionRecord | null> {
  assertCan(actor, "read");
  const snapshot = await resolutionRef(db, resolutionDocId(sourceTriggerKey)).get();
  if (!snapshot.exists) return null;
  return readRecord<LeaseRenewalResolutionRecord>(snapshot.id, snapshot.data()!);
}

export async function listResolutionsForRun(
  actor: AuthenticatedUser,
  runId: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseRenewalResolutionRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db
    .collection(LEASE_RENEWAL_COLLECTIONS.resolutions)
    .where("run_id", "==", runId)
    .get();
  return snapshot.docs
    .map((doc) => readRecord<LeaseRenewalResolutionRecord>(doc.id, doc.data()))
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

/**
 * Read every resolution across all runs (S13 H1 metrics). Read-gated. Bounded by the small KB-owned
 * decision volume; the caller projects it to value-free counts only. Never returns to the client raw.
 */
export async function listAllLeaseRenewalResolutions(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseRenewalResolutionRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db.collection(LEASE_RENEWAL_COLLECTIONS.resolutions).get();
  return snapshot.docs.map((doc) =>
    readRecord<LeaseRenewalResolutionRecord>(doc.id, doc.data()),
  );
}

export async function listLeaseRenewalResolutionActivity(
  actor: AuthenticatedUser,
  sourceTriggerKey: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseRenewalResolutionActivityRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db
    .collection(LEASE_RENEWAL_COLLECTIONS.resolutionActivity)
    .where("source_trigger_key", "==", sourceTriggerKey)
    .get();
  return snapshot.docs
    .map((doc) => readRecord<LeaseRenewalResolutionActivityRecord>(doc.id, doc.data()))
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

/** Deterministic, Firestore-safe doc id derived from the (colon-bearing) source_trigger_key. */
export function resolutionDocId(sourceTriggerKey: string): string {
  return sourceTriggerKey.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function resolutionRef(db: Firestore, docId: string) {
  return db.collection(LEASE_RENEWAL_COLLECTIONS.resolutions).doc(docId);
}

function activityRef(db: Firestore, docId: string) {
  return db.collection(LEASE_RENEWAL_COLLECTIONS.resolutionActivity).doc(docId);
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested lease-renewal action.",
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
