// App-owned persistence for the production Lease Renewal Test workspace.
//
// This server module writes only isolated Test run state plus bodyless Test attempts/receipts. It
// deliberately imports no Gmail, RentVine, Sheets, Dotloop, SMS, Boom, or external executor.

import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  buildLeaseTestActionEvidence,
  LEASE_TEST_ACTIONS,
  LEASE_TEST_ALIASES,
  LEASE_TEST_CONFIRMATION,
  LEASE_TEST_RUN_STATUSES,
  LEASE_TEST_SCENARIO,
  leaseTestActionDependencies,
  nextLeaseTestRunStatus,
  type LeaseTestActionAttempt,
  type LeaseTestActionReceipt,
  type LeaseTestRunRecord,
} from "@/lib/lease-renewal/test-workflow";

export const LEASE_TEST_RUN_COLLECTIONS = {
  runs: "lease_renewal_test_runs",
  attempts: "lease_renewal_test_action_attempts",
  receipts: "lease_renewal_test_action_receipts",
} as const;

export const CreateLeaseTestRunInputSchema = z
  .object({ scenario: z.literal(LEASE_TEST_SCENARIO).default(LEASE_TEST_SCENARIO) })
  .strict();
export type CreateLeaseTestRunInput = z.input<typeof CreateLeaseTestRunInputSchema>;

export const TransitionLeaseTestRunInputSchema = z
  .object({ nextStatus: z.enum(LEASE_TEST_RUN_STATUSES) })
  .strict();
export type TransitionLeaseTestRunInput = z.input<
  typeof TransitionLeaseTestRunInputSchema
>;

export const SimulateLeaseTestActionInputSchema = z
  .object({
    actionKey: z.enum(LEASE_TEST_ACTIONS),
    confirmation: z.literal(LEASE_TEST_CONFIRMATION),
  })
  .strict();
export type SimulateLeaseTestActionInput = z.input<
  typeof SimulateLeaseTestActionInputSchema
>;

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested Lease Test action.",
      403,
    );
  }
}

function nowIso() {
  return new Date().toISOString();
}

export async function createCanonicalLeaseTestRun(
  actor: AuthenticatedUser,
  input: CreateLeaseTestRunInput = {},
  db: Firestore = getAdminFirestore(),
): Promise<LeaseTestRunRecord> {
  assertCan(actor, "edit");
  CreateLeaseTestRunInputSchema.parse(input);
  const createdAt = nowIso();
  const id = `test-renewal-${uuidv7()}`;
  const record: LeaseTestRunRecord = {
    id,
    data_mode: "test",
    scenario: LEASE_TEST_SCENARIO,
    status: "Created",
    labels: ["TEST DATA"],
    lease_ref: LEASE_TEST_ALIASES.leaseRef,
    property_label: LEASE_TEST_ALIASES.propertyLabel,
    resident_label: LEASE_TEST_ALIASES.residentLabel,
    resident_email: LEASE_TEST_ALIASES.residentEmail,
    action_total: LEASE_TEST_ACTIONS.length,
    created_by_uid: actor.uid,
    updated_by_uid: actor.uid,
    created_at: createdAt,
    updated_at: createdAt,
  };
  await db.collection(LEASE_TEST_RUN_COLLECTIONS.runs).doc(id).set(record);
  return record;
}

export async function getLeaseTestRun(
  actor: AuthenticatedUser,
  runId: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseTestRunRecord | null> {
  assertCan(actor, "read");
  const snapshot = await db.collection(LEASE_TEST_RUN_COLLECTIONS.runs).doc(runId).get();
  if (!snapshot.exists) return null;
  return readLeaseTestRun(snapshot.id, snapshot.data()!);
}

export async function listLeaseTestRuns(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseTestRunRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db.collection(LEASE_TEST_RUN_COLLECTIONS.runs).get();
  return snapshot.docs
    .map((doc) => readLeaseTestRun(doc.id, doc.data()))
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export async function transitionLeaseTestRun(
  actor: AuthenticatedUser,
  runId: string,
  input: TransitionLeaseTestRunInput,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseTestRunRecord> {
  assertCan(actor, "edit");
  const parsed = TransitionLeaseTestRunInputSchema.parse(input);
  const runRef = db.collection(LEASE_TEST_RUN_COLLECTIONS.runs).doc(runId);
  const updatedAt = nowIso();

  return db.runTransaction(async (transaction) => {
    const runSnapshot = await transaction.get(runRef);
    if (!runSnapshot.exists) {
      throw new EditableLayerError("That Lease Test run does not exist.", 404);
    }
    const run = readLeaseTestRun(runSnapshot.id, runSnapshot.data()!);
    const expected = nextLeaseTestRunStatus(run.status);
    if (parsed.nextStatus !== expected) {
      throw new EditableLayerError(
        expected
          ? `This run must move from ${run.status} to ${expected} next.`
          : "This Lease Test run is already Done.",
        409,
      );
    }

    if (parsed.nextStatus === "Done") {
      const missing: string[] = [];
      for (const actionKey of LEASE_TEST_ACTIONS) {
        const receiptRef = db
          .collection(LEASE_TEST_RUN_COLLECTIONS.receipts)
          .doc(evidenceId("receipt", runId, actionKey));
        const receiptSnapshot = await transaction.get(receiptRef);
        if (!receiptSnapshot.exists) {
          missing.push(actionKey);
          continue;
        }
        assertMatchingReceipt(
          readRecord<LeaseTestActionReceipt>(receiptSnapshot.id, receiptSnapshot.data()!),
          runId,
          actionKey,
        );
      }
      if (missing.length > 0) {
        throw new EditableLayerError(
          `Complete all ${LEASE_TEST_ACTIONS.length} Test actions before Done. Missing: ${missing.join(", ")}.`,
          409,
        );
      }
    }

    const updated: LeaseTestRunRecord = {
      ...run,
      status: parsed.nextStatus,
      updated_by_uid: actor.uid,
      updated_at: updatedAt,
      ...(parsed.nextStatus === "Done" ? { completed_at: updatedAt } : {}),
    };
    transaction.set(runRef, stripUndefined(updated));
    return updated;
  });
}

/**
 * Records one internal Test attempt and receipt after re-reading the persisted run lane.
 * Deterministic ids make retries return the original evidence instead of a second effect.
 */
export async function simulateLeaseTestAction(
  actor: AuthenticatedUser,
  runId: string,
  input: SimulateLeaseTestActionInput,
  db: Firestore = getAdminFirestore(),
): Promise<{ receipt: LeaseTestActionReceipt; attempt: LeaseTestActionAttempt }> {
  assertCan(actor, "edit");
  const parsed = SimulateLeaseTestActionInputSchema.parse(input);
  const runRef = db.collection(LEASE_TEST_RUN_COLLECTIONS.runs).doc(runId);
  const receiptRef = db
    .collection(LEASE_TEST_RUN_COLLECTIONS.receipts)
    .doc(evidenceId("receipt", runId, parsed.actionKey));
  const attemptRef = db
    .collection(LEASE_TEST_RUN_COLLECTIONS.attempts)
    .doc(evidenceId("attempt", runId, parsed.actionKey));
  const createdAt = nowIso();

  return db.runTransaction(async (transaction) => {
    const runSnapshot = await transaction.get(runRef);
    if (!runSnapshot.exists) {
      throw new EditableLayerError("That Lease Test run does not exist.", 404);
    }
    const run = readLeaseTestRun(runSnapshot.id, runSnapshot.data()!);
    const receiptSnapshot = await transaction.get(receiptRef);
    const attemptSnapshot = await transaction.get(attemptRef);

    if (receiptSnapshot.exists || attemptSnapshot.exists) {
      if (!receiptSnapshot.exists || !attemptSnapshot.exists) {
        throw new EditableLayerError(
          "The existing Lease Test evidence is incomplete and cannot be replayed.",
          409,
        );
      }
      const receipt = readRecord<LeaseTestActionReceipt>(
        receiptSnapshot.id,
        receiptSnapshot.data()!,
      );
      const attempt = readRecord<LeaseTestActionAttempt>(
        attemptSnapshot.id,
        attemptSnapshot.data()!,
      );
      assertMatchingReceipt(receipt, runId, parsed.actionKey);
      assertMatchingAttempt(attempt, runId, parsed.actionKey);
      return { receipt, attempt };
    }

    if (run.status !== "Executing") {
      throw new EditableLayerError(
        "Move this Lease Test run through Reviewed and Approved to Executing before running actions.",
        409,
      );
    }

    const missingDependencies: string[] = [];
    for (const dependency of leaseTestActionDependencies(parsed.actionKey)) {
      const dependencyRef = db
        .collection(LEASE_TEST_RUN_COLLECTIONS.receipts)
        .doc(evidenceId("receipt", runId, dependency));
      const dependencySnapshot = await transaction.get(dependencyRef);
      if (!dependencySnapshot.exists) missingDependencies.push(dependency);
    }
    if (missingDependencies.length > 0) {
      throw new EditableLayerError(
        `Complete required Test action${missingDependencies.length === 1 ? "" : "s"} first: ${missingDependencies.join(", ")}.`,
        409,
      );
    }

    const evidence = buildLeaseTestActionEvidence({
      receiptId: receiptRef.id,
      attemptId: attemptRef.id,
      runId,
      actionKey: parsed.actionKey,
      actorUid: actor.uid,
      createdAt,
    });
    transaction.set(attemptRef, evidence.attempt);
    transaction.set(receiptRef, evidence.receipt);
    transaction.set(runRef, {
      ...run,
      updated_by_uid: actor.uid,
      updated_at: createdAt,
    });
    return evidence;
  });
}

export async function listLeaseTestActionReceipts(
  actor: AuthenticatedUser,
  runId?: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseTestActionReceipt[]> {
  assertCan(actor, "read");
  const snapshot = await db.collection(LEASE_TEST_RUN_COLLECTIONS.receipts).get();
  return snapshot.docs
    .map((doc) => readRecord<LeaseTestActionReceipt>(doc.id, doc.data()))
    .filter((receipt) => !runId || receipt.run_id === runId)
    .sort(byLeaseActionOrder);
}

export async function listLeaseTestActionAttempts(
  actor: AuthenticatedUser,
  runId?: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseTestActionAttempt[]> {
  assertCan(actor, "read");
  const snapshot = await db.collection(LEASE_TEST_RUN_COLLECTIONS.attempts).get();
  return snapshot.docs
    .map((doc) => readRecord<LeaseTestActionAttempt>(doc.id, doc.data()))
    .filter((attempt) => !runId || attempt.run_id === runId)
    .sort(byLeaseActionOrder);
}

function evidenceId(kind: "receipt" | "attempt", runId: string, actionKey: string) {
  return `${kind}_test_${createHash("sha256")
    .update(`${runId}\u0000${actionKey}`)
    .digest("hex")}`;
}

function readLeaseTestRun(id: string, data: Record<string, unknown>) {
  const run = readRecord<LeaseTestRunRecord>(id, data);
  if (run.data_mode !== "test") {
    throw new EditableLayerError(
      "Lease Test actions require an explicitly labeled Test run.",
      409,
    );
  }
  return run;
}

function assertMatchingReceipt(
  receipt: LeaseTestActionReceipt,
  runId: string,
  actionKey: string,
) {
  if (
    receipt.run_id !== runId ||
    receipt.action_key !== actionKey ||
    receipt.data_mode !== "test" ||
    receipt.provider_contacted !== false ||
    receipt.live_proof_eligible !== false ||
    receipt.attempt_count !== 1
  ) {
    throw new EditableLayerError(
      "The existing Lease Test receipt does not match this exact run action.",
      409,
    );
  }
}

function assertMatchingAttempt(
  attempt: LeaseTestActionAttempt,
  runId: string,
  actionKey: string,
) {
  if (
    attempt.run_id !== runId ||
    attempt.action_key !== actionKey ||
    attempt.data_mode !== "test" ||
    attempt.provider_contacted !== false ||
    attempt.attempt_number !== 1
  ) {
    throw new EditableLayerError(
      "The existing Lease Test attempt does not match this exact run action.",
      409,
    );
  }
}

function byLeaseActionOrder(
  left: { action_key: string; created_at: string },
  right: { action_key: string; created_at: string },
) {
  const leftIndex = LEASE_TEST_ACTIONS.indexOf(
    left.action_key as (typeof LEASE_TEST_ACTIONS)[number],
  );
  const rightIndex = LEASE_TEST_ACTIONS.indexOf(
    right.action_key as (typeof LEASE_TEST_ACTIONS)[number],
  );
  return leftIndex === rightIndex
    ? left.created_at.localeCompare(right.created_at)
    : leftIndex - rightIndex;
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
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}

function stripUndefined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
