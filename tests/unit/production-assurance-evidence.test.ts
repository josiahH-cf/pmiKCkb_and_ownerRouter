import { describe, expect, it } from "vitest";

import {
  PRODUCTION_ASSURANCE_SCHEMA_VERSION,
  assertProductionAssuranceEvidence,
  emptyDiagnosticCounts,
  emptyReconciliationCounts,
  routesForRole,
  type AssuranceRole,
  serializeProductionAssuranceEvidence,
  type ProductionAssuranceEvidence,
} from "../../lib/production-assurance";

function roleRoutes(role: AssuranceRole): ProductionAssuranceEvidence["routes"] {
  return routesForRole(role).map((definition) => ({
    actorRole: role,
    routeKey: definition.key,
    outcome: definition.expectedOutcome,
    statusClass: definition.expectedOutcome === "denied" ? "4xx" : "2xx",
    elapsedMs: 123,
    landmarkPresent: true,
    diagnostics: emptyDiagnosticCounts(),
  }));
}

function validEvidence(): ProductionAssuranceEvidence {
  return {
    schemaVersion: PRODUCTION_ASSURANCE_SCHEMA_VERSION,
    generatedAt: "2026-09-02T18:00:00.000Z",
    phase: "candidate",
    expectedCommit: "a".repeat(40),
    expectedRevision: "pmi-kc-app-candidate-123",
    actorRole: "Admin",
    verdict: "passed",
    routes: roleRoutes("Admin"),
    reconciliation: null,
    monitoring: null,
    observation: null,
  };
}

describe("production assurance evidence", () => {
  it("serializes only the exact allowlist", () => {
    const evidence = validEvidence();
    expect(() => assertProductionAssuranceEvidence(evidence)).not.toThrow();
    const parsed = JSON.parse(serializeProductionAssuranceEvidence(evidence));
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "actorRole",
        "expectedCommit",
        "expectedRevision",
        "generatedAt",
        "monitoring",
        "observation",
        "phase",
        "reconciliation",
        "routes",
        "schemaVersion",
        "verdict",
      ].sort(),
    );
  });

  it("rejects representative identity, browser, credential, and customer fields", () => {
    const forbidden = [
      "email",
      "uid",
      "url",
      "query",
      "dom",
      "consoleText",
      "stack",
      "cookie",
      "token",
      "responseBody",
      "tenant",
      "owner",
      "address",
      "rent",
      "sheetValue",
      "screenshot",
    ];
    for (const key of forbidden) {
      const unsafe = { ...validEvidence(), [key]: "must-not-serialize" };
      expect(() => assertProductionAssuranceEvidence(unsafe), key).toThrow(
        /forbidden field/,
      );
    }
  });

  it("rejects unknown nested route and diagnostic fields", () => {
    const routeField = validEvidence() as unknown as Record<string, unknown>;
    const routes = routeField.routes as Record<string, unknown>[];
    routes[0] = { ...routes[0], rawUrl: "https://example.invalid/private" };
    expect(() => assertProductionAssuranceEvidence(routeField)).toThrow(
      /forbidden field/,
    );

    const diagnosticField = validEvidence() as unknown as Record<string, unknown>;
    const diagnosticRoutes = diagnosticField.routes as Record<string, unknown>[];
    diagnosticRoutes[0] = {
      ...diagnosticRoutes[0],
      diagnostics: {
        ...(diagnosticRoutes[0].diagnostics as Record<string, unknown>),
        message: "private",
      },
    };
    expect(() => assertProductionAssuranceEvidence(diagnosticField)).toThrow(
      /forbidden field/,
    );
  });

  it("rejects route evidence outside the actor manifest", () => {
    const routes = [...roleRoutes("Editor")];
    routes[0] = { ...routes[0], routeKey: "admin_hub" };
    const invalid = {
      ...validEvidence(),
      actorRole: "Editor",
      routes,
    };
    expect(() => assertProductionAssuranceEvidence(invalid)).toThrow(/actor manifest/);
  });

  it("requires every role-manifest route exactly once", () => {
    const routes = roleRoutes("Admin");
    expect(() =>
      assertProductionAssuranceEvidence({
        ...validEvidence(),
        routes: routes.slice(1),
      }),
    ).toThrow(/exact actor manifest/);
    expect(() =>
      assertProductionAssuranceEvidence({
        ...validEvidence(),
        routes: [...routes.slice(0, -1), routes[0]],
      }),
    ).toThrow(/duplicate|exact actor manifest/);
  });

  it("rejects a non-failed route outcome that contradicts the manifest", () => {
    const routes = [...roleRoutes("Editor")];
    const deniedIndex = routes.findIndex(
      (route) => route.routeKey === "admin_hub_denied",
    );
    routes[deniedIndex] = { ...routes[deniedIndex], outcome: "rendered" };
    expect(() =>
      assertProductionAssuranceEvidence({
        ...validEvidence(),
        actorRole: "Editor",
        routes,
      }),
    ).toThrow(/outcome contradicts/);
  });

  it("allows a reconciliation-only role artifact with no browser manifest", () => {
    expect(() =>
      assertProductionAssuranceEvidence({
        ...validEvidence(),
        routes: [],
        reconciliation: {
          state: "matched",
          rentvine: "complete",
          sheet: "complete",
          application: "complete",
          sourceDrift: "stable",
          counts: emptyReconciliationCounts(),
        },
      }),
    ).not.toThrow();
  });

  it("requires one complete Admin and Editor manifest in combined evidence", () => {
    const combined = {
      ...validEvidence(),
      actorRole: null,
      routes: [...roleRoutes("Admin"), ...roleRoutes("Editor")],
    } satisfies ProductionAssuranceEvidence;
    expect(() => assertProductionAssuranceEvidence(combined)).not.toThrow();
    expect(() =>
      assertProductionAssuranceEvidence({
        ...combined,
        routes: combined.routes.slice(1),
      }),
    ).toThrow(/exact role manifest/);
    expect(() =>
      assertProductionAssuranceEvidence({
        ...combined,
        routes: [...combined.routes.slice(0, -1), combined.routes[0]],
      }),
    ).toThrow(/exact role manifest|exact actor manifest|duplicate/);
  });

  it("retains only the bounded successful-checkpoint count in observation evidence", () => {
    const combined = {
      ...validEvidence(),
      phase: "post_promotion" as const,
      actorRole: null,
      routes: [...roleRoutes("Admin"), ...roleRoutes("Editor")],
      reconciliation: {
        state: "matched" as const,
        rentvine: "complete" as const,
        sheet: "complete" as const,
        application: "complete" as const,
        sourceDrift: "stable" as const,
        counts: emptyReconciliationCounts(),
      },
      monitoring: {
        configurationReady: true,
        readComplete: true,
        candidateFiveXxCount: 0,
        unresolvedLiveEffectCount: 0,
      },
      observation: {
        decision: "passed" as const,
        successfulCheckpoints: 2,
        elapsedMs: 300_000,
        windowMs: 300_000,
        reasons: [],
        rollbackRevision: null,
      },
    } satisfies ProductionAssuranceEvidence;
    expect(() => assertProductionAssuranceEvidence(combined)).not.toThrow();
    expect(
      JSON.parse(serializeProductionAssuranceEvidence(combined)).observation,
    ).toEqual(combined.observation);
    expect(() =>
      assertProductionAssuranceEvidence({
        ...combined,
        observation: { ...combined.observation, successfulCheckpoints: 3 },
      }),
    ).toThrow(/cannot exceed two/);
  });
});
