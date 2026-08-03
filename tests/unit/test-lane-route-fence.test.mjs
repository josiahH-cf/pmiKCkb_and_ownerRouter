import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PROCESS_AUDIT_CASES } from "../../scripts/process-audit-cases.mjs";

const root = resolve(import.meta.dirname, "../..");

const RETIRED_TEST_ROUTES = Object.freeze([
  "app/api/admin/v1/fake-acceptance/route.ts",
  "app/api/admin/vendors/test/[vendorId]/audit/route.ts",
  "app/api/admin/vendors/test/route.ts",
  "app/api/approval-queue/test-fixtures/route.ts",
  "app/api/lease-renewal/test-runs/[runId]/business-events/route.ts",
  "app/api/lease-renewal/test-runs/[runId]/route.ts",
  "app/api/lease-renewal/test-runs/[runId]/test-actions/route.ts",
  "app/api/lease-renewal/test-runs/route.ts",
  "app/api/maintenance/tickets/[ticketId]/test-actions/route.ts",
  "app/api/maintenance/tickets/test-seed/route.ts",
  "app/api/process-definitions/[definitionId]/test-runs/route.ts",
  "app/api/spaces/[spaceId]/publications/test-fixture/route.ts",
  "app/api/vendor/tickets/[ticketId]/test-mailbox/route.ts",
]);

const ORDINARY_WORKFLOW_ROUTES = Object.freeze([
  "app/api/process-definitions/[definitionId]/runs/route.ts",
  "app/api/workflow-runs/[runId]/route.ts",
  "app/api/workflow-runs/[runId]/step-checks/route.ts",
]);

const RETIRED_RUNTIME_TOKENS = Object.freeze([
  "ApprovalTestFixturePanel",
  "TrustedPublicationTestFixturePanel",
  "approval-test-fixtures",
  "publication/test-fixture",
  "process-test-run",
  "test_fixture_key",
  "startWorkflowTestRun",
  "StartWorkflowTestRun",
  "last_successful_test_run_id",
  "source_publication_pin",
  "is_test_run",
  "simulation_only",
  "production_metrics_included",
  "assertTestLaneSurfaceAllowed",
  "assertTestDataModeWriteAllowed",
  "createIsolatedTestWorkspace",
  "isolatedTestWorkspace",
]);

const RUNTIME_ROOTS = Object.freeze(["app", "components", "lib", "scripts"]);
const RUNTIME_EXTENSIONS = /\.(?:js|mjs|ts|tsx)$/;
const INTENTIONAL_RETIREMENT_EVIDENCE = new Set([
  "lib/operations/production-test-record-catalog.ts",
  "lib/operations/production-test-retirement.ts",
  "scripts/retire-production-test-records.ts",
]);

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const absolutePath = resolve(directory, entry);
    if (statSync(absolutePath).isDirectory()) files.push(...walkFiles(absolutePath));
    else files.push(absolutePath);
  }
  return files;
}

function repositoryPath(absolutePath) {
  return relative(root, absolutePath).replaceAll("\\", "/");
}

describe("S56 retired Production Test-lane sentinel", () => {
  it.each(RETIRED_TEST_ROUTES)("keeps %s deleted", (relativePath) => {
    expect(existsSync(resolve(root, relativePath))).toBe(false);
  });

  it("has no API route whose path can mint or operate a retired Test workspace", () => {
    const routePaths = walkFiles(resolve(root, "app/api"))
      .map(repositoryPath)
      .filter((path) => path.endsWith("/route.ts"));

    expect(routePaths).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /\/(?:test|test-runs|test-actions|test-fixtures|test-fixture|test-seed|test-mailbox|fake-acceptance)(?:\/|$)/,
        ),
      ]),
    );
  }, 20_000);

  it.each(ORDINARY_WORKFLOW_ROUTES)(
    "retains %s as an ordinary Live app-plane route",
    (relativePath) => {
      const source = readFileSync(resolve(root, relativePath), "utf8");
      expect(source).not.toMatch(
        /TestLane|TestRun|test_fixture|data_mode:\s*["']test["']/,
      );
    },
  );

  it("keeps compatibility-lane modules deleted", () => {
    expect(existsSync(resolve(root, "lib/environment/test-lane.ts"))).toBe(false);
    expect(existsSync(resolve(root, "lib/environment/data-mode-write-boundary.ts"))).toBe(
      false,
    );
  });

  it("makes the generic Approval Queue create schema structurally Live-only", () => {
    const schemas = readFileSync(resolve(root, "lib/firestore/schemas.ts"), "utf8");
    expect(schemas).toMatch(
      /CreateApprovalQueueItemInputSchema\s*=\s*z\.object\(\{[\s\S]*?data_mode:\s*z\.literal\(["']live["']\)\.optional\(\)/,
    );
  });

  it("removes Production product-rehearsal cases from the process-audit inventory", () => {
    const harnessCase = PROCESS_AUDIT_CASES.find(({ id }) => id === "PRE-008");
    const productCases = PROCESS_AUDIT_CASES.filter(({ id }) => id !== "PRE-008");
    const retiredRoutePattern =
      /(?:test-runs|test-actions|test-fixtures|test-fixture|test-seed|test-mailbox|fake-acceptance)/i;

    expect(harnessCase).toMatchObject({
      route: "process-audit runner",
      surface: "Audit harness",
    });
    expect(productCases.some(({ data_mode }) => data_mode === "test")).toBe(false);
    expect(productCases.some(({ data_mode }) => data_mode === "sample")).toBe(false);
    expect(
      productCases.filter((auditCaseDefinition) =>
        retiredRoutePattern.test(JSON.stringify(auditCaseDefinition)),
      ),
    ).toEqual([]);
    expect(PROCESS_AUDIT_CASES.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining([
        "CONSOLE-010",
        "SPACE-004",
        "COMM-005",
        "ADMIN-005",
        "LEASE-TEST-001",
        "MAINT-TEST-001",
        "VENDOR-ADMIN-001",
        "VENDOR-PORTAL-001",
      ]),
    );
  });

  it("keeps every retired lane token outside executable product code", () => {
    const runtimeSources = RUNTIME_ROOTS.flatMap((runtimeRoot) =>
      walkFiles(resolve(root, runtimeRoot))
        .filter((path) => RUNTIME_EXTENSIONS.test(path))
        .filter((path) => !INTENTIONAL_RETIREMENT_EVIDENCE.has(repositoryPath(path)))
        .map((path) => ({
          path: repositoryPath(path),
          source: readFileSync(path, "utf8"),
        })),
    );
    const offenders = RETIRED_RUNTIME_TOKENS.flatMap((retiredToken) =>
      runtimeSources
        .filter(({ source }) => source.includes(retiredToken))
        .map(({ path }) => `${retiredToken}: ${path}`),
    );

    expect(
      offenders,
      `Retired runtime tokens returned:\n${offenders.join("\n")}`,
    ).toEqual([]);

    const retiredAuditCopy = [
      "Full isolated Test workspace",
      "reserved Test fixture",
      "mutable Test fixture",
      "safe Test inputs",
    ];
    const auditSources = [
      "scripts/process-audit-cases.mjs",
      "scripts/process-audit-runner.mjs",
    ].map((path) => ({ path, source: readFileSync(resolve(root, path), "utf8") }));
    const auditCopyOffenders = retiredAuditCopy.flatMap((marker) =>
      auditSources
        .filter(({ source }) => source.includes(marker))
        .map(({ path }) => `${marker}: ${path}`),
    );
    expect(auditCopyOffenders).toEqual([]);
  }, 20_000);
});
