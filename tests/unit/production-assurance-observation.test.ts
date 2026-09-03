import { describe, expect, it } from "vitest";

import {
  POST_PROMOTION_EVIDENCE_READY_MS,
  POST_PROMOTION_OBSERVATION_MS,
  emptyDiagnosticCounts,
  evaluateReconciliation,
  evaluateReleaseObservation,
  routesForRole,
  type AssuranceRole,
  type ReleaseObservationInput,
  type RouteAssuranceEvidence,
} from "../../lib/production-assurance";

const CANDIDATE = "pmi-kc-app-candidate-123";
const PREDECESSOR = "pmi-kc-app-predecessor-122";

function routes(role: AssuranceRole): RouteAssuranceEvidence[] {
  return routesForRole(role).map((route) => ({
    actorRole: role,
    routeKey: route.key,
    outcome: route.expectedOutcome,
    statusClass: "2xx",
    elapsedMs: 10,
    landmarkPresent: true,
    diagnostics: emptyDiagnosticCounts(),
  }));
}

function input(patch: Partial<ReleaseObservationInput> = {}): ReleaseObservationInput {
  return {
    expectedRevision: CANDIDATE,
    observedRevision: CANDIDATE,
    predecessorRevision: PREDECESSOR,
    trafficPercent: 100,
    configurationVerified: true,
    successfulCheckpoints: 2,
    checkpointStartedOffsetsMs: [0, POST_PROMOTION_OBSERVATION_MS],
    elapsedMs: POST_PROMOTION_EVIDENCE_READY_MS,
    adminRoutes: routes("Admin"),
    editorRoutes: routes("Editor"),
    reconciliation: evaluateReconciliation({
      rentvine: "complete",
      sheet: "complete",
      application: "complete",
      sourceDrift: "stable",
      counts: {
        sourceRecords: 2,
        projectedRecords: 2,
        renderedRecords: 2,
        missingInApplication: 0,
        unexpectedInApplication: 0,
        duplicateApplicationKeys: 0,
        fieldMismatches: 0,
        invalidDestinations: 0,
      },
    }),
    monitoring: {
      configurationReady: true,
      readComplete: true,
      candidateFiveXxCount: 0,
      unresolvedLiveEffectCount: 0,
    },
    ...patch,
  };
}

describe("post-promotion assurance state machine", () => {
  it("cannot pass before the five-minute observation window closes", () => {
    expect(
      evaluateReleaseObservation(input({ elapsedMs: POST_PROMOTION_OBSERVATION_MS - 1 })),
    ).toMatchObject({ decision: "observing", reasons: ["window_incomplete"] });
  });

  it("allows bounded ingestion lag only through the fixed evidence deadline", () => {
    const monitoring = { ...input().monitoring, readComplete: false };
    expect(
      evaluateReleaseObservation(
        input({ elapsedMs: POST_PROMOTION_EVIDENCE_READY_MS - 1, monitoring }),
      ),
    ).toMatchObject({ decision: "observing", reasons: ["window_incomplete"] });
    expect(evaluateReleaseObservation(input({ monitoring }))).toMatchObject({
      decision: "rollback_required",
      reasons: ["monitoring_unavailable"],
      rollbackRevision: PREDECESSOR,
    });
  });

  it("passes at the exact five-minute boundary when monitoring is already corroborated", () => {
    expect(
      evaluateReleaseObservation(input({ elapsedMs: POST_PROMOTION_OBSERVATION_MS })),
    ).toEqual({
      decision: "passed",
      successfulCheckpoints: 2,
      elapsedMs: POST_PROMOTION_OBSERVATION_MS,
      windowMs: POST_PROMOTION_OBSERVATION_MS,
      reasons: [],
      rollbackRevision: null,
    });
  });

  it("cannot pass from only one successful checkpoint even after the window closes", () => {
    expect(
      evaluateReleaseObservation(
        input({
          elapsedMs: POST_PROMOTION_OBSERVATION_MS,
          successfulCheckpoints: 1,
          checkpointStartedOffsetsMs: [0],
        }),
      ),
    ).toEqual({
      decision: "observing",
      successfulCheckpoints: 1,
      elapsedMs: POST_PROMOTION_OBSERVATION_MS,
      windowMs: POST_PROMOTION_OBSERVATION_MS,
      reasons: ["window_incomplete"],
      rollbackRevision: null,
    });
  });

  it("requires rollback when the second checkpoint is still absent at the deadline", () => {
    expect(
      evaluateReleaseObservation(
        input({ successfulCheckpoints: 1, checkpointStartedOffsetsMs: [0] }),
      ),
    ).toMatchObject({
      decision: "rollback_required",
      successfulCheckpoints: 1,
      reasons: ["checkpoint_incomplete"],
      rollbackRevision: PREDECESSOR,
    });
  });

  it("refuses an impossible checkpoint count", () => {
    expect(() => evaluateReleaseObservation(input({ successfulCheckpoints: 3 }))).toThrow(
      "Observation checkpoint count is invalid",
    );
  });

  it("rejects two late back-to-back checkpoints even after the observation window", () => {
    expect(
      evaluateReleaseObservation(
        input({
          elapsedMs: POST_PROMOTION_OBSERVATION_MS + 90_000,
          checkpointStartedOffsetsMs: [
            POST_PROMOTION_OBSERVATION_MS,
            POST_PROMOTION_OBSERVATION_MS + 1,
          ],
        }),
      ),
    ).toMatchObject({
      decision: "rollback_required",
      reasons: expect.arrayContaining(["checkpoint_schedule_invalid"]),
      rollbackRevision: PREDECESSOR,
    });
  });

  it.each([
    ["revision mismatch", { observedRevision: "pmi-kc-app-wrong" }, "revision_mismatch"],
    ["traffic drift", { trafficPercent: 99 }, "traffic_mismatch"],
    ["configuration drift", { configurationVerified: false }, "configuration_unverified"],
    [
      "monitoring read failure",
      { monitoring: { ...input().monitoring, readComplete: false } },
      "monitoring_unavailable",
    ],
    [
      "candidate 5xx",
      { monitoring: { ...input().monitoring, candidateFiveXxCount: 1 } },
      "candidate_5xx",
    ],
    [
      "unresolved effect",
      { monitoring: { ...input().monitoring, unresolvedLiveEffectCount: 1 } },
      "unresolved_live_effect",
    ],
  ] as const)("requires exact-predecessor rollback for %s", (_label, patch, reason) => {
    const result = evaluateReleaseObservation(
      input(patch as Partial<ReleaseObservationInput>),
    );
    expect(result.decision).toBe("rollback_required");
    expect(result.rollbackRevision).toBe(PREDECESSOR);
    expect(result.reasons).toContain(reason);
  });

  it("fails an incomplete role manifest", () => {
    const result = evaluateReleaseObservation(
      input({ adminRoutes: routes("Admin").slice(1) }),
    );
    expect(result).toMatchObject({
      decision: "rollback_required",
      rollbackRevision: PREDECESSOR,
    });
    expect(result.reasons).toContain("admin_canary_failed");
  });

  it("fails on any classified browser diagnostic", () => {
    const admin = routes("Admin");
    admin[0] = {
      ...admin[0],
      diagnostics: { ...admin[0].diagnostics, page_error: 1 },
    };
    const result = evaluateReleaseObservation(input({ adminRoutes: admin }));
    expect(result.reasons).toContain("browser_diagnostic");
    expect(result.decision).toBe("rollback_required");
  });

  it("holds changed or unavailable source truth instead of inventing rollback", () => {
    for (const state of [
      "inconclusive_source_changed",
      "inconclusive_source_unavailable",
    ] as const) {
      const result = evaluateReleaseObservation(
        input({ reconciliation: { ...input().reconciliation, state } }),
      );
      expect(result.decision).toBe("hold");
      expect(result.rollbackRevision).toBeNull();
    }
  });

  it("refuses an absent, malformed, or candidate-equal predecessor", () => {
    for (const predecessorRevision of ["", "LATEST", CANDIDATE]) {
      expect(() => evaluateReleaseObservation(input({ predecessorRevision }))).toThrow(
        /predecessor/,
      );
    }
  });
});
