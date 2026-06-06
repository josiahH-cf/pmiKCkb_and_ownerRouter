import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { transitionApprovalQueueItem } from "@/lib/firestore/approval-queue";
import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";
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
      /successful simulation test run/,
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
    await expect(
      updateProcessDefinition(editor, active.id, { name: "Changed after active" }, db),
    ).rejects.toThrow(/Active or retired/);

    const fake = db as unknown as FakeFirestore;
    const version = fake.store.get(
      `process_definition_versions/${active.active_version_id}`,
    );
    expect(version?.snapshot_json).toContain("Lease Renewal Test Process");
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
    ).rejects.toThrow(/simulation-only test runs/);
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
