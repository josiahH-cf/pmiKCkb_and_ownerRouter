// App-owned persistence for the production Lease Renewal Test workspace.
//
// This server module writes only isolated Test run state plus bodyless Test attempts/receipts. It
// deliberately imports no Gmail, RentVine, Sheets, Dotloop, SMS, Boom, or external executor.

import { createHash } from "node:crypto";

import type { Firestore, Transaction } from "firebase-admin/firestore";
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
  LEASE_TEST_BUSINESS_ACTIONS,
  LEASE_TEST_BUSINESS_CONFIRMATION,
  LEASE_TEST_CONFIRMATION,
  LEASE_TEST_RUN_STATUSES,
  LEASE_TEST_SCENARIO,
  leaseTestActionDependencies,
  leaseTestBusinessActionBlocker,
  nextLeaseTestRunStatus,
  type LeaseTestActionAttempt,
  type LeaseTestActionReceipt,
  type LeaseTestBusinessAction,
  type LeaseTestBusinessEvent,
  type LeaseTestRunRecord,
} from "@/lib/lease-renewal/test-workflow";

export const LEASE_TEST_RUN_COLLECTIONS = {
  runs: "lease_renewal_test_runs",
  attempts: "lease_renewal_test_action_attempts",
  receipts: "lease_renewal_test_action_receipts",
  businessEvents: "lease_renewal_test_business_events",
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

export const RecordLeaseTestBusinessEventInputSchema = z
  .object({
    action: z.enum(LEASE_TEST_BUSINESS_ACTIONS),
    confirmation: z.literal(LEASE_TEST_BUSINESS_CONFIRMATION),
  })
  .strict();
export type RecordLeaseTestBusinessEventInput = z.input<
  typeof RecordLeaseTestBusinessEventInputSchema
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

    if (parsed.nextStatus === "Reviewed" && run.candidate_disposition !== "included") {
      throw new EditableLayerError(
        "Record the canonical Test candidate disposition before review.",
        409,
      );
    }
    if (parsed.nextStatus === "Approved" && run.owner_direction !== "renew") {
      throw new EditableLayerError(
        "Record source-backed Test owner renewal direction before approval.",
        409,
      );
    }
    if (
      parsed.nextStatus === "Executing" &&
      (!run.tenant_offer_timing || !run.conditional_facts_key)
    ) {
      throw new EditableLayerError(
        "Record tenant-offer timing and conditional Test facts before execution.",
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
      if (
        run.tenant_response !== "accepted" ||
        run.signatures_state !== "simulated_complete" ||
        run.business_test_status !== "test_complete"
      ) {
        throw new EditableLayerError(
          "Record tenant acceptance, simulated signatures, and Test business closeout before Done.",
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

    const businessBlocker = leaseTestBusinessActionBlocker(run, parsed.actionKey);
    if (businessBlocker) {
      throw new EditableLayerError(businessBlocker, 409);
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

export async function recordLeaseTestBusinessEvent(
  actor: AuthenticatedUser,
  runId: string,
  input: RecordLeaseTestBusinessEventInput,
  db: Firestore = getAdminFirestore(),
): Promise<{
  run: LeaseTestRunRecord;
  event: LeaseTestBusinessEvent;
  duplicate: boolean;
}> {
  assertCan(actor, "edit");
  const parsed = RecordLeaseTestBusinessEventInputSchema.parse(input);
  const runRef = db.collection(LEASE_TEST_RUN_COLLECTIONS.runs).doc(runId);
  const eventRef = db
    .collection(LEASE_TEST_RUN_COLLECTIONS.businessEvents)
    .doc(businessEventId(runId, parsed.action));
  const createdAt = nowIso();

  return db.runTransaction(async (transaction) => {
    const runSnapshot = await transaction.get(runRef);
    if (!runSnapshot.exists) {
      throw new EditableLayerError("That Lease Test run does not exist.", 404);
    }
    const run = readLeaseTestRun(runSnapshot.id, runSnapshot.data()!);
    const existingSnapshot = await transaction.get(eventRef);
    if (existingSnapshot.exists) {
      const event = readRecord<LeaseTestBusinessEvent>(
        existingSnapshot.id,
        existingSnapshot.data()!,
      );
      assertMatchingBusinessEvent(event, runId, parsed.action);
      return { run, event, duplicate: true };
    }

    await assertBusinessEventDependencies(transaction, db, run, parsed.action);
    const event = buildBusinessEvent(
      eventRef.id,
      runId,
      parsed.action,
      actor.uid,
      createdAt,
    );
    const updated = applyBusinessEvent(run, parsed.action, actor.uid, createdAt);
    transaction.set(eventRef, event);
    transaction.set(runRef, stripUndefined(updated));
    return { run: updated, event, duplicate: false };
  });
}

export async function listLeaseTestBusinessEvents(
  actor: AuthenticatedUser,
  runId?: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseTestBusinessEvent[]> {
  assertCan(actor, "read");
  const snapshot = await db.collection(LEASE_TEST_RUN_COLLECTIONS.businessEvents).get();
  return snapshot.docs
    .map((doc) => readRecord<LeaseTestBusinessEvent>(doc.id, doc.data()))
    .filter((event) => !runId || event.run_id === runId)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
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

function businessEventId(runId: string, action: LeaseTestBusinessAction) {
  const slot =
    action === "tenant_accepts" || action === "tenant_moves_out"
      ? "tenant_response"
      : action;
  return `business_test_${createHash("sha256")
    .update(`${runId}\u0000${slot}`)
    .digest("hex")}`;
}

async function assertBusinessEventDependencies(
  transaction: Transaction,
  db: Firestore,
  run: LeaseTestRunRecord,
  action: LeaseTestBusinessAction,
) {
  if (run.status === "Done" || run.status === "Moved to Move-Out") {
    throw new EditableLayerError("This Lease Test business journey is closed.", 409);
  }
  if (action === "candidate_included") {
    if (run.status !== "Created") {
      throw new EditableLayerError(
        "Candidate disposition belongs to the Created stage.",
        409,
      );
    }
    return;
  }
  if (action === "owner_renewal_approved") {
    if (run.status !== "Reviewed" || run.candidate_disposition !== "included") {
      throw new EditableLayerError(
        "Review the included Test candidate before recording owner direction.",
        409,
      );
    }
    return;
  }
  if (action === "tenant_offer_scheduled" || action === "conditional_facts_confirmed") {
    if (run.status !== "Approved" || run.owner_direction !== "renew") {
      throw new EditableLayerError(
        "Approve the source-backed Test owner direction first.",
        409,
      );
    }
    return;
  }
  if (run.status !== "Executing") {
    throw new EditableLayerError(
      "Move the Test renewal to Executing before recording this milestone.",
      409,
    );
  }
  if (action === "tenant_accepts" || action === "tenant_moves_out") {
    const outreach = [
      "gmail.renewal_notice.send",
      "rentvine.renewal.portal_message.send",
      "sms.renewal_message.send",
    ] as const;
    await assertReceiptsExist(transaction, db, run.id, outreach, "outreach channel");
    return;
  }
  if (action === "signatures_complete") {
    if (run.tenant_response !== "accepted" || !run.conditional_facts_key) {
      throw new EditableLayerError(
        "Tenant acceptance and conditional Test facts are required before signatures.",
        409,
      );
    }
    await assertReceiptsExist(
      transaction,
      db,
      run.id,
      ["dotloop.loop.create_from_template", "dotloop.document.upload"],
      "document",
    );
    return;
  }
  if (action === "business_test_closeout") {
    if (
      run.tenant_response !== "accepted" ||
      run.signatures_state !== "simulated_complete"
    ) {
      throw new EditableLayerError(
        "Tenant acceptance and simulated signatures are required before Test closeout.",
        409,
      );
    }
    await assertReceiptsExist(transaction, db, run.id, LEASE_TEST_ACTIONS, "Test action");
  }
}

async function assertReceiptsExist(
  transaction: Transaction,
  db: Firestore,
  runId: string,
  actionKeys: readonly (typeof LEASE_TEST_ACTIONS)[number][],
  label: string,
) {
  const missing: string[] = [];
  for (const actionKey of actionKeys) {
    const receiptRef = db
      .collection(LEASE_TEST_RUN_COLLECTIONS.receipts)
      .doc(evidenceId("receipt", runId, actionKey));
    const snapshot = await transaction.get(receiptRef);
    if (!snapshot.exists) {
      missing.push(actionKey);
    } else {
      assertMatchingReceipt(
        readRecord<LeaseTestActionReceipt>(snapshot.id, snapshot.data()!),
        runId,
        actionKey,
      );
    }
  }
  if (missing.length > 0) {
    throw new EditableLayerError(
      `Complete required ${label} receipt${missing.length === 1 ? "" : "s"} first: ${missing.join(", ")}.`,
      409,
    );
  }
}

function applyBusinessEvent(
  run: LeaseTestRunRecord,
  action: LeaseTestBusinessAction,
  actorUid: string,
  createdAt: string,
): LeaseTestRunRecord {
  const shared = { updated_at: createdAt, updated_by_uid: actorUid };
  if (action === "candidate_included") {
    return {
      ...run,
      ...shared,
      candidate_disposition: "included",
      candidate_cadence: "two_month_window",
      candidate_off_cycle: false,
      candidate_worklog_reason: "canonical_standard_window_test_fixture",
    };
  }
  if (action === "owner_renewal_approved") {
    return {
      ...run,
      ...shared,
      owner_direction: "renew",
      owner_terms_key: "canonical-test-renewal-terms-v1",
    };
  }
  if (action === "tenant_offer_scheduled") {
    return {
      ...run,
      ...shared,
      tenant_offer_timing: "by_fifteenth",
      signature_window_days: 30,
    };
  }
  if (action === "conditional_facts_confirmed") {
    return {
      ...run,
      ...shared,
      conditional_facts_key: "canonical-test-conditional-facts-v1",
    };
  }
  if (action === "tenant_accepts") {
    return { ...run, ...shared, tenant_response: "accepted" };
  }
  if (action === "tenant_moves_out") {
    return {
      ...run,
      ...shared,
      business_test_status: "moved_to_move_out",
      completed_at: createdAt,
      move_out_handoff: {
        data_mode: "test",
        direct_link: "/spaces/move-out-deposit-disposition",
        next_owner: "Move-Out operator",
        state: "started",
      },
      status: "Moved to Move-Out",
      tenant_response: "move_out",
    };
  }
  if (action === "signatures_complete") {
    return { ...run, ...shared, signatures_state: "simulated_complete" };
  }
  return { ...run, ...shared, business_test_status: "test_complete" };
}

function buildBusinessEvent(
  id: string,
  runId: string,
  action: LeaseTestBusinessAction,
  actorUid: string,
  createdAt: string,
): LeaseTestBusinessEvent {
  const outcomes: Record<LeaseTestBusinessAction, LeaseTestBusinessEvent["outcome"]> = {
    candidate_included: "included_standard_window",
    owner_renewal_approved: "renewal_terms_approved",
    tenant_offer_scheduled: "offer_due_by_fifteenth_with_30_day_signature_window",
    conditional_facts_confirmed: "canonical_conditional_facts_confirmed",
    tenant_accepts: "tenant_accepted",
    tenant_moves_out: "move_out_handoff_started",
    signatures_complete: "simulated_signatures_complete",
    business_test_closeout: "test_business_journey_complete",
  };
  return {
    id,
    run_id: runId,
    data_mode: "test",
    action,
    outcome: outcomes[action],
    actor_uid: actorUid,
    provider_contacted: false,
    live_proof_eligible: false,
    created_at: createdAt,
  };
}

function assertMatchingBusinessEvent(
  event: LeaseTestBusinessEvent,
  runId: string,
  action: LeaseTestBusinessAction,
) {
  if (
    event.run_id !== runId ||
    event.action !== action ||
    event.data_mode !== "test" ||
    event.provider_contacted !== false ||
    event.live_proof_eligible !== false
  ) {
    throw new EditableLayerError(
      "The existing Lease Test business event does not match this milestone.",
      409,
    );
  }
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
