import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  getApprovalQueueItem,
  transitionApprovalQueueItem,
} from "@/lib/firestore/approval-queue";
import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";
import {
  bulkTransitionApprovalQueueItemsWithWorkflowSync,
  transitionApprovalQueueItemWithWorkflowSync,
} from "@/lib/firestore/workflow-approval-queue-sync";
import {
  activateProcessDefinition,
  createProcessDefinition,
  getProcessDefinition,
  listWorkflowRunTimeline,
  listWorkflowRuns,
  startWorkflowTestRun,
  submitProcessDefinitionForApproval,
  updateProcessDefinition,
  updateWorkflowRunOutcome,
} from "@/lib/firestore/workflows";
import { FakeFirestore } from "../helpers/fake-firestore";

function userWith(role: Role, uid: string): AuthenticatedUser {
  return { uid, email: `${uid}@example.com`, hd: "example.com", role };
}

const admin = userWith("Admin", "admin-1");
const editor = userWith("Editor", "editor-1");

let db: Firestore;

beforeEach(() => {
  db = new FakeFirestore() as unknown as Firestore;
});

describe("workflow foundation repository", () => {
  it("creates and updates editable process definitions", async () => {
    const definition = await createProcessDefinition(editor, baseDefinitionInput(), db);

    expect(definition).toMatchObject({
      created_by_uid: "editor-1",
      name: "Lease Renewal Test Process",
      status: "Draft",
    });
    expect(definition.steps[0]).toMatchObject({ id: "step-1", title: "Gather facts" });

    const updated = await updateProcessDefinition(
      editor,
      definition.id,
      {
        short_outcome: "Prepare a reviewed renewal package.",
        steps: [{ title: "Gather lease facts" }, { title: "Prepare package" }],
      },
      db,
    );

    expect(updated.short_outcome).toBe("Prepare a reviewed renewal package.");
    expect(updated.steps.map((step) => step.title)).toEqual([
      "Gather lease facts",
      "Prepare package",
    ]);
  });

  it("submits a process definition through one refreshed Approval Queue item", async () => {
    const definition = await createProcessDefinition(editor, baseDefinitionInput(), db);

    const firstSubmit = await submitProcessDefinitionForApproval(
      editor,
      definition.id,
      { note: "Ready for review." },
      db,
    );
    const secondSubmit = await submitProcessDefinitionForApproval(
      editor,
      definition.id,
      { note: "Updated review note." },
      db,
    );

    expect(firstSubmit.status).toBe("Pending Approval");
    expect(secondSubmit.pending_queue_item_id).toBe(firstSubmit.pending_queue_item_id);

    const fake = db as unknown as FakeFirestore;
    const queueItems = Array.from(fake.store.keys()).filter((path) =>
      path.startsWith("approval_queue_items/"),
    );
    expect(queueItems).toHaveLength(1);
  });

  it("requires approved queue review and successful test before normal activation", async () => {
    const definition = await createProcessDefinition(editor, baseDefinitionInput(), db);
    const submitted = await submitProcessDefinitionForApproval(
      editor,
      definition.id,
      {},
      db,
    );

    await expect(activateProcessDefinition(admin, definition.id, {}, db)).rejects.toThrow(
      /successful test run/,
    );

    const testRun = await startWorkflowTestRun(
      editor,
      definition.id,
      { due_date: "2026-06-20" },
      db,
    );
    await updateWorkflowRunOutcome(
      editor,
      testRun.id,
      { action: "complete_test", notes: "Simulation passed." },
      db,
    );

    await expect(activateProcessDefinition(admin, definition.id, {}, db)).rejects.toThrow(
      /approved process-definition queue item/,
    );

    await transitionApprovalQueueItem(
      admin,
      submitted.pending_queue_item_id!,
      { action: "approve" },
      db,
    );
    const active = await activateProcessDefinition(admin, definition.id, {}, db);

    expect(active.status).toBe("Active");
    expect(active.active_version_id).toBeTruthy();
    const nextDraft = await updateProcessDefinition(
      editor,
      active.id,
      { name: "Changed after active" },
      db,
    );
    expect(nextDraft.status).toBe("Draft");
    expect(nextDraft.active_version_id).toBe(active.active_version_id);
    expect(nextDraft.pending_queue_item_id).toBeUndefined();

    const fake = db as unknown as FakeFirestore;
    const version = fake.store.get(
      `process_definition_versions/${active.active_version_id}`,
    );
    expect(version?.snapshot_json).toContain("Lease Renewal Test Process");
  });

  it("moves returned process-definition approvals into Needs Revision", async () => {
    const definition = await createProcessDefinition(editor, baseDefinitionInput(), db);
    const submitted = await submitProcessDefinitionForApproval(
      editor,
      definition.id,
      { note: "Ready for review." },
      db,
    );

    const returned = await transitionApprovalQueueItemWithWorkflowSync(
      editor,
      submitted.pending_queue_item_id!,
      { action: "return", reason: "Add the missing source notes." },
      db,
    );
    const revised = await getProcessDefinition(editor, definition.id, db);

    expect(returned.status).toBe("Returned");
    expect(revised.status).toBe("Needs Revision");
    expect(revised.pending_queue_item_id).toBe(submitted.pending_queue_item_id);
  });

  it("returns a disabled process-definition to Draft so it is not stranded", async () => {
    const definition = await createProcessDefinition(editor, baseDefinitionInput(), db);
    const submitted = await submitProcessDefinitionForApproval(
      editor,
      definition.id,
      {},
      db,
    );

    const disabled = await transitionApprovalQueueItemWithWorkflowSync(
      admin,
      submitted.pending_queue_item_id!,
      { action: "disable", reason: "Abandoning this change for now." },
      db,
    );
    const reverted = await getProcessDefinition(editor, definition.id, db);

    expect(disabled.status).toBe("Disabled");
    expect(reverted.status).toBe("Draft");

    // The definition is editable again rather than stuck in Pending Approval.
    const edited = await updateProcessDefinition(
      editor,
      definition.id,
      { name: "Revised after disable" },
      db,
    );
    expect(edited.status).toBe("Draft");
  });

  it("edits Needs Revision definitions and resubmits the same queue item", async () => {
    const definition = await createProcessDefinition(editor, baseDefinitionInput(), db);
    const submitted = await submitProcessDefinitionForApproval(
      editor,
      definition.id,
      {},
      db,
    );
    await transitionApprovalQueueItemWithWorkflowSync(
      editor,
      submitted.pending_queue_item_id!,
      { action: "return", reason: "Clarify the owner communication step." },
      db,
    );

    const edited = await updateProcessDefinition(
      editor,
      definition.id,
      {
        steps: [{ title: "Gather lease facts" }, { title: "Draft owner summary" }],
      },
      db,
    );
    const resubmitted = await submitProcessDefinitionForApproval(
      editor,
      definition.id,
      { note: "Revision ready." },
      db,
    );
    const queueItem = await getApprovalQueueItem(
      admin,
      submitted.pending_queue_item_id!,
      db,
    );

    expect(edited.status).toBe("Needs Revision");
    expect(resubmitted.status).toBe("Pending Approval");
    expect(resubmitted.pending_queue_item_id).toBe(submitted.pending_queue_item_id);
    expect(queueItem.status).toBe("Ready for Approval");
  });

  it("syncs bulk return for process-definition queue items", async () => {
    const definition = await createProcessDefinition(editor, baseDefinitionInput(), db);
    const submitted = await submitProcessDefinitionForApproval(
      editor,
      definition.id,
      {},
      db,
    );

    const result = await bulkTransitionApprovalQueueItemsWithWorkflowSync(
      editor,
      {
        action: "return",
        item_ids: [submitted.pending_queue_item_id!],
        reason: "Add the source link before activation.",
      },
      db,
    );

    expect(result.summary.updated).toBe(1);
    expect((await getProcessDefinition(editor, definition.id, db)).status).toBe(
      "Needs Revision",
    );
  });

  it("allows Admin activation override only after source links and queue approval exist", async () => {
    const definition = await createProcessDefinition(editor, baseDefinitionInput(), db);
    const submitted = await submitProcessDefinitionForApproval(
      editor,
      definition.id,
      {},
      db,
    );
    await transitionApprovalQueueItem(
      admin,
      submitted.pending_queue_item_id!,
      { action: "approve" },
      db,
    );

    const active = await activateProcessDefinition(
      admin,
      definition.id,
      { override_reason: "Dan approved activation before a successful test run." },
      db,
    );

    expect(active.status).toBe("Active");
    expect(active.activation_override_reason).toContain("Dan approved");
  });

  it("starts simulation-only test runs and records append-only timeline entries", async () => {
    const definition = await createProcessDefinition(editor, baseDefinitionInput(), db);
    const run = await startWorkflowTestRun(
      editor,
      definition.id,
      { due_date: "2026-07-01", note: "Start with safe fixture facts." },
      db,
    );

    expect(run).toMatchObject({
      due_date: "2026-07-01",
      is_test_run: true,
      production_metrics_included: false,
      simulation_only: true,
      status: "In Progress",
    });
    expect((await getProcessDefinition(editor, definition.id, db)).status).toBe(
      "Testing",
    );

    const completed = await updateWorkflowRunOutcome(
      editor,
      run.id,
      { action: "complete_test", notes: "All simulated steps passed." },
      db,
    );
    const timeline = await listWorkflowRunTimeline(editor, run.id, db);

    expect(completed.status).toBe("Completed");
    expect(timeline.map((entry) => entry.event_type)).toEqual(["started", "completed"]);
    expect(
      (await getProcessDefinition(editor, definition.id, db)).last_successful_test_run_id,
    ).toBe(run.id);
  });

  it("rejects outcome updates for non-test or non-simulation runs", async () => {
    (db as unknown as FakeFirestore).seed("workflow_runs/real-run", {
      created_at: "2026-06-06T00:00:00.000Z",
      definition_id: "definition-1",
      due_date: "2026-06-06",
      id: "real-run",
      is_test_run: false,
      next_action: "External action",
      owner_uid: "admin-1",
      process_name: "Real Process",
      production_metrics_included: true,
      simulation_only: false,
      started_by_uid: "editor-1",
      status: "In Progress",
      updated_at: "2026-06-06T00:00:00.000Z",
    });

    await expect(
      updateWorkflowRunOutcome(
        editor,
        "real-run",
        { action: "complete_test", notes: "Should not work." },
        db,
      ),
    ).rejects.toThrow(/test runs can be updated/);
  });

  it("lists workflow runs for a definition", async () => {
    const definition = await createProcessDefinition(editor, baseDefinitionInput(), db);
    const first = await startWorkflowTestRun(
      editor,
      definition.id,
      { due_date: "2026-07-01" },
      db,
    );
    const second = await startWorkflowTestRun(
      editor,
      definition.id,
      { due_date: "2026-07-02" },
      db,
    );

    const runs = await listWorkflowRuns(editor, { definitionId: definition.id }, db);

    expect(runs.map((run) => run.id).sort()).toEqual([first.id, second.id].sort());
  });

  it("filters recent simulation workflow runs and applies limits", async () => {
    const fake = db as unknown as FakeFirestore;
    fake.seed("workflow_runs/run-old-test", {
      created_at: "2026-06-01T00:00:00.000Z",
      definition_id: "definition-1",
      due_date: "2026-06-10",
      id: "run-old-test",
      is_test_run: true,
      next_action: "Old test",
      owner_uid: "admin-1",
      process_name: "Old Test Process",
      production_metrics_included: false,
      simulation_only: true,
      started_by_uid: "editor-1",
      status: "Completed",
      updated_at: "2026-06-01T00:00:00.000Z",
    });
    fake.seed("workflow_runs/run-live", {
      created_at: "2026-06-03T00:00:00.000Z",
      definition_id: "definition-1",
      due_date: "2026-06-12",
      id: "run-live",
      is_test_run: false,
      next_action: "Live action",
      owner_uid: "admin-1",
      process_name: "Live Process",
      production_metrics_included: true,
      simulation_only: false,
      started_by_uid: "editor-1",
      status: "In Progress",
      updated_at: "2026-06-03T00:00:00.000Z",
    });
    fake.seed("workflow_runs/run-new-test", {
      created_at: "2026-06-04T00:00:00.000Z",
      definition_id: "definition-1",
      due_date: "2026-06-15",
      id: "run-new-test",
      is_test_run: true,
      next_action: "New test",
      owner_uid: "admin-1",
      process_name: "New Test Process",
      production_metrics_included: false,
      simulation_only: true,
      started_by_uid: "editor-1",
      status: "In Progress",
      updated_at: "2026-06-04T00:00:00.000Z",
    });

    const runs = await listWorkflowRuns(editor, { limit: 1, simulationOnly: true }, db);

    expect(runs.map((run) => run.id)).toEqual(["run-new-test"]);
  });
});

function baseDefinitionInput(
  overrides: Partial<CreateProcessDefinitionInput> = {},
): CreateProcessDefinitionInput {
  return {
    action_references: [
      {
        expected_action: "Create a future owner communication draft.",
        label: "Owner communication",
        readiness: "Planned",
        target_system: "Gmail",
      },
    ],
    default_approver_uid: "admin-1",
    name: "Lease Renewal Test Process",
    owner_uid: "editor-1",
    required_starting_inputs: ["Property address", "Lease end date"],
    short_outcome: "Prepare a renewal package for review.",
    source_links: [{ label: "Workflow notes", url: "https://example.com/source" }],
    steps: [{ title: "Gather facts" }, { title: "Prepare review package" }],
    success_condition: "The renewal package is ready for Admin review.",
    trigger: "Manual start from the KB.",
    ...overrides,
  };
}
