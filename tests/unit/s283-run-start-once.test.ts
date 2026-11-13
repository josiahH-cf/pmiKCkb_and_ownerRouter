import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";
import { StartWorkflowRunInputSchema } from "@/lib/firestore/schemas";
import {
  PLACEHOLDER_STAFF_ASSIGNMENT_MESSAGE,
  clickWorkflowRunId,
  createProcessDefinition,
  getProcessDefinition,
  startWorkflowRun,
} from "@/lib/firestore/workflows";
import { buildMoveInProcessTemplate } from "@/lib/move-in/process-template";
import {
  RUN_START_FALLBACK_REFUSAL,
  newRunStartKey,
  runStartRefusalText,
} from "@/lib/processes/run-start";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

// S283 R-S283-4, ARCH-S283-3, BEH-S283-5 and AC-S283-4: on a Space that still starts runs, one
// staff click creates at most one run. The client's per-click key is stored with the run and the
// same key returns the same run; a refused start gives its reason in staff words. Synthetic
// fixtures only; nothing leaves the in-memory store.

type Role = AuthenticatedUser["role"];
const actor = (role: Role, uid = `fixture-${role.toLowerCase()}`): AuthenticatedUser => ({
  uid,
  email: `${uid}@pmikcmetro.com`,
  hd: "pmikcmetro.com",
  role,
});
const editor = actor("Editor");
const REAL_STAFF = { ownerUid: "staff-owner-1", approverUid: "staff-approver-1" };
const SOURCES = [
  { label: "Synthetic procedure", url: "https://example.test/move-in-procedure" },
];
const KEY = "4f9d6a2e-1b3c-4d5e-8f70-123456789abc";

let fake: FakeFirestore;
let db: Firestore;

beforeEach(() => {
  fake = new FakeFirestore();
  db = fake as unknown as Firestore;
});

async function seedAtFixedId(
  id: string,
  template: CreateProcessDefinitionInput,
  overrides: Record<string, unknown> = {},
) {
  const created = await createProcessDefinition(
    editor,
    { ...template, space_id: "move-in" },
    db,
  );
  fake.seed(`process_definitions/${id}`, {
    ...fake.store.get(`process_definitions/${created.id}`),
    id,
    ...overrides,
  });
  fake.store.delete(`process_definitions/${created.id}`);
  return getProcessDefinition(editor, id, db);
}

function count(prefix: string) {
  return [...fake.store.keys()].filter((key) => key.startsWith(`${prefix}/`)).length;
}

describe("ARCH-S283-3 the run start accepts a per-click key and stores it with the run", () => {
  it("ARCH-S283-3 the same key twice returns the same run and writes one run and one timeline entry", async () => {
    await seedAtFixedId(
      "move-in",
      buildMoveInProcessTemplate({ ...REAL_STAFF, sourceLinks: SOURCES }),
    );
    const first = await startWorkflowRun(editor, "move-in", { start_key: KEY }, db);
    const second = await startWorkflowRun(editor, "move-in", { start_key: KEY }, db);

    expect(second.id).toBe(first.id);
    expect(first.id).toBe(clickWorkflowRunId(editor.uid, "move-in", KEY));
    expect(first).toMatchObject({ start_key: KEY, started_by_uid: editor.uid });
    expect(count("workflow_runs")).toBe(1);
    expect(count("workflow_run_timeline")).toBe(1);
  });

  it("BEH-S283-5 a double click (two concurrent starts with one key) creates one run", async () => {
    await seedAtFixedId(
      "move-in",
      buildMoveInProcessTemplate({ ...REAL_STAFF, sourceLinks: SOURCES }),
    );
    const results = await Promise.allSettled([
      startWorkflowRun(editor, "move-in", { start_key: KEY }, db),
      startWorkflowRun(editor, "move-in", { start_key: KEY }, db),
    ]);
    const ids = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value.id] : [],
    );
    expect(new Set(ids).size).toBeLessThanOrEqual(1);
    expect(count("workflow_runs")).toBe(1);
  });

  it("ARCH-S283-3 a new click (a new key) starts a new run, and without a key every call is new", async () => {
    await seedAtFixedId(
      "move-in",
      buildMoveInProcessTemplate({ ...REAL_STAFF, sourceLinks: SOURCES }),
    );
    await startWorkflowRun(editor, "move-in", { start_key: KEY }, db);
    await startWorkflowRun(editor, "move-in", { start_key: newRunStartKey() }, db);
    expect(count("workflow_runs")).toBe(2);
    await startWorkflowRun(editor, "move-in", {}, db);
    expect(count("workflow_runs")).toBe(3);
  });

  it("ARCH-S283-3 the key is bound to the person and the process: another person's same key is another run", async () => {
    await seedAtFixedId(
      "move-in",
      buildMoveInProcessTemplate({ ...REAL_STAFF, sourceLinks: SOURCES }),
    );
    const other = actor("Editor", "fixture-other-editor");
    const mine = await startWorkflowRun(editor, "move-in", { start_key: KEY }, db);
    const theirs = await startWorkflowRun(other, "move-in", { start_key: KEY }, db);
    expect(theirs.id).not.toBe(mine.id);
    expect(clickWorkflowRunId(editor.uid, "move-in", KEY)).not.toBe(
      clickWorkflowRunId(editor.uid, "move-out", KEY),
    );
  });

  it("ARCH-S283-3 a key reused against a different stored run is refused with no write", async () => {
    await seedAtFixedId(
      "move-in",
      buildMoveInProcessTemplate({ ...REAL_STAFF, sourceLinks: SOURCES }),
    );
    const id = clickWorkflowRunId(editor.uid, "move-in", KEY);
    fake.seed(`workflow_runs/${id}`, {
      id,
      data_mode: "live",
      definition_id: "move-in",
      process_name: "Move-In",
      status: "In Progress",
      owner_uid: REAL_STAFF.approverUid,
      next_action: "Review",
      due_date: "2026-11-13",
      started_by_uid: editor.uid,
      start_key: "a-different-key-0001",
      created_at: "2026-11-13T15:00:00.000Z",
      updated_at: "2026-11-13T15:00:00.000Z",
    });
    await expect(
      startWorkflowRun(editor, "move-in", { start_key: KEY }, db),
    ).rejects.toMatchObject({ status: 409 });
    expect(count("workflow_run_timeline")).toBe(0);
  });

  it("ARCH-S283-3 the route schema accepts only a safe key", () => {
    expect(StartWorkflowRunInputSchema.safeParse({ start_key: KEY }).success).toBe(true);
    for (const bad of ["short", "has space in it", "x".repeat(65), "../../runs/1"])
      expect(StartWorkflowRunInputSchema.safeParse({ start_key: bad }).success).toBe(
        false,
      );
  });
});

describe("BEH-S283-5 a refused start gives its reason in staff words", () => {
  it("BEH-S283-5 a process with no assigned staff member refuses with the staff sentence and creates nothing", async () => {
    await seedAtFixedId(
      "move-in",
      buildMoveInProcessTemplate({
        ownerUid: "process-owner-PLACEHOLDER",
        approverUid: "process-approver-PLACEHOLDER",
        sourceLinks: SOURCES,
      }),
    );
    await expect(
      startWorkflowRun(editor, "move-in", { start_key: KEY }, db),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "This process has no assigned staff member yet. An Admin assigns one before a run can start.",
    });
    expect(PLACEHOLDER_STAFF_ASSIGNMENT_MESSAGE).not.toMatch(/placeholder|UID/i);
    expect(count("workflow_runs")).toBe(0);
  });

  it("BEH-S283-5 the panel shows the route's own reason, or a plain line when it gave none", () => {
    expect(runStartRefusalText({ error: PLACEHOLDER_STAFF_ASSIGNMENT_MESSAGE })).toBe(
      PLACEHOLDER_STAFF_ASSIGNMENT_MESSAGE,
    );
    expect(runStartRefusalText(null)).toBe(RUN_START_FALLBACK_REFUSAL);
    expect(runStartRefusalText({ error: "  " })).toBe(RUN_START_FALLBACK_REFUSAL);
    expect(RUN_START_FALLBACK_REFUSAL).not.toBe("Could not start a run.");
  });
});
