// KB-owned persistence for the per-Space desk checklist (S13 Wave 2 / space-teeth E2b).
//
// One record per (run, step): the operator marks each process-definition step Unchecked / Checked /
// Skipped as they work a run. Keyed by a deterministic `${run_id}:${step_id}` doc id (natural-key
// upsert), with an append-only Activity twin — mirroring lib/firestore/lease-renewal-resolutions.ts.
//
// GOVERNANCE: this is app-plane bookkeeping gated at the `edit` capability (Editor+Approver+Admin),
// NOT the Admin-only write-back approval tier. It writes ONLY the KB's own Firestore collections and
// NEVER executes a system-of-record write or a send. `Skipped` requires a plain-English reason.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  ProcessDefinitionRecord,
  WorkflowRunRecord,
  WorkflowRunStepCheckActivityRecord,
  WorkflowRunStepCheckRecord,
  WorkflowRunStepCheckStatus,
} from "@/lib/firestore/types";
import {
  stepCheckDocId,
  WORKFLOW_RUN_STEP_CHECK_COLLECTIONS,
} from "@/lib/firestore/workflow-run-step-check-keys";

export { stepCheckDocId, WORKFLOW_RUN_STEP_CHECK_COLLECTIONS };

export const SetWorkflowRunStepCheckInputSchema = z.object({
  run_id: z.string().min(1),
  step_id: z.string().min(1),
  status: z.enum(["Unchecked", "Checked", "Skipped"]),
  // Free text; a blank/whitespace reason is treated as absent. `Skipped` requires a non-blank one
  // (enforced below), so the "reason required to skip" rule is the single source of truth.
  reason: z.string().optional(),
});
export type SetWorkflowRunStepCheckInput = z.input<
  typeof SetWorkflowRunStepCheckInputSchema
>;

/**
 * Set (upsert) one step check for a run. Requires the `edit` capability. Validates that the run
 * exists and that the step belongs to the run's process definition; `Skipped` requires a reason.
 * Writes the current-state doc (full set, idempotent by natural key) plus an append-only Activity
 * entry in one transaction. Never executes a system-of-record write.
 */
export async function setWorkflowRunStepCheck(
  actor: AuthenticatedUser,
  input: SetWorkflowRunStepCheckInput,
  db: Firestore = getAdminFirestore(),
): Promise<WorkflowRunStepCheckRecord> {
  assertCan(actor, "edit");
  const parsed = SetWorkflowRunStepCheckInputSchema.parse(input);
  const reason = parsed.reason?.trim() ? parsed.reason.trim() : undefined;

  if (parsed.status === "Skipped" && !reason) {
    throw new EditableLayerError("A reason is required to skip a step.", 400);
  }

  const docId = stepCheckDocId(parsed.run_id, parsed.step_id);
  const isMarked = parsed.status !== "Unchecked";

  await db.runTransaction(async (transaction) => {
    const runSnapshot = await transaction.get(
      db.collection("workflow_runs").doc(parsed.run_id),
    );
    if (!runSnapshot.exists) {
      throw new EditableLayerError("Workflow run not found.", 404);
    }
    const run = readRecord<WorkflowRunRecord>(runSnapshot.id, runSnapshot.data()!);
    if (["Completed", "Cancelled", "Failed"].includes(run.status)) {
      throw new EditableLayerError(
        "Checklist steps cannot be changed after a workflow run is closed.",
        409,
      );
    }

    const definitionSnapshot = await transaction.get(
      db.collection("process_definitions").doc(run.definition_id),
    );
    if (!definitionSnapshot.exists) {
      throw new EditableLayerError("Process definition not found.", 404);
    }
    const definition = readRecord<ProcessDefinitionRecord>(
      definitionSnapshot.id,
      definitionSnapshot.data()!,
    );
    const step = definition.steps.find((candidate) => candidate.id === parsed.step_id);
    if (!step) {
      throw new EditableLayerError(
        "That step is not part of this run's process definition.",
        400,
      );
    }

    const ref = checkRef(db, docId);
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() : undefined;
    const previousStatus = existing?.status as WorkflowRunStepCheckStatus | undefined;
    const createdAt = existing?.created_at ?? FieldValue.serverTimestamp();

    // Full set (no merge) so re-checking the same (run, step) overwrites rather than duplicates and
    // never leaves a stale reason/checked_by behind.
    transaction.set(
      ref,
      stripUndefined({
        id: docId,
        run_id: parsed.run_id,
        definition_id: run.definition_id,
        step_id: parsed.step_id,
        step_title: step.title,
        status: parsed.status,
        checked_by_uid: isMarked ? actor.uid : undefined,
        checked_at: isMarked ? FieldValue.serverTimestamp() : undefined,
        reason,
        created_at: createdAt,
        updated_at: FieldValue.serverTimestamp(),
      }),
    );

    const activityId = uuidv7();
    transaction.set(
      activityRef(db, activityId),
      stripUndefined({
        id: activityId,
        run_id: parsed.run_id,
        step_id: parsed.step_id,
        actor_uid: actor.uid,
        action: parsed.status,
        previous_status: previousStatus,
        new_status: parsed.status,
        reason,
        created_at: FieldValue.serverTimestamp(),
      }),
    );
  });

  const check = await getWorkflowRunStepCheck(actor, parsed.run_id, parsed.step_id, db);
  if (!check) {
    throw new EditableLayerError("Step check could not be read back after write.", 404);
  }
  return check;
}

export async function getWorkflowRunStepCheck(
  actor: AuthenticatedUser,
  runId: string,
  stepId: string,
  db: Firestore = getAdminFirestore(),
): Promise<WorkflowRunStepCheckRecord | null> {
  assertCan(actor, "read");
  const snapshot = await checkRef(db, stepCheckDocId(runId, stepId)).get();
  if (!snapshot.exists) return null;
  return readRecord<WorkflowRunStepCheckRecord>(snapshot.id, snapshot.data()!);
}

export async function listStepChecksForRun(
  actor: AuthenticatedUser,
  runId: string,
  db: Firestore = getAdminFirestore(),
): Promise<WorkflowRunStepCheckRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db
    .collection(WORKFLOW_RUN_STEP_CHECK_COLLECTIONS.checks)
    .where("run_id", "==", runId)
    .get();
  return snapshot.docs
    .map((doc) => readRecord<WorkflowRunStepCheckRecord>(doc.id, doc.data()))
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export async function listWorkflowRunStepCheckActivity(
  actor: AuthenticatedUser,
  runId: string,
  db: Firestore = getAdminFirestore(),
): Promise<WorkflowRunStepCheckActivityRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db
    .collection(WORKFLOW_RUN_STEP_CHECK_COLLECTIONS.activity)
    .where("run_id", "==", runId)
    .get();
  return snapshot.docs
    .map((doc) => readRecord<WorkflowRunStepCheckActivityRecord>(doc.id, doc.data()))
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function checkRef(db: Firestore, docId: string) {
  return db.collection(WORKFLOW_RUN_STEP_CHECK_COLLECTIONS.checks).doc(docId);
}

function activityRef(db: Firestore, docId: string) {
  return db.collection(WORKFLOW_RUN_STEP_CHECK_COLLECTIONS.activity).doc(docId);
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested step-check action.",
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
