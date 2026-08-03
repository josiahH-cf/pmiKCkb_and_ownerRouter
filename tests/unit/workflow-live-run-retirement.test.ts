import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  stepCheckDocId,
  WORKFLOW_RUN_STEP_CHECK_COLLECTIONS,
} from "@/lib/firestore/workflow-run-step-check-keys";
import {
  createProcessDefinition,
  getProcessDefinition,
  listWorkflowRunTimeline,
  startWorkflowRun,
  updateWorkflowRunOutcome,
} from "@/lib/firestore/workflows";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const editor: AuthenticatedUser = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-1",
};
let fake: FakeFirestore;
let db: Firestore;

beforeEach(() => {
  fake = new FakeFirestore();
  db = fake as unknown as Firestore;
});

describe("ordinary Live workflow runs after Test-lane retirement", () => {
  it("starts an explicit Live run with retention and timeline evidence", async () => {
    const definition = await definitionNamed("Ordinary process");
    const run = await startWorkflowRun(
      editor,
      definition.id,
      { due_date: "2026-08-10", note: "Start the reviewed workflow." },
      db,
    );

    expect(run).toMatchObject({
      data_mode: "live",
      definition_id: definition.id,
      space_id: "lease-renewals",
      due_date: "2026-08-10",
      legal_hold: false,
      product_retention_class: "indefinite",
      product_retention_policy: "product-record-retention:v1.0",
      status: "In Progress",
    });
    expect(run).not.toHaveProperty("is_test_run");
    expect(run).not.toHaveProperty("simulation_only");
    expect(await listWorkflowRunTimeline(editor, run.id, db)).toEqual([
      expect.objectContaining({ event_type: "started", new_status: "In Progress" }),
    ]);
    expect((await getProcessDefinition(editor, definition.id, db)).status).toBe("Draft");
  });

  it("reuses a trusted server idempotency identity without duplicating timeline state", async () => {
    const definition = await definitionNamed("Idempotent process");
    const options = { runId: "trusted-live-run-1" };
    const first = await startWorkflowRun(editor, definition.id, {}, db, options);
    const second = await startWorkflowRun(editor, definition.id, {}, db, options);

    expect(second.id).toBe(first.id);
    expect(await listWorkflowRunTimeline(editor, first.id, db)).toHaveLength(1);
  });

  it("refuses a trusted run identity that belongs to another definition", async () => {
    const firstDefinition = await definitionNamed("First process");
    const secondDefinition = await definitionNamed("Second process");
    const options = { runId: "trusted-live-run-conflict" };
    await startWorkflowRun(editor, firstDefinition.id, {}, db, options);

    await expect(
      startWorkflowRun(editor, secondDefinition.id, {}, db, options),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("completes or fails ordinary runs with checklist and timeline enforcement", async () => {
    const definition = await definitionNamed("Outcome process");
    const completedRun = await startWorkflowRun(editor, definition.id, {}, db);
    fake.seed(
      `${WORKFLOW_RUN_STEP_CHECK_COLLECTIONS.checks}/${stepCheckDocId(completedRun.id, "step-1")}`,
      { status: "Checked" },
    );

    await expect(
      updateWorkflowRunOutcome(
        editor,
        completedRun.id,
        { action: "complete", notes: "Reviewed and complete." },
        db,
      ),
    ).resolves.toMatchObject({ status: "Completed" });

    const failedRun = await startWorkflowRun(editor, definition.id, {}, db);
    await expect(
      updateWorkflowRunOutcome(
        editor,
        failedRun.id,
        { action: "fail", notes: "Required evidence is unavailable." },
        db,
      ),
    ).resolves.toMatchObject({ status: "Failed" });
    expect(await listWorkflowRunTimeline(editor, failedRun.id, db)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: "failed", new_status: "Failed" }),
      ]),
    );
  });

  it("normalizes a legacy Testing definition to Draft on read", async () => {
    const definition = await definitionNamed("Legacy status process");
    const path = `process_definitions/${definition.id}`;
    fake.seed(path, { ...fake.store.get(path), status: "Testing" });

    await expect(getProcessDefinition(editor, definition.id, db)).resolves.toMatchObject({
      id: definition.id,
      status: "Draft",
    });
    expect(fake.store.get(path)).toMatchObject({ status: "Testing" });
  });
});

function definitionNamed(name: string) {
  return createProcessDefinition(
    editor,
    {
      action_references: [],
      default_approver_uid: "admin-1",
      name,
      owner_uid: editor.uid,
      required_starting_inputs: [],
      short_outcome: "Complete the reviewed workflow.",
      source_links: [{ label: "Verified source", url: "https://example.test/source" }],
      space_id: "lease-renewals",
      steps: [{ id: "step-1", title: "Review evidence" }],
      success_condition: "The evidence is reviewed.",
      trigger: "A person starts the workflow.",
    },
    db,
  );
}
