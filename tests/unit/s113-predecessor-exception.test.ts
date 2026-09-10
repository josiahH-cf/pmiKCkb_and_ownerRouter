import { describe, expect, it } from "vitest";
import type { ConsoleMessage, Request } from "playwright-core";
import { PredecessorExceptionObserver } from "@/lib/production-assurance/predecessor-exception-observer";
import {
  APPROVED_PREDECESSOR,
  PREDECESSOR_EXCEPTION,
  isExactPredecessorException,
} from "@/lib/production-assurance/predecessor-exception.mjs";
import {
  emptyDiagnosticCounts,
  routesForRole,
  PRODUCTION_ASSURANCE_SCHEMA_VERSION,
  type ProductionAssuranceEvidence,
} from "@/lib/production-assurance";
import {
  buildCandidateAssuranceReceipt,
  assertCandidateAssuranceReceipt,
} from "../../scripts/production-assurance-receipts.mjs";

function report(): ProductionAssuranceEvidence {
  return {
    schemaVersion: PRODUCTION_ASSURANCE_SCHEMA_VERSION,
    generatedAt: "2026-09-10T22:00:00.000Z",
    phase: "rollback",
    expectedCommit: APPROVED_PREDECESSOR.expectedCommit,
    expectedRevision: APPROVED_PREDECESSOR.expectedRevision,
    actorRole: "Admin",
    verdict: "failed",
    routes: routesForRole("Admin").map((route) => ({
      actorRole: "Admin",
      routeKey: route.key,
      outcome: route.key === "my_work" ? "failed" : "rendered",
      statusClass: "2xx",
      elapsedMs: 1000,
      landmarkPresent: true,
      diagnostics: {
        ...emptyDiagnosticCounts(),
        ...(route.key === "my_work"
          ? { mutation_attempt: 1, request_failed: 1, console_error: 1 }
          : {}),
      },
    })),
    reconciliation: null,
    monitoring: null,
    observation: null,
  };
}
function observed(
  options: {
    body?: string;
    url?: string;
    method?: string;
    route?: string;
    aborted?: boolean;
    failure?: string;
    consoleText?: string;
    differentRequest?: boolean;
  } = {},
) {
  const observer = new PredecessorExceptionObserver();
  const request = {
    method: () => options.method ?? "POST",
    url: () => options.url ?? `${APPROVED_PREDECESSOR.canonicalOrigin}/api/work`,
    postData: () => options.body ?? '{"action":"reconcile"}',
    failure: () => ({
      errorText: options.failure ?? "net::ERR_BLOCKED_BY_CLIENT.Inspector",
    }),
  } as Request;
  const route = options.route ?? "my_work";
  // The requestfailed event can arrive before abort's promise settles.
  observer.requestFailed(
    route,
    options.differentRequest ? ({ ...request } as Request) : request,
  );
  if (options.aborted !== false) observer.mutationBlocked(route, request);
  observer.consoleMessage(route, {
    type: () => "error",
    location: () => ({ url: request.url() }),
    text: () =>
      options.consoleText ??
      "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
  } as ConsoleMessage);
  return observer;
}

describe("owner-approved exact predecessor exception", () => {
  it("refuses unknown own fields in place of inherited approved fields", () => {
    const forged = Object.assign(
      Object.create({ dispatchedWrites: 0 }),
      PREDECESSOR_EXCEPTION,
    );
    delete forged.dispatchedWrites;
    forged.unapprovedField = "unit-only";
    expect(isExactPredecessorException(forged)).toBe(false);
  });
  it("retains the failed report and accepts only the matched pre-dispatch blocked defect", () => {
    const raw = report();
    expect(observed().evidence(APPROVED_PREDECESSOR, raw)).toEqual(PREDECESSOR_EXCEPTION);
    expect(raw.verdict).toBe("failed");
    expect(
      observed().evidence(APPROVED_PREDECESSOR, {
        ...raw,
        monitoring: {
          configurationReady: true,
          readComplete: true,
          candidateFiveXxCount: 0,
          unresolvedLiveEffectCount: 0,
        },
      }),
    ).toBeNull();
    expect(
      raw.routes.find((route) => route.routeKey === "my_work")?.diagnostics
        .mutation_attempt,
    ).toBe(1);
  });
  it.each([
    { body: '{"action":"reconcile_team","limit":100}' },
    { body: '{"action":"reconcile","extra":true}' },
    { body: '{"action":"other","action":"reconcile"}' },
    { body: "bad" },
    { method: "PUT" },
    { route: "dashboard" },
    { aborted: false },
    { url: `${APPROVED_PREDECESSOR.canonicalOrigin}/api/work?extra=1` },
    { failure: "net::ERR_CONNECTION_RESET" },
    { consoleText: "Other application error" },
    { differentRequest: true },
  ])("refuses unmatched blocked evidence %j", (options) => {
    expect(observed(options).evidence(APPROVED_PREDECESSOR, report())).toBeNull();
  });
  it.each([
    { browserPolicy: "admin-editor" },
    { canonicalOrigin: "https://candidate.example" },
    { expectedCommit: "a".repeat(40) },
    { expectedRevision: "pmi-kc-app-other" },
  ])("refuses other predecessor coordinates %j", (patch) => {
    expect(
      observed().evidence({ ...APPROVED_PREDECESSOR, ...patch }, report()),
    ).toBeNull();
  });
  it("refuses candidate/post-promotion phases, missing routes, extra attempts and unrelated errors", () => {
    for (const phase of ["candidate", "post_promotion"] as const) {
      expect(
        observed().evidence(APPROVED_PREDECESSOR, { ...report(), phase }),
      ).toBeNull();
    }
    const missing = report();
    expect(() =>
      observed().evidence(APPROVED_PREDECESSOR, {
        ...missing,
        routes: missing.routes.slice(1),
      }),
    ).toThrow();
    for (const diagnostic of [
      "mutation_attempt",
      "request_failed",
      "console_error",
      "page_error",
      "auth_mismatch",
    ] as const) {
      const raw = report();
      const route = raw.routes.find((entry) => entry.routeKey === "my_work")!;
      const changed = {
        ...raw,
        routes: raw.routes.map((entry) =>
          entry === route
            ? {
                ...route,
                diagnostics: {
                  ...route.diagnostics,
                  [diagnostic]: route.diagnostics[diagnostic] + 1,
                },
              }
            : entry,
        ),
      };
      expect(observed().evidence(APPROVED_PREDECESSOR, changed)).toBeNull();
    }
  });
  it("binds honest v4 baseline evidence without allowing a failed candidate", () => {
    const now = Date.parse("2026-09-10T22:01:00.000Z");
    const receipt = buildCandidateAssuranceReceipt(
      {
        browserPolicy: APPROVED_PREDECESSOR.browserPolicy,
        project: "pmi-kc-kb-prod",
        region: "us-central1",
        service: "pmi-kc-app",
        canonicalOrigin: APPROVED_PREDECESSOR.canonicalOrigin,
        candidateOrigin: "https://candidate---pmi-kc-app-kq6wuvpiva-uc.a.run.app",
        expectedCommit: "a".repeat(40),
        expectedRevision: "pmi-kc-app-candidate",
        expectedConfigurationFingerprint: `sha256:${"b".repeat(64)}`,
        predecessorRevision: APPROVED_PREDECESSOR.expectedRevision,
        predecessorBaseline: {
          ...APPROVED_PREDECESSOR,
          verifiedAt: "2026-09-10T22:00:00.000Z",
          expectedConfigurationFingerprint: `sha256:${"c".repeat(64)}`,
          trafficPercent: 100,
          adminVerdict: "failed_known_legacy_defect",
          editorVerdict: "not_run",
          monitoringState: "ready",
          legacyException: PREDECESSOR_EXCEPTION,
        },
        adminVerdict: "passed",
        editorVerdict: "not_run",
        reconciliationState: "matched",
        monitoringState: "ready",
      },
      now,
    );
    expect(receipt.schemaVersion).toBe("pmi-kc-candidate-assurance-receipt.v4");
    expect(assertCandidateAssuranceReceipt(receipt, {}, now)).toEqual(receipt);
    for (const adminVerdict of ["failed", "failed_known_legacy_defect"])
      expect(() =>
        assertCandidateAssuranceReceipt({ ...receipt, adminVerdict }, {}, now),
      ).toThrow();
    for (const patch of [
      { adminVerdict: "passed" },
      { expectedCommit: "d".repeat(40) },
      { legacyException: { ...PREDECESSOR_EXCEPTION, dispatchedWrites: 1 } },
      { legacyException: { ...PREDECESSOR_EXCEPTION, rawBody: "forbidden" } },
    ]) {
      expect(() =>
        assertCandidateAssuranceReceipt(
          {
            ...receipt,
            predecessorBaseline: { ...receipt.predecessorBaseline, ...patch },
          },
          {},
          now,
        ),
      ).toThrow();
    }
  });
});
