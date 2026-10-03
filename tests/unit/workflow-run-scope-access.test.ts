import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AuthError, type AuthenticatedUser } from "@/lib/auth/session";
import type { WorkflowRunRecord } from "@/lib/firestore/types";
import {
  assertWorkflowRunAccess,
  canAccessWorkflowRun,
  filterWorkflowRunsForUser,
} from "@/lib/space-scope-resources";

// S167: every authenticated internal staff account has every existing internal Space, so a
// workflow run is open to staff whatever Space it is stamped with. The three accounts below used
// to hold a maintenance-only allowlist, a renewals-only allowlist and no allowlist.
const maintenanceUser: AuthenticatedUser = {
  uid: "maintenance-editor",
  email: "maintenance-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const renewalUser: AuthenticatedUser = {
  ...maintenanceUser,
  uid: "renewal-editor",
  email: "renewal-editor@pmikcmetro.com",
};
const approverUser: AuthenticatedUser = {
  ...maintenanceUser,
  uid: "approver",
  email: "approver@pmikcmetro.com",
  role: "Approver",
};
const staff = [maintenanceUser, renewalUser, approverUser];

function run(
  definition_id: string,
  space_id?: string,
): Parameters<typeof canAccessWorkflowRun>[1] {
  return { definition_id, ...(space_id ? { space_id } : {}) };
}

function workflowRun(
  id: string,
  definition_id: string,
  space_id?: string,
): WorkflowRunRecord {
  return {
    id,
    ...run(definition_id, space_id),
    process_name: "Scoped workflow",
    status: "In Progress",
    owner_uid: "owner-1",
    next_action: "Review the workflow.",
    due_date: "2026-08-10",
    started_by_uid: "starter-1",
    created_at: "2026-08-03T00:00:00.000Z",
    updated_at: "2026-08-03T00:00:00.000Z",
  };
}

describe("workflow-run Space binding", () => {
  // S167: each of these used to be refused to the account whose allowlist missed the run's Space.
  it.each([
    [
      "a custom definition's run stamped with the Maintenance Space",
      run("custom-def", "maintenance-work-order-intake"),
    ],
    [
      "a run whose stamped Space conflicts with its launch-definition mapping",
      run("lease-renewal", "maintenance-work-order-intake"),
    ],
    ["a legacy unstamped run of the Lease Renewal definition", run("lease-renewal")],
    ["a legacy unstamped run of a custom definition", run("custom-def")],
    ["a run stamped with an unmapped Space", run("custom-def", "unknown")],
  ])("opens %s to every staff account", (_label, target) => {
    for (const user of staff) {
      expect(canAccessWorkflowRun(user, target)).toBe(true);
      expect(() => assertWorkflowRunAccess(user, target)).not.toThrow();
    }
  });

  it("still refuses a run to an actor that carries no identity", () => {
    const anonymous: AuthenticatedUser = { ...maintenanceUser, uid: "" };

    for (const target of [
      run("custom-def", "maintenance-work-order-intake"),
      run("lease-renewal"),
      run("custom-def", "unknown"),
    ]) {
      expect(canAccessWorkflowRun(anonymous, target)).toBe(false);
      expect(() => assertWorkflowRunAccess(anonymous, target)).toThrow(AuthError);
    }
  });

  it("returns every mixed run to a staff account and keeps both API routes fenced", () => {
    const runs = [
      workflowRun("maintenance-run", "custom-def", "maintenance-work-order-intake"),
      workflowRun("renewals-run", "lease-renewal", "lease-renewals"),
      workflowRun("unmapped-run", "custom-def", "unknown"),
    ];
    // S167: the Renewals and unmapped runs used to be filtered out for a maintenance-only account.
    expect(
      filterWorkflowRunsForUser(maintenanceUser, runs).map((item) => item.id),
    ).toEqual(["maintenance-run", "renewals-run", "unmapped-run"]);
    expect(
      filterWorkflowRunsForUser({ ...maintenanceUser, uid: "" }, runs).map(
        (item) => item.id,
      ),
    ).toEqual([]);

    for (const route of [
      "app/api/workflow-runs/[runId]/route.ts",
      "app/api/workflow-runs/[runId]/step-checks/route.ts",
    ]) {
      expect(readFileSync(join(process.cwd(), route), "utf8")).toContain(
        "assertWorkflowRunAccess",
      );
    }
  });
});
