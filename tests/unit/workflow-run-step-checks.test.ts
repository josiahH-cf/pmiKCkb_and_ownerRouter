import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import { can, type Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  WORKFLOW_RUN_STEP_CHECK_COLLECTIONS,
  listStepChecksForRun,
  listWorkflowRunStepCheckActivity,
  setWorkflowRunStepCheck,
  stepCheckDocId,
} from "@/lib/firestore/workflow-run-step-checks";
import { FakeFirestore } from "../helpers/fake-firestore";

function userWith(role: Role, uid: string): AuthenticatedUser {
  return { uid, email: `${uid}@example.com`, hd: "example.com", role };
}

const editor = userWith("Editor", "editor-1");
const approver = userWith("Approver", "approver-1");
const admin = userWith("Admin", "admin-1");

const RUN_ID = "run-1";
const DEFINITION_ID = "move-in";

// Seed a workflow_run + its process_definition so getWorkflowRun / getProcessDefinition resolve.
function seedRunAndDefinition(db: FakeFirestore) {
  db.seed(`process_definitions/${DEFINITION_ID}`, {
    id: DEFINITION_ID,
    name: "Move-In",
    short_outcome: "x",
    trigger: "x",
    owner_uid: "owner",
    default_approver_uid: "approver",
    source_links: [],
    required_starting_inputs: [],
    steps: [
      { id: "step-1", title: "Intake form / tenant info" },
      { id: "step-2", title: "Collect onboarding documents & screening" },
    ],
    action_references: [],
    success_condition: "x",
    status: "Draft",
    created_by_uid: "owner",
    created_at: "2026-07-02T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
  });
  db.seed(`workflow_runs/${RUN_ID}`, {
    id: RUN_ID,
    definition_id: DEFINITION_ID,
    process_name: "Move-In",
    status: "In Progress",
    owner_uid: "owner",
    next_action: "Work the checklist.",
    due_date: "2026-07-10",
    is_test_run: true,
    simulation_only: true,
    production_metrics_included: false,
    started_by_uid: "editor-1",
    created_at: "2026-07-02T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
  });
}

let db: FakeFirestore;

beforeEach(() => {
  db = new FakeFirestore();
  seedRunAndDefinition(db);
});

function fs(): Firestore {
  return db as unknown as Firestore;
}

describe("setWorkflowRunStepCheck", () => {
  it("is gated at the edit tier — a plain Editor CAN check (NOT the Admin approve/write-back tier)", async () => {
    // Decision 2: desk bookkeeping gates at `edit`, not `approve`/`manageAdmin`. An Editor has edit
    // but neither approve nor manageAdmin, so its success proves the gate is not over-scoped to Admin.
    expect(can("Editor", "edit")).toBe(true);
    expect(can("Editor", "approve")).toBe(false);
    expect(can("Editor", "manageAdmin")).toBe(false);

    const check = await setWorkflowRunStepCheck(
      editor,
      { run_id: RUN_ID, step_id: "step-1", status: "Checked" },
      fs(),
    );
    expect(check.status).toBe("Checked");
    expect(check.checked_by_uid).toBe("editor-1");
    expect(check.step_title).toBe("Intake form / tenant info");
  });

  it("also allows Approver and Admin", async () => {
    await expect(
      setWorkflowRunStepCheck(
        approver,
        { run_id: RUN_ID, step_id: "step-1", status: "Checked" },
        fs(),
      ),
    ).resolves.toMatchObject({ status: "Checked" });
    await expect(
      setWorkflowRunStepCheck(
        admin,
        { run_id: RUN_ID, step_id: "step-2", status: "Checked" },
        fs(),
      ),
    ).resolves.toMatchObject({ status: "Checked" });
  });

  it("requires a reason to Skip a step", async () => {
    await expect(
      setWorkflowRunStepCheck(
        editor,
        { run_id: RUN_ID, step_id: "step-1", status: "Skipped" },
        fs(),
      ),
    ).rejects.toThrow(EditableLayerError);
    await expect(
      setWorkflowRunStepCheck(
        editor,
        { run_id: RUN_ID, step_id: "step-1", status: "Skipped", reason: "   " },
        fs(),
      ),
    ).rejects.toThrow(EditableLayerError);
    await expect(
      setWorkflowRunStepCheck(
        editor,
        {
          run_id: RUN_ID,
          step_id: "step-1",
          status: "Skipped",
          reason: "Not applicable this move-in.",
        },
        fs(),
      ),
    ).resolves.toMatchObject({
      status: "Skipped",
      reason: "Not applicable this move-in.",
    });
  });

  it("rejects a step that is not part of the run's process definition", async () => {
    await expect(
      setWorkflowRunStepCheck(
        editor,
        { run_id: RUN_ID, step_id: "step-999", status: "Checked" },
        fs(),
      ),
    ).rejects.toThrow(EditableLayerError);
  });

  it("rejects an unknown run (getWorkflowRun 404)", async () => {
    await expect(
      setWorkflowRunStepCheck(
        editor,
        { run_id: "missing-run", step_id: "step-1", status: "Checked" },
        fs(),
      ),
    ).rejects.toThrow(EditableLayerError);
  });

  it("rejects every checklist mutation after the run reaches a terminal state", async () => {
    db.seed(`workflow_runs/${RUN_ID}`, {
      ...db.store.get(`workflow_runs/${RUN_ID}`),
      status: "Completed",
    });

    await expect(
      setWorkflowRunStepCheck(
        editor,
        { run_id: RUN_ID, step_id: "step-1", status: "Checked" },
        fs(),
      ),
    ).rejects.toThrow(/cannot be changed after a workflow run is closed/);
    expect(
      db.store.has(`workflow_run_step_checks/${stepCheckDocId(RUN_ID, "step-1")}`),
    ).toBe(false);
  });

  it("upserts by (run, step) — re-checking overwrites rather than duplicates", async () => {
    await setWorkflowRunStepCheck(
      editor,
      { run_id: RUN_ID, step_id: "step-1", status: "Checked" },
      fs(),
    );
    const reset = await setWorkflowRunStepCheck(
      editor,
      {
        run_id: RUN_ID,
        step_id: "step-1",
        status: "Skipped",
        reason: "Changed my mind.",
      },
      fs(),
    );
    expect(reset.status).toBe("Skipped");

    const checks = await listStepChecksForRun(editor, RUN_ID, fs());
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe("Skipped");
    // Deterministic doc id (one row per run+step).
    expect(checks[0].id).toBe(stepCheckDocId(RUN_ID, "step-1"));
  });

  it("writes both the current-state doc and an append-only activity twin in one transaction", async () => {
    await setWorkflowRunStepCheck(
      editor,
      { run_id: RUN_ID, step_id: "step-1", status: "Checked" },
      fs(),
    );
    await setWorkflowRunStepCheck(
      editor,
      { run_id: RUN_ID, step_id: "step-1", status: "Unchecked" },
      fs(),
    );

    const checks = await listStepChecksForRun(editor, RUN_ID, fs());
    expect(checks).toHaveLength(1); // one current-state doc despite two writes

    const activity = await listWorkflowRunStepCheckActivity(editor, RUN_ID, fs());
    expect(activity).toHaveLength(2); // append-only: one row per write
    expect(activity.map((entry) => entry.new_status)).toEqual(["Checked", "Unchecked"]);
  });

  it("writes only the KB's own step-check collections (no system-of-record collection)", async () => {
    await setWorkflowRunStepCheck(
      editor,
      { run_id: RUN_ID, step_id: "step-1", status: "Checked" },
      fs(),
    );
    const paths = [...db.store.keys()];
    const written = paths.filter(
      (path) =>
        path.startsWith(`${WORKFLOW_RUN_STEP_CHECK_COLLECTIONS.checks}/`) ||
        path.startsWith(`${WORKFLOW_RUN_STEP_CHECK_COLLECTIONS.activity}/`),
    );
    // The only NEW docs are step-check + activity; nothing touched process_definitions/workflow_runs.
    expect(written).toHaveLength(2);
    expect(paths.some((path) => path.startsWith("process_definitions/move-in"))).toBe(
      true,
    ); // seeded, unchanged
  });
});
