import { describe, expect, it, vi } from "vitest";

import {
  emptyReconciliationCounts,
  evaluateReconciliation,
  type ReconciliationObservation,
} from "../../lib/production-assurance";
import {
  assertAssuranceAdcIdentity,
  assertLiveAssuranceEnvironment,
  closeReconciliationClientsWithinDeadline,
} from "../../scripts/run-production-reconciliation";

function observation(
  patch: Partial<ReconciliationObservation> = {},
): ReconciliationObservation {
  return {
    rentvine: "complete",
    sheet: "complete",
    application: "complete",
    sourceDrift: "stable",
    counts: {
      ...emptyReconciliationCounts(),
      sourceRecords: 3,
      projectedRecords: 3,
      renderedRecords: 3,
    },
    ...patch,
  };
}

describe("production source/application reconciliation", () => {
  it("matches only complete stable equal projections", () => {
    expect(evaluateReconciliation(observation()).state).toBe("matched");
  });

  it.each([
    "missingInApplication",
    "unexpectedInApplication",
    "duplicateApplicationKeys",
    "fieldMismatches",
    "invalidDestinations",
  ] as const)("treats %s as a definite mismatch", (key) => {
    const base = observation();
    const result = evaluateReconciliation({
      ...base,
      counts: { ...base.counts, [key]: 1 },
    });
    expect(result.state).toBe("mismatch");
  });

  it("treats unequal source/projected/rendered counts as mismatch", () => {
    const base = observation();
    expect(
      evaluateReconciliation({
        ...base,
        counts: { ...base.counts, renderedRecords: 2 },
      }).state,
    ).toBe("mismatch");
  });

  it("keeps source change distinct from mismatch", () => {
    const base = observation();
    const result = evaluateReconciliation({
      ...base,
      sourceDrift: "changed",
      counts: { ...base.counts, fieldMismatches: 2 },
    });
    expect(result.state).toBe("inconclusive_source_changed");
  });

  it.each([
    ["rentvine", "partial"],
    ["sheet", "unavailable"],
    ["application", "partial"],
  ] as const)("keeps %s %s distinct from empty success", (key, value) => {
    expect(evaluateReconciliation(observation({ [key]: value })).state).toBe(
      "inconclusive_source_unavailable",
    );
  });

  it("rejects invalid counts", () => {
    const base = observation();
    expect(() =>
      evaluateReconciliation({
        ...base,
        counts: { ...base.counts, sourceRecords: -1 },
      }),
    ).toThrow(/sourceRecords/);
  });
});

describe("live reconciliation identity preflight", () => {
  const live = {
    NODE_ENV: "production",
    ENVIRONMENT_KIND: "production",
    DATA_CONTEXT: "live",
  } satisfies NodeJS.ProcessEnv;

  it("accepts only the explicit production/live environment and pinned default database", () => {
    expect(() =>
      assertLiveAssuranceEnvironment("pmi-kc-kb-prod", {
        ...live,
        GOOGLE_CLOUD_PROJECT: "pmi-kc-kb-prod",
        FIRESTORE_DATABASE_ID: "(default)",
      }),
    ).not.toThrow();
    for (const env of [
      { ...live, ENVIRONMENT_KIND: "demo" },
      { ...live, DATA_CONTEXT: "demo" },
      { ...live, GOOGLE_APPLICATION_CREDENTIALS: "/tmp/key.json" },
      { ...live, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" },
      { ...live, GOOGLE_CLOUD_PROJECT: "foreign-project" },
      { ...live, FIRESTORE_DATABASE_ID: "tenant-db" },
      { ...live, FIREBASE_CONFIG: '{"projectId":"foreign-project"}' },
      { ...live, FIREBASE_CONFIG: "not-json" },
    ]) {
      expect(() => assertLiveAssuranceEnvironment("pmi-kc-kb-prod", env)).toThrow(
        /^assurance_/,
      );
    }
    expect(() =>
      assertLiveAssuranceEnvironment("foreign-project", {
        ...live,
        GOOGLE_CLOUD_PROJECT: "foreign-project",
      }),
    ).toThrow("assurance_project_mismatch");
  });

  it("accepts only a managed Workspace user or exact target-project service identity", () => {
    expect(() =>
      assertAssuranceAdcIdentity("operator@pmikcmetro.com", "pmi-kc-kb-prod"),
    ).not.toThrow();
    expect(() =>
      assertAssuranceAdcIdentity(
        "assurance@pmi-kc-kb-prod.iam.gserviceaccount.com",
        "pmi-kc-kb-prod",
      ),
    ).not.toThrow();
    for (const identity of [
      undefined,
      "operator@gmail.com",
      "assurance@foreign-project.iam.gserviceaccount.com",
    ]) {
      expect(() => assertAssuranceAdcIdentity(identity, "pmi-kc-kb-prod")).toThrow(
        "assurance_adc_identity_invalid",
      );
    }
  });
});

describe("live reconciliation cleanup", () => {
  it("starts cleanup but fails explicitly when source clients never settle", async () => {
    vi.useFakeTimers();
    try {
      const close = vi.fn(() => new Promise<void>(() => undefined));
      const cleanup = closeReconciliationClientsWithinDeadline(close, Date.now() + 500);
      const assertion = expect(cleanup).rejects.toThrow(
        "reconciliation_source_cleanup_deadline_exceeded",
      );
      expect(close).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(501);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
