import { describe, expect, it } from "vitest";

import {
  MONITORING_INGESTION_DELAY_MS,
  POST_PROMOTION_OBSERVATION_MS,
  closedObservationInterval,
  corroborateMonitoringCounts,
  fingerprintRevisionRuntimeConfiguration,
  requireRevisionConfigurationFingerprint,
} from "../../lib/production-assurance";

function revision() {
  return {
    name: "projects/example/locations/us-central1/services/app/revisions/app-rev-1",
    uid: "output-only-uid",
    generation: "7",
    createTime: "2026-09-02T18:00:00.000Z",
    updateTime: "2026-09-02T18:00:01.000Z",
    observedGeneration: "7",
    reconciling: false,
    conditions: [{ type: "Ready", state: "CONDITION_SUCCEEDED" }],
    logUri: "https://console.invalid/output-only",
    serviceAccount: "runtime@example.iam.gserviceaccount.com",
    timeout: "300s",
    maxInstanceRequestConcurrency: 80,
    scaling: { maxInstanceCount: 10, minInstanceCount: 1 },
    annotations: { "run.googleapis.com/client-name": "fixture" },
    labels: { environment: "production" },
    containers: [
      {
        image: "us-central1-docker.pkg.dev/example/app@sha256:abc",
        env: [
          { name: "DATA_CONTEXT", value: "live" },
          { name: "ENVIRONMENT_KIND", value: "production" },
        ],
      },
    ],
  };
}

describe("immutable revision configuration fingerprint", () => {
  it("ignores output-only observation state and object key order", () => {
    const baseline = revision();
    const reordered = {
      containers: baseline.containers,
      labels: baseline.labels,
      annotations: baseline.annotations,
      scaling: baseline.scaling,
      maxInstanceRequestConcurrency: baseline.maxInstanceRequestConcurrency,
      timeout: baseline.timeout,
      serviceAccount: baseline.serviceAccount,
      logUri: "https://console.invalid/different-output",
      conditions: [{ type: "Ready", state: "CONDITION_FAILED" }],
      reconciling: true,
      observedGeneration: "8",
      updateTime: "2026-09-02T18:01:00.000Z",
      createTime: baseline.createTime,
      generation: "8",
      uid: "different-output-uid",
      name: baseline.name,
    };
    expect(fingerprintRevisionRuntimeConfiguration(reordered)).toBe(
      fingerprintRevisionRuntimeConfiguration(baseline),
    );
  });

  it("changes for any runtime configuration or future configuration field", () => {
    const baseline = revision();
    const expected = fingerprintRevisionRuntimeConfiguration(baseline);
    expect(
      fingerprintRevisionRuntimeConfiguration({
        ...baseline,
        containers: [
          {
            ...baseline.containers[0],
            env: [
              ...baseline.containers[0].env.slice(0, 1),
              { name: "ENVIRONMENT_KIND", value: "staging" },
            ],
          },
        ],
      }),
    ).not.toBe(expected);
    expect(
      fingerprintRevisionRuntimeConfiguration({
        ...baseline,
        futureRuntimeSetting: { enabled: true },
      }),
    ).not.toBe(expected);
  });

  it("requires a nonempty container configuration and exact prefixed digest", () => {
    expect(() => fingerprintRevisionRuntimeConfiguration({ containers: [] })).toThrow(
      "revision_configuration_invalid",
    );
    const fingerprint = fingerprintRevisionRuntimeConfiguration(revision());
    expect(requireRevisionConfigurationFingerprint(fingerprint.toUpperCase())).toBe(
      fingerprint,
    );
    for (const invalid of [undefined, "", "a".repeat(64), "sha256:abc"]) {
      expect(() => requireRevisionConfigurationFingerprint(invalid)).toThrow(
        "expected_config_fingerprint_required",
      );
    }
  });
});

describe("closed monitoring interval and corroboration", () => {
  it("adds a bounded ingestion delay after the complete five-minute interval", () => {
    const interval = closedObservationInterval(1_000, POST_PROMOTION_OBSERVATION_MS);
    expect(interval).toEqual({
      startTimeMs: 1_000,
      endTimeMs: 1_000 + POST_PROMOTION_OBSERVATION_MS,
      readAfterMs: 1_000 + POST_PROMOTION_OBSERVATION_MS + MONITORING_INGESTION_DELAY_MS,
    });
    expect(MONITORING_INGESTION_DELAY_MS).toBe(120_000);
  });

  it("uses bodyless log counts when both metric series are absent", () => {
    expect(
      corroborateMonitoringCounts(
        { count: 0, seriesPresent: false },
        { count: 0, seriesPresent: false },
        { requestLogCount: 4, requestFiveXxCount: 1, attentionMarkerCount: 2 },
      ),
    ).toEqual({
      readComplete: true,
      candidateFiveXxCount: 1,
      unresolvedLiveEffectCount: 2,
    });
  });

  it("refuses to call an empty request-log query complete", () => {
    expect(
      corroborateMonitoringCounts(
        { count: 0, seriesPresent: false },
        { count: 0, seriesPresent: false },
        { requestLogCount: 0, requestFiveXxCount: 0, attentionMarkerCount: 0 },
      ).readComplete,
    ).toBe(false);
  });

  it("uses the greatest corroborated count and rejects impossible log counts", () => {
    expect(
      corroborateMonitoringCounts(
        { count: 3, seriesPresent: true },
        { count: 4, seriesPresent: true },
        { requestLogCount: 9, requestFiveXxCount: 2, attentionMarkerCount: 5 },
      ),
    ).toMatchObject({
      candidateFiveXxCount: 3,
      unresolvedLiveEffectCount: 5,
    });
    expect(() =>
      corroborateMonitoringCounts(
        { count: 0, seriesPresent: false },
        { count: 0, seriesPresent: false },
        { requestLogCount: 1, requestFiveXxCount: 2, attentionMarkerCount: 0 },
      ),
    ).toThrow("logging_corroboration_invalid");
  });
});
