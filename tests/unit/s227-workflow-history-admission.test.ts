import type { Firestore } from "firebase-admin/firestore";
import { expect, it, vi } from "vitest";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import {
  getWorkflowRunDefinition,
  listWorkflowRunTimeline,
} from "@/lib/firestore/workflows";
import {
  getWorkflowRunStepCheck,
  listStepChecksForRun,
  listWorkflowRunStepCheckActivity,
} from "@/lib/firestore/workflow-run-step-checks";

const actor = {
  uid: "staff",
  email: "staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
const cases = [
  { id: "retained-definition", space: "maintenance" },
  { id: "maintenance-work-order-intake", space: "lease-renewals" },
  { id: "retained-definition", space: "maintenance-work-order-intake" },
  { id: "retained-definition", space: "vendor-assignment-handoff" },
];

function fixture(id: string, space: string) {
  const fake = new FakeFirestore();
  const definition = {
    id,
    space_id: space,
    name: "Knowledge mentions maintenance",
    short_outcome: "Staff work",
    trigger: "Manual",
    owner_uid: actor.uid,
    default_approver_uid: actor.uid,
    source_links: [],
    required_starting_inputs: [],
    steps: [{ id: "step", title: "Retained work" }],
    action_references: [],
    success_condition: "Recorded",
    status: "Active",
    active_version_id: "retained-version",
  };
  const run = { definition_id: id, space_id: space };
  fake.seed(`process_definitions/${id}`, definition);
  fake.seed("process_definition_versions/retained-version", {
    id: "retained-version",
    definition_id: id,
    version_number: 1,
    snapshot_json: JSON.stringify(definition),
  });
  fake.seed("workflow_runs/retained-run", run);
  fake.seed("workflow_run_timeline/history", {
    run_id: "retained-run",
    created_at: "2026-10-01",
  });
  fake.seed("workflow_run_step_checks/retained-run_step", {
    run_id: "retained-run",
    status: "Checked",
    created_at: "2026-10-01",
  });
  fake.seed("workflow_run_step_check_activity/history", {
    run_id: "retained-run",
    created_at: "2026-10-01",
  });
  return { fake, db: fake as unknown as Firestore, run };
}

it.each(cases)(
  "refuses retained history from $space/$id before definition, version, timeline or check reads",
  async ({ id, space }) => {
    const { fake, db, run } = fixture(id, space);
    const before = JSON.stringify([...fake.store]);
    const collections = vi.spyOn(fake, "collection");
    const results = await Promise.allSettled([
      getWorkflowRunDefinition(actor, run, db),
      getWorkflowRunDefinition(
        actor,
        { ...run, definition_version_id: "retained-version" },
        db,
      ),
      listWorkflowRunTimeline(actor, "retained-run", db),
      getWorkflowRunStepCheck(actor, "retained-run", "step", db),
      listStepChecksForRun(actor, "retained-run", db),
      listWorkflowRunStepCheckActivity(actor, "retained-run", db),
    ]);
    expect(
      results.map((result) =>
        result.status === "rejected" ? result.reason.status : 200,
      ),
    ).toEqual([410, 410, 410, 410, 410, 410]);
    expect(
      collections.mock.calls
        .map(([name]) => name)
        .filter((name) => name !== "workflow_runs"),
    ).toEqual([]);
    expect(JSON.stringify([...fake.store])).toBe(before);
  },
);

it("preserves ordinary renewal/staff history even when its knowledge prose mentions maintenance", async () => {
  const { db, run } = fixture("ordinary-knowledge", "owner-renewal-outreach");
  expect((await getWorkflowRunDefinition(actor, run, db)).name).toBe(
    "Knowledge mentions maintenance",
  );
  expect(await listWorkflowRunTimeline(actor, "retained-run", db)).toHaveLength(1);
  expect(await listStepChecksForRun(actor, "retained-run", db)).toHaveLength(1);
  expect(await listWorkflowRunStepCheckActivity(actor, "retained-run", db)).toHaveLength(
    1,
  );
});
