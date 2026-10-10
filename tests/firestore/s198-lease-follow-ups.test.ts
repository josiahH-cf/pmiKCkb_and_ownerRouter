import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
  assertFails,
} from "@firebase/rules-unit-testing";
import { getDoc, setDoc, doc } from "firebase/firestore";
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  WorkAccountabilityStore,
  WORK_ACCOUNTABILITY_COLLECTIONS as C,
} from "@/lib/firestore/work-accountability";
const projectId = "pmi-kc-kb-s198-emulator-test";
let env: RulesTestEnvironment, app: App, db: Firestore, store: WorkAccountabilityStore;
const admin = {
    uid: "managed-admin",
    email: "admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin" as const,
  },
  editor = {
    ...admin,
    uid: "editor",
    email: "editor@pmikcmetro.com",
    role: "Editor" as const,
  },
  other = { ...editor, uid: "other" };
let cycle = "lease_end:2026-12-31",
  sourceReadable = true;
let now = "2026-10-09T15:00:00Z";
const input = () => ({
  lease_id: "115",
  expected_cycle_key: cycle,
  kind: "insurance" as const,
  title: "Check actual insurance applicability",
  next_action: "Review the approved material",
  notes: "Applicability has not been established.",
  idempotency_key: randomUUID(),
});
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp({ projectId }, `follow-ups-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await env.clearFirestore();
  cycle = "lease_end:2026-12-31";
  sourceReadable = true;
  now = "2026-10-09T15:00:00Z";
  store = new WorkAccountabilityStore({
    db,
    now: () => now,
    listAssignableUsers: async () => [admin, editor, other],
    resolveLeaseFollowUpSource: async (_actor, id) => {
      if (id !== "115" || !sourceReadable)
        throw new Error("Actual lease identity unavailable or ambiguous");
      return {
        leaseId: id,
        basis: {
          kind: "lease_end",
          dateIso: cycle.split(":")[1],
          source: "Synthetic authoritative source",
        },
        source: {
          type: "renewal_lease",
          id,
          link: "/lease-renewal/live/desk/lease/115",
          version: "synthetic-source-v1",
          status: "verified",
        },
      };
    },
  });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await env.cleanup();
});
it("S198 persists one task through concurrent identical and separate matching intents, with exact replay checks", async () => {
  const request = input();
  const [a, b] = await Promise.all([
    store.createLeaseFollowUp(editor, request),
    store.createLeaseFollowUp(editor, request),
  ]);
  expect(a.task.id).toBe(b.task.id);
  const parallel = await Promise.all([
    store.createLeaseFollowUp(editor, { ...request, idempotency_key: randomUUID() }),
    store.createLeaseFollowUp(editor, { ...request, idempotency_key: randomUUID() }),
  ]);
  expect(parallel.map((p) => p.task.id)).toEqual([a.task.id, a.task.id]);
  const match = await store.createLeaseFollowUp(editor, {
    ...request,
    idempotency_key: randomUUID(),
  });
  expect(match.task.id).toBe(a.task.id);
  expect(match.existing).toBe(true);
  await expect(
    store.createLeaseFollowUp(editor, { ...request, title: "Changed meaning" }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await db.collection(C.tasks).get()).size).toBe(1);
  expect((await db.collection(C.taskActivity).get()).size).toBe(1);
  const lease = await store.listLeaseFollowUps(editor, "115"),
    mine = await store.listSnapshot(editor);
  expect(lease.tasks[0]).toEqual(mine.tasks[0]);
  expect(lease.tasks[0].renewal_follow_up).toMatchObject({
    cycle_key: cycle,
    kind: "insurance",
    notes: request.notes,
  });
});
it("S198 admits deliberately separate work, completed follow-up, and a later source cycle without resetting history", async () => {
  const original = await store.createLeaseFollowUp(editor, input());
  const separate = await store.createLeaseFollowUp(editor, {
    ...input(),
    distinct_reason: "A separately reported second item",
  });
  expect(separate.task.id).not.toBe(original.task.id);
  const complete = await store.transitionTask(editor, {
    task_id: separate.task.id,
    expected_version: 1,
    next_state: "Completed",
    outcome_note: "Staff reviewed the available evidence; coverage remains unverified.",
    idempotency_key: randomUUID(),
  });
  expect(complete.completed_at).toBe(new Date(now).toISOString());
  const matching = await store.createLeaseFollowUp(editor, input());
  expect(matching.task.id).toBe(original.task.id);
  await store.transitionTask(editor, {
    task_id: original.task.id,
    expected_version: 1,
    next_state: "Completed",
    idempotency_key: randomUUID(),
  });
  const later = await store.createLeaseFollowUp(editor, input());
  expect(later.task.id).not.toBe(separate.task.id);
  const reopened = await store.transitionTask(editor, {
    task_id: separate.task.id,
    expected_version: 2,
    next_state: "Paused",
    reason: "New information needs review",
    idempotency_key: randomUUID(),
  });
  expect(reopened.record_version).toBe(3);
  const read = await store.listLeaseFollowUps(editor, "115");
  expect(
    read.activity
      .filter((a) => a.task_id === separate.task.id)
      .map((a) => a.action)
      .sort(),
  ).toEqual(["completed", "created", "reopened"]);
  expect(
    read.tasks.find((t) => t.id === separate.task.id)?.renewal_follow_up?.notes,
  ).toBe(input().notes);
  cycle = "lease_end:2027-12-31";
  const next = await store.createLeaseFollowUp(editor, input());
  expect(next.task.renewal_follow_up?.cycle_key).toBe(cycle);
  expect((await store.listLeaseFollowUps(editor, "115")).tasks).toHaveLength(4);
});
it("S198 preserves My Work role visibility, actual assignment, unassigned state and source/cycle refusals", async () => {
  await expect(
    store.createLeaseFollowUp(editor, { ...input(), assignee_uid: other.uid }),
  ).rejects.toMatchObject({ status: 404 });
  const task = await store.createLeaseFollowUp(admin, {
    ...input(),
    assignee_uid: other.uid,
  });
  expect((await store.listLeaseFollowUps(editor, "115")).tasks).toEqual([]);
  expect((await store.listSnapshot(other)).tasks[0].id).toBe(task.task.id);
  const unassigned = await store.createLeaseFollowUp(admin, { ...input(), kind: "pet" });
  expect(unassigned.task).toMatchObject({
    state: "Blocked",
    blocker_reason: "An active managed staff assignee is required.",
  });
  expect((await store.listLeaseFollowUps(admin, "115")).tasks).toHaveLength(2);
  await expect(
    store.createLeaseFollowUp(editor, {
      ...input(),
      expected_cycle_key: "lease_end:2025-12-31",
    }),
  ).rejects.toMatchObject({ status: 409 });
  sourceReadable = false;
  await expect(store.createLeaseFollowUp(editor, input())).rejects.toThrow(
    /Actual lease/,
  );
  await expect(
    store.createLeaseFollowUp(
      { ...admin, email: "canary-admin@pmikcmetro.com" },
      input(),
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    store.createLeaseFollowUp(
      { ...admin, email: "someone@gmail.com", hd: "gmail.com" },
      input(),
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect((await db.collection(C.tasks).get()).size).toBe(2);
});
it("S198 keeps the new intent metadata server-only and supports exact receipt recovery despite a source outage", async () => {
  const request = input(),
    result = await store.createLeaseFollowUp(editor, request);
  sourceReadable = false;
  const replay = await store.createLeaseFollowUp(editor, request);
  expect(replay.task.id).toBe(result.task.id);
  expect(
    (await store.leaseFollowUpCreationReceipt(editor, "115", request.idempotency_key))
      .task.id,
  ).toBe(result.task.id);
  await expect(
    store.leaseFollowUpCreationReceipt(other, "115", request.idempotency_key),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    store.leaseFollowUpActivity(other, "115", result.task.id),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    (await store.leaseFollowUpActivity(editor, "115", result.task.id)).activity,
  ).toHaveLength(1);
  const client = env.authenticatedContext(editor.uid, { role: editor.role }).firestore();
  for (const key of [C.tasks, C.taskActivity, C.creationIntents, C.followUpHeads]) {
    await assertFails(getDoc(doc(client, key, "fixture")));
    await assertFails(setDoc(doc(client, key, "fixture"), { forged: true }));
  }
});
