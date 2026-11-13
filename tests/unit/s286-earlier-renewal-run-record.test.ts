import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import type { WorkflowRunRecord } from "@/lib/firestore/types";
import {
  listStepChecksForRun,
  listWorkflowRunStepCheckActivity,
  setWorkflowRunStepCheck,
  stepCheckDocId,
  WORKFLOW_RUN_STEP_CHECK_COLLECTIONS,
} from "@/lib/firestore/workflow-run-step-checks";
import {
  getWorkflowRun,
  getWorkflowRunDefinition,
  listWorkflowRunTimeline,
  listWorkflowRuns,
  normalizeDefinitionFields,
  updateWorkflowRunOutcome,
} from "@/lib/firestore/workflows";
import {
  OWNER_RENEWAL_OUTREACH_STEP_TITLES,
  buildOwnerRenewalOutreachProcessTemplate,
} from "@/lib/lease-renewal/owner-renewal-outreach/process-template";
import { projectProcessRead } from "@/lib/operational-context/projections";
import { GUIDANCE_ONLY_RUN_RECORD_NOTICE } from "@/lib/processes/guidance-only";
import {
  WORKFLOW_RUN_NO_NEXT_ACTION,
  workflowRunNextAction,
} from "@/lib/processes/run-next-action";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

// S286 R-S286-3, ARCH-S286-2, BEH-S286-3, AC-S286-3 and AC-S286-6: a run of a renewal process
// that already exists stays readable with its pinned version, steps, checks and history. Its
// checklist and outcome refuse every change, its stored record stays byte for byte, and it
// supplies no next action to shared context. No run is deleted, completed or cancelled. Synthetic
// fixtures only, modeled on a run the starting state's run start wrote.

const DEFINITION_ID = "owner-renewal-outreach";
const VERSION_ID = "renewal-version-1";
const RUN_ID = "earlier-renewal-run";
const editor: AuthenticatedUser = {
  uid: "fixture-editor",
  email: "fixture-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

const published = {
  ...normalizeDefinitionFields(
    CreateProcessDefinitionInputSchema.parse({
      ...buildOwnerRenewalOutreachProcessTemplate({
        ownerUid: "process-owner-PLACEHOLDER",
        approverUid: "process-approver-PLACEHOLDER",
        sourceLinks: [
          { label: "Synthetic procedure", url: "https://example.test/procedure" },
        ],
      }),
      space_id: DEFINITION_ID,
    }),
  ),
  id: DEFINITION_ID,
  status: "Active" as const,
  active_version_id: VERSION_ID,
};
const steps = published.steps;

let fake: FakeFirestore;
let db: Firestore;

beforeEach(() => {
  fake = new FakeFirestore();
  db = fake as unknown as Firestore;
  fake.seed(`process_definitions/${DEFINITION_ID}`, {
    ...published,
    created_by_uid: "fixture-admin",
    updated_by_uid: "fixture-admin",
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  });
  fake.seed(`process_definition_versions/${VERSION_ID}`, {
    id: VERSION_ID,
    definition_id: DEFINITION_ID,
    version_number: 1,
    snapshot_json: JSON.stringify(published),
    created_at: "2026-11-01T00:00:00.000Z",
  });
  fake.seed(`workflow_runs/${RUN_ID}`, { ...earlierRun() });
  fake.seed(
    `${WORKFLOW_RUN_STEP_CHECK_COLLECTIONS.checks}/${stepCheckDocId(RUN_ID, steps[0].id)}`,
    {
      id: stepCheckDocId(RUN_ID, steps[0].id),
      run_id: RUN_ID,
      definition_id: DEFINITION_ID,
      step_id: steps[0].id,
      step_title: steps[0].title,
      status: "Checked",
      checked_by_uid: "fixture-editor",
      checked_at: "2026-11-02T00:00:00.000Z",
      created_at: "2026-11-02T00:00:00.000Z",
      updated_at: "2026-11-02T00:00:00.000Z",
    },
  );
  fake.seed(`${WORKFLOW_RUN_STEP_CHECK_COLLECTIONS.activity}/activity-1`, {
    id: "activity-1",
    run_id: RUN_ID,
    step_id: steps[0].id,
    actor_uid: "fixture-editor",
    action: "Checked",
    new_status: "Checked",
    created_at: "2026-11-02T00:00:00.000Z",
  });
  fake.seed("workflow_run_timeline/timeline-1", {
    id: "timeline-1",
    run_id: RUN_ID,
    actor_uid: "fixture-editor",
    event_type: "started",
    summary: `Started workflow run. Definition version: ${VERSION_ID}.`,
    new_status: "In Progress",
    created_at: "2026-11-01T12:00:00.000Z",
  });
});

function earlierRun(overrides: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return {
    id: RUN_ID,
    data_mode: "live",
    definition_id: DEFINITION_ID,
    space_id: DEFINITION_ID,
    definition_version_id: VERSION_ID,
    process_name: published.name,
    status: "In Progress",
    owner_uid: "process-approver-PLACEHOLDER",
    next_action: steps[0].title,
    due_date: "2026-11-10",
    started_by_uid: "fixture-editor",
    created_at: "2026-11-01T12:00:00.000Z",
    updated_at: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

function snapshot() {
  return JSON.stringify([...fake.store.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function count(prefix: string) {
  return [...fake.store.keys()].filter((key) => key.startsWith(`${prefix}/`)).length;
}

describe("ARCH-S286-2 the read path of an earlier renewal run", () => {
  it("ARCH-S286-2 reads the run, its pinned six steps, its checks and its history unchanged", async () => {
    const before = snapshot();

    const run = await getWorkflowRun(editor, RUN_ID, db);
    expect(run).toMatchObject({
      id: RUN_ID,
      status: "In Progress",
      definition_version_id: VERSION_ID,
    });
    const definition = await getWorkflowRunDefinition(editor, run, db);
    expect(definition.steps.map((step) => step.title)).toEqual([
      ...OWNER_RENEWAL_OUTREACH_STEP_TITLES,
    ]);
    expect(definition.steps).toHaveLength(6);
    expect(await listStepChecksForRun(editor, RUN_ID, db)).toEqual([
      expect.objectContaining({ step_id: steps[0].id, status: "Checked" }),
    ]);
    expect(await listWorkflowRunStepCheckActivity(editor, RUN_ID, db)).toHaveLength(1);
    expect(await listWorkflowRunTimeline(editor, RUN_ID, db)).toEqual([
      expect.objectContaining({ event_type: "started" }),
    ]);
    expect(
      (await listWorkflowRuns(editor, { definitionId: DEFINITION_ID }, db)).map(
        (item) => item.id,
      ),
    ).toEqual([RUN_ID]);
    expect(snapshot()).toBe(before);
  });
});

describe("BEH-S286-3 an earlier renewal run refuses every change", () => {
  it.each(["Checked", "Unchecked"] as const)(
    "BEH-S286-3 refuses a %s step change with the record sentence and keeps the record byte for byte",
    async (status) => {
      const before = snapshot();
      await expect(
        setWorkflowRunStepCheck(
          editor,
          { run_id: RUN_ID, step_id: steps[1].id, status },
          db,
        ),
      ).rejects.toMatchObject({ status: 409, message: GUIDANCE_ONLY_RUN_RECORD_NOTICE });
      await expect(
        setWorkflowRunStepCheck(
          editor,
          { run_id: RUN_ID, step_id: steps[0].id, status },
          db,
        ),
      ).rejects.toMatchObject({ status: 409, message: GUIDANCE_ONLY_RUN_RECORD_NOTICE });
      expect(snapshot()).toBe(before);
    },
  );

  it("BEH-S286-3 refuses a skip with a reason as well", async () => {
    const before = snapshot();
    await expect(
      setWorkflowRunStepCheck(
        editor,
        {
          run_id: RUN_ID,
          step_id: steps[2].id,
          status: "Skipped",
          reason: "Not needed.",
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 409, message: GUIDANCE_ONLY_RUN_RECORD_NOTICE });
    expect(snapshot()).toBe(before);
  });

  it.each(["complete", "fail"] as const)(
    "AC-S286-3 refuses to %s the run, so no run is completed or closed by this change",
    async (action) => {
      const before = snapshot();
      await expect(
        updateWorkflowRunOutcome(editor, RUN_ID, { action, notes: "Synthetic." }, db),
      ).rejects.toMatchObject({ status: 409, message: GUIDANCE_ONLY_RUN_RECORD_NOTICE });
      expect(snapshot()).toBe(before);
      expect((await getWorkflowRun(editor, RUN_ID, db)).status).toBe("In Progress");
    },
  );

  it("AC-S286-6 leaves runs, checks, activity and history counts equal", async () => {
    const before = {
      runs: count("workflow_runs"),
      checks: count(WORKFLOW_RUN_STEP_CHECK_COLLECTIONS.checks),
      activity: count(WORKFLOW_RUN_STEP_CHECK_COLLECTIONS.activity),
      timeline: count("workflow_run_timeline"),
      definitions: count("process_definitions"),
      versions: count("process_definition_versions"),
    };
    for (const step of steps)
      await setWorkflowRunStepCheck(
        editor,
        { run_id: RUN_ID, step_id: step.id, status: "Checked" },
        db,
      ).catch(() => undefined);
    await updateWorkflowRunOutcome(editor, RUN_ID, { action: "complete" }, db).catch(
      () => undefined,
    );
    expect({
      runs: count("workflow_runs"),
      checks: count(WORKFLOW_RUN_STEP_CHECK_COLLECTIONS.checks),
      activity: count(WORKFLOW_RUN_STEP_CHECK_COLLECTIONS.activity),
      timeline: count("workflow_run_timeline"),
      definitions: count("process_definitions"),
      versions: count("process_definition_versions"),
    }).toEqual(before);
  });
});

describe("AC-S286-3 an earlier renewal run supplies no next action", () => {
  const other: WorkflowRunRecord = {
    id: "move-in-run",
    data_mode: "live",
    definition_id: "move-in",
    space_id: "move-in",
    process_name: "Move-In",
    status: "In Progress",
    owner_uid: "staff-approver-1",
    next_action: "Confirm the move-in date",
    due_date: "2026-11-10",
    started_by_uid: "fixture-editor",
    created_at: "2026-11-01T12:00:00.000Z",
    updated_at: "2026-11-01T12:00:00.000Z",
  };

  it("AC-S286-3 names None for the record, with or without its checklist", () => {
    const run = earlierRun();
    expect(workflowRunNextAction(run)).toBe(WORKFLOW_RUN_NO_NEXT_ACTION);
    expect(workflowRunNextAction(run, { steps, checks: [] })).toBe(
      WORKFLOW_RUN_NO_NEXT_ACTION,
    );
    // A run on another Space keeps its next action.
    expect(workflowRunNextAction(other)).toBe("Confirm the move-in date");
  });

  it("AC-S286-3 is absent from the shared context while another Space's run stays", () => {
    const read = projectProcessRead({
      definitions: [],
      runs: [earlierRun(), other],
      runsFailed: false,
      asOf: "2026-11-13T12:00:00.000Z",
    });
    expect(read.records.map((record) => record.ref.id)).toEqual(["run:move-in-run"]);
    expect(read.records[0].detail).toContain("Next: Confirm the move-in date");
    expect(JSON.stringify(read.records)).not.toContain(RUN_ID);
  });
});
