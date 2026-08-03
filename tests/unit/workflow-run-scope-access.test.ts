import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { WorkflowRunRecord } from "@/lib/firestore/types";
import {
  canAccessWorkflowRun,
  filterWorkflowRunsForUser,
} from "@/lib/space-scope-resources";

const maintenanceUser: AuthenticatedUser = {
  uid: "maintenance-editor",
  email: "maintenance-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  scopes: ["maintenance"],
};
const renewalUser: AuthenticatedUser = {
  ...maintenanceUser,
  uid: "renewal-editor",
  email: "renewal-editor@pmikcmetro.com",
  scopes: ["renewals"],
};
const wildcardUser: AuthenticatedUser = {
  ...maintenanceUser,
  uid: "wildcard-editor",
  email: "wildcard-editor@pmikcmetro.com",
  scopes: undefined,
};

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
  it("authorizes a custom definition through the exact Space stamped on its run", () => {
    expect(
      canAccessWorkflowRun(
        maintenanceUser,
        run("custom-def", "maintenance-work-order-intake"),
      ),
    ).toBe(true);
    expect(
      canAccessWorkflowRun(
        renewalUser,
        run("custom-def", "maintenance-work-order-intake"),
      ),
    ).toBe(false);
  });

  it("prefers run.space_id over a conflicting launch-definition mapping", () => {
    expect(
      canAccessWorkflowRun(
        maintenanceUser,
        run("lease-renewal", "maintenance-work-order-intake"),
      ),
    ).toBe(true);
    expect(
      canAccessWorkflowRun(
        renewalUser,
        run("lease-renewal", "maintenance-work-order-intake"),
      ),
    ).toBe(false);
  });

  it("falls back to the definition mapping only for legacy unstamped runs", () => {
    expect(canAccessWorkflowRun(renewalUser, run("lease-renewal"))).toBe(true);
    expect(canAccessWorkflowRun(maintenanceUser, run("lease-renewal"))).toBe(false);
  });

  it("denies an unmapped stamped Space to scoped users", () => {
    expect(canAccessWorkflowRun(maintenanceUser, run("custom-def", "unknown"))).toBe(
      false,
    );
  });

  it("preserves the historical unscoped wildcard behavior", () => {
    expect(canAccessWorkflowRun(wildcardUser, run("custom-def", "unknown"))).toBe(true);
  });

  it("filters mixed runs using the exact binding and keeps both API routes fenced", () => {
    const runs = [
      workflowRun("allowed", "custom-def", "maintenance-work-order-intake"),
      workflowRun("denied", "lease-renewal", "lease-renewals"),
    ];
    expect(
      filterWorkflowRunsForUser(maintenanceUser, runs).map((item) => item.id),
    ).toEqual(["allowed"]);

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
