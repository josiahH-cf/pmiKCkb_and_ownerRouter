import { expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import {
  createProcessDefinition,
  startWorkflowRun,
  updateWorkflowRunOutcome,
  updateProcessDefinition,
  submitProcessDefinitionForApproval,
} from "@/lib/firestore/workflows";
import { publishProcessDefinition } from "@/lib/publication/process-definition";
import { setWorkflowRunStepCheck } from "@/lib/firestore/workflow-run-step-checks";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { routesForRole } from "@/lib/production-assurance/manifest";

const actor: AuthenticatedUser = {
  uid: "fixture-staff",
  email: "fixture@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
it.each([
  { id: "retained-definition", space: "maintenance" },
  { id: "maintenance-work-order-intake", space: "renewals" },
  { id: "intake-custom-definition", space: "maintenance-work-order-intake" },
  { id: "vendor-custom-definition", space: "vendor-assignment-handoff" },
])(
  "refuses shared start, update and checklist writes for $id without changing retained records",
  async ({ id, space }) => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    fake.seed(`process_definitions/${id}`, {
      name: "Retained fixture",
      status: "Active",
      space_id: space,
      steps: [],
    });
    fake.seed("workflow_runs/retained-run", {
      definition_id: id,
      status: "In Progress",
      space_id: space,
    });
    const before = JSON.stringify([...fake.store]);
    await expect(
      updateProcessDefinition(actor, id, { name: "Changed" }, db),
    ).rejects.toMatchObject({ status: 410 });
    await expect(
      submitProcessDefinitionForApproval(actor, id, {}, db),
    ).rejects.toMatchObject({ status: 410 });
    await expect(publishProcessDefinition(actor, id, {}, { db })).rejects.toMatchObject({
      status: 410,
    });
    await expect(startWorkflowRun(actor, id, {}, db)).rejects.toMatchObject({
      status: 410,
    });
    await expect(
      updateWorkflowRunOutcome(
        actor,
        "retained-run",
        { action: "fail", notes: "Fixture only" },
        db,
      ),
    ).rejects.toMatchObject({ status: 410 });
    await expect(
      setWorkflowRunStepCheck(
        actor,
        { run_id: "retained-run", step_id: "retained-step", status: "Checked" },
        db,
      ),
    ).rejects.toMatchObject({ status: 410 });
    expect(JSON.stringify([...fake.store])).toBe(before);
  },
);
it.each(["maintenance", "maintenance-work-order-intake", "vendor-assignment-handoff"])(
  "refuses a new %s process before creating any record",
  async (spaceId) => {
    const fake = new FakeFirestore();
    await expect(
      createProcessDefinition(
        actor,
        {
          space_id: spaceId,
          name: "Fixture maintenance",
          short_outcome: "Fixture only",
          trigger: "Manual",
          owner_uid: actor.uid,
          default_approver_uid: actor.uid,
          steps: [{ title: "Fixture step" }],
          success_condition: "Fixture complete",
        },
        fake as unknown as Firestore,
      ),
    ).rejects.toMatchObject({ status: 410 });
    expect(fake.store.size).toBe(0);
  },
);
it.each(["Admin", "Editor"] as const)(
  "requires read-only history for a new %s candidate without accepting older operational landmarks",
  (role) => {
    const route = routesForRole(role, "a".repeat(40)).find(
      (r) => r.key === "maintenance",
    );
    expect(route).toMatchObject({
      path: "/maintenance/history",
      heading: "Read-only maintenance history",
      expectedOutcome: "rendered",
    });
    const predecessor = routesForRole(
      role,
      "eb5d35991c3ec128a102e4483d3779af16106821",
    ).find((r) => r.key === "maintenance");
    expect(predecessor).toMatchObject({ path: "/maintenance", heading: "Maintenance" });
  },
);
