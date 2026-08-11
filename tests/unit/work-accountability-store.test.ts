import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  WORK_ACCOUNTABILITY_COLLECTIONS,
  WorkAccountabilityStore,
} from "@/lib/firestore/work-accountability";
import type { WorkSourceResolver } from "@/lib/work-accountability/source-resolver";
import type {
  WorkAssignableUser,
  WorkSessionRecord,
  WorkTaskRecord,
} from "@/lib/work-accountability/types";
import { FakeTransactionalFirestore } from "@/tests/helpers/fake-transactional-firestore";

const admin = user("Admin", "admin-1");
const editor = user("Editor", "editor-1");
const otherEditor = user("Editor", "editor-2");
const roster: WorkAssignableUser[] = [
  { uid: admin.uid, email: admin.email, role: "Admin" },
  { uid: editor.uid, email: editor.email, role: "Editor" },
  { uid: otherEditor.uid, email: otherEditor.email, role: "Editor" },
];

let fake: FakeTransactionalFirestore;
let now: string;
let store: WorkAccountabilityStore;

beforeEach(() => {
  fake = new FakeTransactionalFirestore();
  now = "2026-08-11T12:00:00.000Z";
  store = makeStore();
});

describe("S68 task creation, derivation, and expectations", () => {
  it("creates an explicit self task idempotently without starting time", async () => {
    const first = await createTask("self-create-1");
    const replay = await createTask("self-create-1");
    const snapshot = await store.listSnapshot(editor);

    expect(replay.id).toBe(first.id);
    expect(first).toMatchObject({
      assignee_uid: editor.uid,
      source: { type: "manual", status: "verified" },
      state: "Not started",
      record_version: 1,
    });
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.sessions).toEqual([]);
    expect(
      fake.collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.taskActivity),
    ).toHaveLength(1);
  });

  it("snapshots the active manager-set expectation and does not rewrite old tasks", async () => {
    await store.createExpectation(admin, {
      expectation_key: "lease-renewals:review",
      task_type: "review",
      space_id: "lease-renewals",
      minimum_minutes: 30,
      maximum_minutes: 45,
      rationale: "Initial reviewed operating range.",
      idempotency_key: "expect-v1",
    });
    const oldTask = await createTask("expect-old");

    now = "2026-08-12T12:00:00.000Z";
    const secondVersion = await store.createExpectation(admin, {
      expectation_key: "lease-renewals:review",
      task_type: "review",
      space_id: "lease-renewals",
      minimum_minutes: 40,
      maximum_minutes: 60,
      rationale: "Approved revised operating range.",
      idempotency_key: "expect-v2",
    });
    const newTask = await createTask("expect-new");
    const unchanged = await taskById(oldTask.id);

    expect(oldTask.expectation_snapshot).toMatchObject({
      version: 1,
      minimum_minutes: 30,
      maximum_minutes: 45,
    });
    expect(unchanged.expectation_snapshot).toEqual(oldTask.expectation_snapshot);
    expect(secondVersion.version).toBe(2);
    expect(newTask.expectation_snapshot).toMatchObject({
      version: 2,
      minimum_minutes: 40,
      maximum_minutes: 60,
    });

    const rebased = await store.rebaseTaskExpectation(admin, {
      task_id: oldTask.id,
      expectation_key: "lease-renewals:review",
      expected_task_version: oldTask.record_version,
      reason: "Use the approved current expectation for this still-open task.",
      idempotency_key: "rebase-old-task",
    });
    expect(rebased).toMatchObject({
      record_version: 2,
      expectation_snapshot: {
        version: 2,
        minimum_minutes: 40,
        maximum_minutes: 60,
      },
    });
    expect(
      fake
        .collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.taskActivity)
        .some(
          ({ data }) =>
            data.task_id === oldTask.id && data.action === "expectation_rebased",
        ),
    ).toBe(true);
  });

  it("refuses invalid expectation ranges and non-Admin versions", async () => {
    await expect(
      store.createExpectation(editor, {
        expectation_key: "lease-renewals:review",
        task_type: "review",
        minimum_minutes: 30,
        maximum_minutes: 45,
        rationale: "Not authorized.",
        idempotency_key: "unauthorized",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      store.createExpectation(admin, {
        expectation_key: "lease-renewals:review",
        task_type: "review",
        minimum_minutes: 0,
        maximum_minutes: 10,
        rationale: "Invalid zero range.",
        idempotency_key: "invalid-zero",
      }),
    ).rejects.toThrow("positive integers");
  });

  it("serializes simultaneous expectation versions through the active head", async () => {
    fake.armNextCommitBarrier(2);
    const records = await Promise.all([
      store.createExpectation(admin, {
        expectation_key: "lease-renewals:concurrent",
        task_type: "concurrent",
        minimum_minutes: 10,
        maximum_minutes: 20,
        rationale: "First concurrently submitted reviewed range.",
        idempotency_key: "expectation-concurrent-a",
      }),
      store.createExpectation(admin, {
        expectation_key: "lease-renewals:concurrent",
        task_type: "concurrent",
        minimum_minutes: 15,
        maximum_minutes: 25,
        rationale: "Second concurrently submitted reviewed range.",
        idempotency_key: "expectation-concurrent-b",
      }),
    ]);
    expect(records.map((record) => record.version).sort()).toEqual([1, 2]);
    const stored = fake
      .collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.expectations)
      .map(({ data }) => data);
    expect(stored.filter((record) => record.status === "active")).toHaveLength(1);
    expect(stored.filter((record) => record.status === "superseded")).toHaveLength(1);
  });

  it("derives one task per approved generation key and blocks unknown sources", async () => {
    await store.createMapping(admin, {
      mapping_key: "renewal-review-ready",
      source_type: "renewal_lease",
      actionable_unit: "review-ready",
      task_type: "review",
      title: "Review renewal record",
      next_action: "Open the renewal workspace",
      space_id: "lease-renewals",
      assignee_uid: editor.uid,
      rationale: "Approved actionable renewal mapping.",
      idempotency_key: "mapping-v1",
    });
    const first = await store.deriveTask(admin, {
      mapping_key: "renewal-review-ready",
      source_id: "lease-1",
      idempotency_key: "derive-attempt-1",
    });
    const replay = await store.deriveTask(admin, {
      mapping_key: "renewal-review-ready",
      source_id: "lease-1",
      idempotency_key: "derive-attempt-2",
    });
    const blocked = await store.deriveTask(admin, {
      mapping_key: "renewal-review-ready",
      source_id: "missing",
      idempotency_key: "derive-missing",
    });

    expect(replay.id).toBe(first.id);
    expect(first.generation_key).toBe("renewal_lease:lease-1:review-ready:1:editor-1");
    expect(blocked).toMatchObject({
      state: "Blocked",
      source: { status: "unverified" },
      blocker_reason: "Linked source could not be verified.",
    });
    expect(blocked.assignee_uid).toBeUndefined();
    expect(fake.collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.tasks)).toHaveLength(2);
  });

  it("refuses an identity absent from the active managed roster", async () => {
    await expect(
      store.createTask(admin, {
        ...taskInput("bad-assignee"),
        assignee_uid: "disabled-user",
      }),
    ).rejects.toMatchObject({ code: "assignee_unavailable", status: 409 });
  });

  it("keeps a verified but unassigned Admin task visibly blocked", async () => {
    const task = await store.createTask(admin, taskInput("admin-unassigned"));
    expect(task).toMatchObject({
      state: "Blocked",
      blocker_reason: "An active managed staff assignee is required.",
      source: { status: "verified" },
    });
    expect(task.assignee_uid).toBeUndefined();
  });
});

describe("S68 one-active-session and transition contract", () => {
  it("refuses to mark work in progress without an explicit session start", async () => {
    const task = await createTask("implicit-in-progress");

    await expect(
      store.transitionTask(editor, {
        task_id: task.id,
        expected_version: 1,
        next_state: "In progress",
        idempotency_key: "implicit-in-progress",
      }),
    ).rejects.toMatchObject({
      code: "explicit_start_required",
      status: 409,
    });
    expect(await taskById(task.id)).toMatchObject({
      state: "Not started",
      record_version: 1,
    });
    expect(fake.collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.sessions)).toEqual([]);
  });

  it("starts only on an explicit call, reuses the active task, and switches atomically", async () => {
    const firstTask = await createTask("task-one");
    const secondTask = await createTask("task-two");
    const firstSession = await store.startSession(editor, {
      task_id: firstTask.id,
      expected_task_version: 1,
      idempotency_key: "start-one",
    });
    const same = await store.startSession(editor, {
      task_id: firstTask.id,
      expected_task_version: 1,
      idempotency_key: "start-one-again",
    });

    now = "2026-08-11T12:05:00.000Z";
    const secondSession = await store.startSession(editor, {
      task_id: secondTask.id,
      expected_task_version: 1,
      idempotency_key: "start-two",
    });
    const snapshot = await store.listSnapshot(editor);
    const endedFirst = snapshot.sessions.find(
      (session) => session.id === firstSession.id,
    );

    expect(same.id).toBe(firstSession.id);
    expect(endedFirst).toMatchObject({
      state: "Ended",
      end_reason: "task_switch",
      effective_end_at: "2026-08-11T12:05:00.000Z",
      effective_minutes: 5,
    });
    expect((await taskById(firstTask.id)).state).toBe("Paused");
    expect((await taskById(secondTask.id)).state).toBe("In progress");
    expect(snapshot.current_session?.id).toBe(secondSession.id);
    expect(
      snapshot.sessions.filter((session) => session.state === "Active"),
    ).toHaveLength(1);
  });

  it("leaves exactly one active session under a deterministic two-tab race", async () => {
    const task = await createTask("race-task");
    fake.armNextCommitBarrier(2);

    const [left, right] = await Promise.all([
      store.startSession(editor, {
        task_id: task.id,
        expected_task_version: 1,
        idempotency_key: "tab-left",
      }),
      store.startSession(editor, {
        task_id: task.id,
        expected_task_version: 1,
        idempotency_key: "tab-right",
      }),
    ]);

    expect(left.id).toBe(right.id);
    expect(
      fake
        .collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.sessions)
        .filter(({ data }) => data.state === "Active"),
    ).toHaveLength(1);
    expect(
      fake.collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions),
    ).toHaveLength(1);
  });

  it("records no overlap when two tabs race to start different tasks", async () => {
    const firstTask = await createTask("race-different-one");
    const secondTask = await createTask("race-different-two");
    fake.armNextCommitBarrier(2);
    await Promise.all([
      store.startSession(editor, {
        task_id: firstTask.id,
        expected_task_version: 1,
        idempotency_key: "different-left",
      }),
      store.startSession(editor, {
        task_id: secondTask.id,
        expected_task_version: 1,
        idempotency_key: "different-right",
      }),
    ]);
    const sessions = fake
      .collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.sessions)
      .map(({ data }) => data as unknown as WorkSessionRecord);
    expect(sessions.filter((session) => session.state === "Active")).toHaveLength(1);
    expect(sessions.filter((session) => session.state === "Ended")).toHaveLength(1);
    expect(sessions.find((session) => session.state === "Ended")?.effective_minutes).toBe(
      0,
    );
  });

  it.each([
    ["Paused", "manual_pause"],
    ["Blocked", "blocked"],
    ["Completed", "completed"],
    ["Cancelled", "cancelled"],
  ] as const)("ends an active session when moving work to %s", async (state, reason) => {
    const task = await createTask(`transition-${state}`);
    const session = await store.startSession(editor, {
      task_id: task.id,
      expected_task_version: 1,
      idempotency_key: `start-${state}`,
    });
    now = "2026-08-11T12:03:00.000Z";
    await store.transitionTask(editor, {
      task_id: task.id,
      expected_version: 2,
      next_state: state,
      ...(state === "Blocked" || state === "Cancelled"
        ? { reason: "Explicit operator reason." }
        : {}),
      idempotency_key: `move-${state}`,
    });

    expect((await sessionById(session.id)).end_reason).toBe(reason);
    expect(
      fake.collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions),
    ).toEqual([]);
  });

  it("requires reasons and allows only an Admin to reopen terminal work", async () => {
    const task = await createTask("terminal-task");
    const completed = await store.transitionTask(editor, {
      task_id: task.id,
      expected_version: 1,
      next_state: "Completed",
      idempotency_key: "complete-terminal",
    });
    await expect(
      store.transitionTask(editor, {
        task_id: task.id,
        expected_version: completed.record_version,
        next_state: "Paused",
        reason: "Staff reopen attempt.",
        idempotency_key: "staff-reopen",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      store.transitionTask(admin, {
        task_id: task.id,
        expected_version: completed.record_version,
        next_state: "Paused",
        idempotency_key: "admin-reopen-no-reason",
      }),
    ).rejects.toThrow("requires a reason");

    const reopened = await store.transitionTask(admin, {
      task_id: task.id,
      expected_version: completed.record_version,
      next_state: "Paused",
      reason: "Renewal work needs a corrected review.",
      idempotency_key: "admin-reopen",
    });
    expect(reopened.state).toBe("Paused");
    expect(reopened.completed_at).toBeUndefined();
    const replay = await store.transitionTask(admin, {
      task_id: task.id,
      expected_version: completed.record_version,
      next_state: "Paused",
      reason: "Renewal work needs a corrected review.",
      idempotency_key: "admin-reopen",
    });
    expect(replay).toEqual(reopened);
  });

  it("returns one deterministic version conflict for simultaneous state changes", async () => {
    const task = await createTask("state-race");
    fake.armNextCommitBarrier(2);
    const results = await Promise.allSettled([
      store.transitionTask(editor, {
        task_id: task.id,
        expected_version: 1,
        next_state: "Completed",
        idempotency_key: "race-complete",
      }),
      store.transitionTask(editor, {
        task_id: task.id,
        expected_version: 1,
        next_state: "Cancelled",
        reason: "Cancelled in the competing tab.",
        idempotency_key: "race-cancel",
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const refusal = results.find((result) => result.status === "rejected");
    expect(refusal).toMatchObject({
      status: "rejected",
      reason: { code: "version_conflict", status: 409 },
    });
  });

  it("serializes simultaneous assignment changes and refuses reassignment while active", async () => {
    const task = await createTask("assignment-race");
    const active = await store.startSession(editor, {
      task_id: task.id,
      expected_task_version: 1,
      idempotency_key: "assignment-race-start",
    });
    await expect(
      store.reassignTask(admin, {
        task_id: task.id,
        expected_version: 2,
        assignee_uid: otherEditor.uid,
        reason: "Attempt while the existing session remains active.",
        idempotency_key: "assignment-active-refusal",
      }),
    ).rejects.toMatchObject({ code: "active_reassignment" });
    now = "2026-08-11T12:01:00.000Z";
    await store.transitionTask(editor, {
      task_id: task.id,
      expected_version: 2,
      next_state: "Paused",
      idempotency_key: "assignment-race-pause",
    });
    expect((await sessionById(active.id)).state).toBe("Ended");
    fake.armNextCommitBarrier(2);
    const results = await Promise.allSettled([
      store.reassignTask(admin, {
        task_id: task.id,
        expected_version: 3,
        assignee_uid: otherEditor.uid,
        reason: "First concurrent assignment choice.",
        idempotency_key: "assignment-race-a",
      }),
      store.reassignTask(admin, {
        task_id: task.id,
        expected_version: 3,
        assignee_uid: admin.uid,
        reason: "Second concurrent assignment choice.",
        idempotency_key: "assignment-race-b",
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      status: "rejected",
      reason: { code: "version_conflict", status: 409 },
    });
  });

  it("does not mutate the linked product record when work completes", async () => {
    fake.seed("workflow_runs/run-1", {
      id: "run-1",
      status: "Active",
      customer_body: "source-owned-value",
    });
    const task = await store.createTask(admin, {
      ...taskInput("linked-task"),
      source: { type: "workflow_run", id: "run-1" },
      assignee_uid: editor.uid,
    });
    await store.transitionTask(editor, {
      task_id: task.id,
      expected_version: 1,
      next_state: "Completed",
      idempotency_key: "complete-linked",
    });

    expect(fake.read("workflow_runs/run-1")).toEqual({
      id: "run-1",
      status: "Active",
      customer_body: "source-owned-value",
    });
  });
});

describe("S68 idle, disconnect, correction, and access boundaries", () => {
  it("acknowledges 14:59 activity and resets the server-owned cutoff", async () => {
    const task = await createTask("heartbeat-task");
    const session = await store.startSession(editor, {
      task_id: task.id,
      expected_task_version: 1,
      idempotency_key: "heartbeat-start",
    });
    now = "2026-08-11T12:14:59.000Z";
    const acknowledged = await store.heartbeat(editor, {
      session_id: session.id,
      expected_version: 1,
    });
    expect(acknowledged).toMatchObject({
      state: "Active",
      last_acknowledged_activity_at: "2026-08-11T12:14:59.000Z",
      record_version: 2,
    });

    now = "2026-08-11T12:29:59.000Z";
    const ended = await store.heartbeat(editor, {
      session_id: session.id,
      expected_version: 2,
    });
    expect(ended).toMatchObject({
      state: "Ended",
      end_reason: "idle_timeout",
      effective_end_at: "2026-08-11T12:29:59.000Z",
      effective_minutes: 29.98,
    });

    now = "2026-08-11T12:40:00.000Z";
    const late = await store.heartbeat(editor, {
      session_id: session.id,
      expected_version: 2,
    });
    expect(late.effective_end_at).toBe("2026-08-11T12:29:59.000Z");
  });

  it("marks a sleeping/disconnected session for review at the exact cutoff", async () => {
    const task = await createTask("disconnect-task");
    const session = await store.startSession(editor, {
      task_id: task.id,
      expected_task_version: 1,
      idempotency_key: "disconnect-start",
    });
    now = "2026-08-11T12:14:59.999Z";
    const beforeCutoff = await store.reconcileOwnSession(editor);
    expect(beforeCutoff).toMatchObject({
      state: "Active",
      last_acknowledged_activity_at: "2026-08-11T12:00:00.000Z",
    });
    now = "2026-08-11T12:15:00.000Z";
    const reconciled = await store.reconcileOwnSession(editor);

    expect(reconciled).toMatchObject({
      id: session.id,
      state: "Ended",
      end_reason: "disconnect_review",
      correction_state: "needs_review",
      effective_end_at: "2026-08-11T12:15:00.000Z",
      effective_minutes: 15,
    });
    expect((await taskById(task.id)).state).toBe("Paused");
  });

  it("reconciles Team work in bounded batches without treating page presence as work", async () => {
    const ownTask = await createTask("team-reconcile-one");
    const otherTask = await store.createTask(otherEditor, {
      ...taskInput("team-reconcile-two"),
      title: "Other staff task",
    });
    await store.startSession(editor, {
      task_id: ownTask.id,
      expected_task_version: 1,
      idempotency_key: "team-start-one",
    });
    await store.startSession(otherEditor, {
      task_id: otherTask.id,
      expected_task_version: 1,
      idempotency_key: "team-start-two",
    });
    now = "2026-08-11T12:15:00.000Z";

    expect(await store.reconcileTeamSessions(admin, 1)).toEqual({
      scanned: 1,
      ended: 1,
    });
    expect(
      fake.collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions),
    ).toHaveLength(1);
    expect(await store.reconcileTeamSessions(admin, 100)).toEqual({
      scanned: 1,
      ended: 1,
    });
    expect(
      fake.collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions),
    ).toEqual([]);
  });

  it("appends a validated correction while preserving original session facts", async () => {
    const firstTask = await createTask("correct-task-one");
    const first = await store.startSession(editor, {
      task_id: firstTask.id,
      expected_task_version: 1,
      idempotency_key: "correct-start-one",
    });
    now = "2026-08-11T12:10:00.000Z";
    await store.transitionTask(editor, {
      task_id: firstTask.id,
      expected_version: 2,
      next_state: "Paused",
      idempotency_key: "correct-pause-one",
    });

    const secondTask = await createTask("correct-task-two");
    const second = await store.startSession(editor, {
      task_id: secondTask.id,
      expected_task_version: 1,
      idempotency_key: "correct-start-two",
    });
    now = "2026-08-11T12:20:00.000Z";
    await store.transitionTask(editor, {
      task_id: secondTask.id,
      expected_version: 2,
      next_state: "Paused",
      idempotency_key: "correct-pause-two",
    });

    const corrected = await store.correctSession(editor, {
      session_id: first.id,
      expected_version: 2,
      effective_start_at: "2026-08-11T12:02:00.000Z",
      effective_end_at: "2026-08-11T12:08:00.000Z",
      reason: "Removed time recorded before the work began.",
      idempotency_key: "correction-one",
    });
    expect(corrected).toMatchObject({
      original_start_at: "2026-08-11T12:00:00.000Z",
      original_end_at: "2026-08-11T12:10:00.000Z",
      effective_start_at: "2026-08-11T12:02:00.000Z",
      effective_end_at: "2026-08-11T12:08:00.000Z",
      effective_minutes: 6,
      correction_state: "corrected",
      original_task_id: firstTask.id,
    });
    expect(
      fake.collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.corrections),
    ).toHaveLength(1);

    await expect(
      store.correctSession(editor, {
        session_id: first.id,
        expected_version: corrected.record_version,
        effective_start_at: "2026-08-11T12:12:00.000Z",
        effective_end_at: "2026-08-11T12:18:00.000Z",
        reason: "This interval overlaps the next task.",
        idempotency_key: "correction-overlap",
      }),
    ).rejects.toMatchObject({ code: "session_overlap" });

    await expect(
      store.correctSession(otherEditor, {
        session_id: second.id,
        expected_version: 2,
        effective_start_at: "2026-08-11T12:10:00.000Z",
        effective_end_at: "2026-08-11T12:20:00.000Z",
        reason: "Unauthorized cross-user correction.",
        idempotency_key: "cross-user-correction",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses active, reversed, future, stale, and cross-assignee corrections without change", async () => {
    const task = await createTask("correction-refusals");
    const session = await store.startSession(editor, {
      task_id: task.id,
      expected_task_version: 1,
      idempotency_key: "correction-refusals-start",
    });
    await expect(
      store.correctSession(editor, {
        session_id: session.id,
        expected_version: 1,
        effective_start_at: "2026-08-11T11:55:00.000Z",
        effective_end_at: "2026-08-11T12:00:00.000Z",
        reason: "Active sessions cannot become historical corrections.",
        idempotency_key: "correction-active",
      }),
    ).rejects.toMatchObject({ code: "active_correction_refused" });
    now = "2026-08-11T12:10:00.000Z";
    await store.transitionTask(editor, {
      task_id: task.id,
      expected_version: 2,
      next_state: "Paused",
      idempotency_key: "correction-refusals-pause",
    });
    const otherTask = await store.createTask(otherEditor, {
      ...taskInput("correction-other-assignee"),
      title: "Other staff correction target",
    });

    await expect(
      store.correctSession(editor, {
        session_id: session.id,
        expected_version: 2,
        effective_start_at: "2026-08-11T12:09:00.000Z",
        effective_end_at: "2026-08-11T12:01:00.000Z",
        reason: "Reversed interval refusal.",
        idempotency_key: "correction-reversed",
      }),
    ).rejects.toThrow("cannot be before");
    await expect(
      store.correctSession(editor, {
        session_id: session.id,
        expected_version: 2,
        effective_start_at: "2026-08-11T12:01:00.000Z",
        effective_end_at: "2026-08-11T12:11:00.000Z",
        reason: "Future interval refusal.",
        idempotency_key: "correction-future",
      }),
    ).rejects.toThrow("cannot end in the future");
    await expect(
      store.correctSession(editor, {
        session_id: session.id,
        expected_version: 1,
        effective_start_at: "2026-08-11T12:01:00.000Z",
        effective_end_at: "2026-08-11T12:09:00.000Z",
        reason: "Stale interval refusal.",
        idempotency_key: "correction-stale",
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      store.correctSession(editor, {
        session_id: session.id,
        expected_version: 2,
        effective_start_at: "2026-08-11T12:01:00.000Z",
        effective_end_at: "2026-08-11T12:09:00.000Z",
        task_id: otherTask.id,
        reason: "Cross-assignee task refusal.",
        idempotency_key: "correction-cross-assignee",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await sessionById(session.id)).toMatchObject({
      effective_start_at: "2026-08-11T12:00:00.000Z",
      effective_end_at: "2026-08-11T12:10:00.000Z",
      record_version: 2,
    });
    expect(fake.collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.corrections)).toEqual(
      [],
    );
  });

  it("returns non-enumerating refusals and separates My work from Team work", async () => {
    await createTask("private-task");
    expect((await store.listSnapshot(otherEditor)).tasks).toEqual([]);
    await expect(
      store.transitionTask(otherEditor, {
        task_id: (await store.listSnapshot(editor)).tasks[0].id,
        expected_version: 1,
        next_state: "Completed",
        idempotency_key: "cross-user-mutation",
      }),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(store.listSnapshot(editor, "team")).rejects.toMatchObject({
      status: 404,
    });
    expect((await store.listSnapshot(admin, "team")).tasks).toHaveLength(1);
  });

  it("preserves a staff member's own session history after task reassignment", async () => {
    const task = await createTask("reassigned-history");
    const session = await store.startSession(editor, {
      task_id: task.id,
      expected_task_version: 1,
      idempotency_key: "reassigned-history-start",
    });
    now = "2026-08-11T12:05:00.000Z";
    await store.transitionTask(editor, {
      task_id: task.id,
      expected_version: 2,
      next_state: "Paused",
      idempotency_key: "reassigned-history-pause",
    });
    await store.reassignTask(admin, {
      task_id: task.id,
      expected_version: 3,
      assignee_uid: otherEditor.uid,
      reason: "Move the remaining work to another staff member.",
      idempotency_key: "reassigned-history-move",
    });

    const history = await store.listSnapshot(editor);
    expect(history.tasks.map((record) => record.id)).toContain(task.id);
    expect(history.editable_task_ids).not.toContain(task.id);
    expect(history.sessions.map((record) => record.id)).toContain(session.id);
    await expect(
      store.correctSession(editor, {
        session_id: session.id,
        expected_version: 2,
        effective_start_at: "2026-08-11T12:01:00.000Z",
        effective_end_at: "2026-08-11T12:04:00.000Z",
        reason: "Correct the recorded interval after reassignment.",
        idempotency_key: "reassigned-history-correction",
      }),
    ).resolves.toMatchObject({ effective_minutes: 3, task_id: task.id });
    await expect(
      store.transitionTask(editor, {
        task_id: task.id,
        expected_version: 4,
        next_state: "Completed",
        idempotency_key: "reassigned-history-mutate",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("S68 bounded retention", () => {
  it("removes expired accountability records idempotently without touching the source", async () => {
    fake.seed("workflow_runs/source-retained", {
      id: "source-retained",
      status: "Active",
      source_policy: "independent",
    });
    const task = await store.createTask(admin, {
      ...taskInput("retention-task"),
      source: { type: "workflow_run", id: "source-retained" },
      assignee_uid: editor.uid,
    });
    const completed = await store.transitionTask(editor, {
      task_id: task.id,
      expected_version: 1,
      next_state: "Completed",
      idempotency_key: "retention-complete",
    });
    expect(completed.retention_expires_at).toBe("2027-08-11T12:00:00.000Z");

    now = "2027-08-11T12:00:00.000Z";
    const plan = await store.previewRetention(admin, { limit: 100 });
    expect(plan.candidates.length).toBeGreaterThanOrEqual(2);
    expect(plan.candidates.some((candidate) => candidate.target_id === task.id)).toBe(
      false,
    );
    const receipt = await store.executeRetention(admin, {
      plan,
      confirmation_hash: plan.plan_hash,
    });
    const replay = await store.executeRetention(admin, {
      plan,
      confirmation_hash: plan.plan_hash,
    });

    expect(receipt.removed_count).toBe(plan.candidates.length);
    expect(replay.id).toBe(receipt.id);
    const taskPlan = await store.previewRetention(admin, { limit: 100 });
    expect(taskPlan.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_collection: WORK_ACCOUNTABILITY_COLLECTIONS.tasks,
          target_id: task.id,
        }),
      ]),
    );
    await store.executeRetention(admin, {
      plan: taskPlan,
      confirmation_hash: taskPlan.plan_hash,
    });
    expect(fake.read(`work_tasks/${task.id}`)).toBeUndefined();
    expect(fake.read("workflow_runs/source-retained")).toEqual({
      id: "source-retained",
      status: "Active",
      source_policy: "independent",
    });
    expect(
      fake.collectionEntries(WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions),
    ).toEqual([]);
  });

  it("preserves legal-hold records and requires an exact preview hash", async () => {
    const task = await createTask("hold-task");
    await store.transitionTask(editor, {
      task_id: task.id,
      expected_version: 1,
      next_state: "Completed",
      idempotency_key: "hold-complete",
    });
    const stored = fake.read(`work_tasks/${task.id}`)!;
    fake.seed(`work_tasks/${task.id}`, { ...stored, legal_hold: true });
    now = "2027-08-11T12:00:00.000Z";
    const plan = await store.previewRetention(admin);
    expect(plan.candidates.some((candidate) => candidate.target_id === task.id)).toBe(
      false,
    );
    await expect(
      store.executeRetention(admin, {
        plan,
        confirmation_hash: "different-hash",
      }),
    ).rejects.toMatchObject({ code: "retention_confirmation_mismatch" });
  });

  it("removes corrections before sessions and clears a stale ended-session lock", async () => {
    const task = await createTask("retention-session-task");
    const session = await store.startSession(editor, {
      task_id: task.id,
      expected_task_version: 1,
      idempotency_key: "retention-session-start",
    });
    now = "2026-08-11T12:05:00.000Z";
    await store.transitionTask(editor, {
      task_id: task.id,
      expected_version: 2,
      next_state: "Completed",
      idempotency_key: "retention-session-complete",
    });
    const corrected = await store.correctSession(editor, {
      session_id: session.id,
      expected_version: 2,
      effective_start_at: "2026-08-11T12:01:00.000Z",
      effective_end_at: "2026-08-11T12:04:00.000Z",
      reason: "Remove the minute before the bounded work began.",
      idempotency_key: "retention-session-correction",
    });
    fake.seed(`${WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions}/${editor.uid}`, {
      staff_uid: editor.uid,
      session_id: session.id,
      task_id: task.id,
      session_version: corrected.record_version,
      updated_at: now,
    });
    now = "2027-08-11T12:05:00.000Z";

    const firstPlan = await store.previewRetention(admin, { limit: 100 });
    expect(
      firstPlan.candidates.some(
        (candidate) =>
          candidate.target_collection === WORK_ACCOUNTABILITY_COLLECTIONS.corrections &&
          candidate.target_id !== session.id,
      ),
    ).toBe(true);
    expect(
      firstPlan.candidates.some((candidate) => candidate.target_id === session.id),
    ).toBe(false);
    await store.executeRetention(admin, {
      plan: firstPlan,
      confirmation_hash: firstPlan.plan_hash,
    });

    const secondPlan = await store.previewRetention(admin, { limit: 100 });
    expect(secondPlan.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_collection: WORK_ACCOUNTABILITY_COLLECTIONS.sessions,
          target_id: session.id,
        }),
      ]),
    );
    const receipt = await store.executeRetention(admin, {
      plan: secondPlan,
      confirmation_hash: secondPlan.plan_hash,
    });
    expect(receipt.removed_targets).toEqual(
      expect.arrayContaining([
        {
          collection: WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions,
          id: editor.uid,
        },
        {
          collection: WORK_ACCOUNTABILITY_COLLECTIONS.sessions,
          id: session.id,
        },
      ]),
    );
    expect(
      fake.read(`${WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions}/${editor.uid}`),
    ).toBeUndefined();
  });
});

function makeStore() {
  return new WorkAccountabilityStore({
    db: fake as unknown as Firestore,
    now: () => now,
    sourceResolver: fakeSourceResolver,
    listAssignableUsers: async () => roster,
  });
}

const fakeSourceResolver: WorkSourceResolver = {
  resolve: async (_actor, input) => ({
    space_id: input.space_id,
    source:
      input.type === "manual"
        ? { type: "manual", status: "verified" }
        : input.id === "missing"
          ? { type: input.type, id: input.id, status: "unverified" }
          : {
              type: input.type,
              id: input.id,
              link: `/bounded-source/${input.type}/${input.id}`,
              version: "source-version-1",
              status: "verified",
            },
  }),
};

function user(role: AuthenticatedUser["role"], uid: string): AuthenticatedUser {
  return {
    uid,
    email: `${uid}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
  };
}

function taskInput(idempotencyKey: string) {
  return {
    space_id: "lease-renewals",
    source: { type: "manual" as const },
    task_type: "review",
    title: "Review assigned renewal work",
    next_action: "Open the linked workspace",
    idempotency_key: idempotencyKey,
  };
}

function createTask(idempotencyKey: string) {
  return store.createTask(editor, taskInput(idempotencyKey));
}

async function taskById(id: string): Promise<WorkTaskRecord> {
  return fake.read(`work_tasks/${id}`) as unknown as WorkTaskRecord;
}

async function sessionById(id: string): Promise<WorkSessionRecord> {
  return fake.read(`work_sessions/${id}`) as unknown as WorkSessionRecord;
}
