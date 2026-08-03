import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const retiredProductionPaths = [
  "app/api/admin/v1/fake-acceptance/route.ts",
  "app/api/lease-renewal/test-runs/route.ts",
  "app/api/lease-renewal/test-runs/[runId]/route.ts",
  "app/api/lease-renewal/test-runs/[runId]/test-actions/route.ts",
  "app/api/lease-renewal/test-runs/[runId]/business-events/route.ts",
  "app/api/lease-renewal/owner-notice-draft/route.ts",
  "app/api/lease-renewal/tenant-notice-draft/route.ts",
  "app/api/process-definitions/[definitionId]/test-runs/route.ts",
  "components/admin/V1ProductionTestWorkspacePanel.tsx",
  "components/console/StartTestRunButton.tsx",
  "components/lease-renewal/LeaseTestJourney.tsx",
  "components/lease-renewal/LeaseTestRunsWorkspace.tsx",
  "components/lease-renewal/LeaseRenewalRunClient.tsx",
  "components/lease-renewal/PrepareOwnerEmailButton.tsx",
  "components/lease-renewal/PrepareTenantEmailButton.tsx",
  "components/operations/TestOperationalHandoffPanel.tsx",
  "lib/firestore/lease-renewal-test-runs.ts",
  "lib/lease-renewal/test-workflow.ts",
  "lib/lease-renewal/simulation.ts",
  "lib/lease-renewal/sample-desk.ts",
  "lib/operations/test-handoff-loader.ts",
  "lib/operations/test-handoffs.ts",
  "lib/release/fake-acceptance.ts",
  "lib/release/synthetic-execution.ts",
  "lib/release/synthetic-vendor-acceptance.ts",
] as const;

describe("S56 Production Test-workspace retirement", () => {
  it("keeps every retired route, workspace, executor harness, and persistence seam absent", () => {
    expect(retiredProductionPaths.filter((path) => existsSync(join(root, path)))).toEqual(
      [],
    );
  });

  it("keeps the ordinary human-started run route without restoring the Test endpoint", () => {
    const source = readFileSync(
      join(root, "app/api/process-definitions/[definitionId]/runs/route.ts"),
      "utf8",
    );
    expect(source).toContain("startWorkflowRun");
    expect(source).toContain('requireCapability("edit")');
    expect(source).not.toMatch(/TestRun|test-runs|data_mode\s*:\s*["']test/);
  });

  it("exports no isolated Test executor constructor from the Production orchestrator", () => {
    const source = readFileSync(
      join(root, "lib/external-execution/orchestrator.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /createIsolatedTestExternalActionOrchestrator|markIsolatedTestExecutor|isolatedTestWorkspace/,
    );
    expect(source).toContain("Production external execution refuses Test records.");
  });
});
