import { createHash } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { EXTERNAL_ACTION_IDEMPOTENCY_PRINCIPAL } from "@/lib/external-execution/identity";
import {
  prepareActionExecutionRecord,
  approveActionExecution,
  claimActionExecution,
  getActionExecution,
} from "@/lib/firestore/action-executions";
import {
  workOrderActionCompanion,
  loadPreparedWorkOrderAction,
  WORK_ORDER_PREPARED_ACTION_COLLECTION,
  type PreparedWorkOrderAction,
} from "@/lib/firestore/maintenance-work-order-prepared-actions";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

const projectId = "pmi-kc-kb-s184-admission-test";
const one: AuthenticatedUser = {
  uid: "s184-one",
  email: "s184-one@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const two: AuthenticatedUser = {
  ...one,
  uid: "s184-two",
  email: "s184-two@pmikcmetro.com",
};
const canary: AuthenticatedUser = {
  ...one,
  uid: "canary-editor",
  email: "canary-editor@pmikcmetro.com",
};
const actionKey = "rentvine.work_order.create";
const idempotencyKey = "synthetic-reviewed-work-order";
const executionId = `exec_${createHash("sha256").update(`${EXTERNAL_ACTION_IDEMPOTENCY_PRINCIPAL}\u0000${actionKey}\u0000${idempotencyKey}`).digest("hex").slice(0, 40)}`;
const contextHash = "a".repeat(64);
let app: App, db: Firestore, env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp({ projectId }, `s184-admission-${process.pid}`);
  db = getFirestore(app);
});
beforeEach(() => env.clearFirestore());
afterAll(async () => {
  await deleteApp(app);
  await env.cleanup();
});
function preparation(actor: AuthenticatedUser): PreparedWorkOrderAction {
  return {
    execution_id: executionId,
    ticket_ref: "synthetic-ticket",
    prepared_by_uid: actor.uid,
    review_hash: "b".repeat(64),
    action: {
      workflowId: "maintenance:synthetic-ticket",
      actionId: "synthetic-create",
      actionKey,
      dataMode: "live",
      values: {
        unit_id: "217",
        description: "Synthetic reviewed work",
        send_vendor_notification: false,
      },
      sourceRefs: ["fixture-only:ticket"],
      contractRef: "documented:rentvine:maintenance-work-orders:v1",
      connectionRef: "fixture:connection",
      mappingRef: "fixture:mapping",
    },
  };
}
function prepare(actor: AuthenticatedUser, saved = preparation(actor)) {
  return prepareActionExecutionRecord(
    actor,
    {
      classification: {
        actionKey,
        blockers: [],
        defaultRisk: "High",
        kind: "system_of_record_write",
        risk: "High",
        requiresActionRegistry: true,
      },
      idempotencyKey,
      idempotencyPrincipal: EXTERNAL_ACTION_IDEMPOTENCY_PRINCIPAL,
      contextHash,
      previewHash: hashExecutionPreview(saved.action),
      companion: workOrderActionCompanion(saved),
    },
    db,
  );
}
it("two staff racing the same exact Apply retain one original preparation and one provider-attempt claim", async () => {
  const attempts = await Promise.allSettled([prepare(one), prepare(two)]);
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await db.collection("action_executions").get()).size).toBe(1);
  expect((await db.collection(WORK_ORDER_PREPARED_ACTION_COLLECTION).get()).size).toBe(1);
  const saved = (await loadPreparedWorkOrderAction(two, executionId, db))!;
  const record = await prepare(two, saved);
  expect(record.id).toBe(executionId);
  expect(saved.prepared_by_uid).toBe(record.actor_uid);
  await approveActionExecution(
    two,
    executionId,
    {
      previewHash: record.preview_hash,
      contextHash,
      reason: "Staff applied the displayed exact change",
    },
    db,
  );
  const claims = await Promise.allSettled([
    claimActionExecution(one, executionId, record.preview_hash, db, contextHash),
    claimActionExecution(two, executionId, record.preview_hash, db, contextHash),
  ]);
  expect(claims.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const after = await getActionExecution(one, executionId, db);
  expect(after).toMatchObject({
    state: "Executing",
    attempt_count: 1,
    approval: { approvedByRole: "Editor", basis: "staff_confirmation" },
  });
  expect([one.uid, two.uid]).toContain(after.claim_actor_uid);
  await expect(
    claimActionExecution(two, executionId, record.preview_hash, db, contextHash),
  ).rejects.toMatchObject({ status: 409 });
  expect((await db.collection("approval_queue_items").get()).empty).toBe(true);
  // This is the actual admission seam; no provider transport or customer effect is constructed.
}, 30000);
it("stale preview/context, substituted companion and verification identity cannot claim the ordinary operation", async () => {
  const record = await prepare(one);
  await expect(
    approveActionExecution(
      one,
      executionId,
      { previewHash: "c".repeat(64), contextHash, reason: "stale" },
      db,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    approveActionExecution(
      one,
      executionId,
      { previewHash: record.preview_hash, contextHash: "c".repeat(64), reason: "stale" },
      db,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    approveActionExecution(
      canary,
      executionId,
      { previewHash: record.preview_hash, contextHash, reason: "verification only" },
      db,
    ),
  ).rejects.toMatchObject({ status: 403 });
  const saved = preparation(one);
  await expect(
    prepare(one, {
      ...saved,
      action: {
        ...saved.action,
        values: { ...saved.action.values, description: "Substituted words" },
      },
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(await getActionExecution(one, executionId, db)).toMatchObject({
    state: "Awaiting Admin",
    attempt_count: 0,
  });
  expect(
    (await loadPreparedWorkOrderAction(one, executionId, db))?.action.values.description,
  ).toBe("Synthetic reviewed work");
});
