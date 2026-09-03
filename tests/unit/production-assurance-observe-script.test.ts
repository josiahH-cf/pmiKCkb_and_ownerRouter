import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  POST_PROMOTION_EVIDENCE_READY_MS,
  serializeProductionAssuranceEvidence,
} from "../../lib/production-assurance";

import {
  buildCandidateAssuranceReceipt,
  buildPromotionReceipt,
  writeReceipt,
} from "../../scripts/production-assurance-receipts.mjs";

import {
  assertRecoveredPredecessorBaseline,
  assertAttentionMarker,
  buildObservationDeadlineRollbackReport,
  cloudRunLogResourceFilter,
  exactRevisionTrafficPercent,
  fullCheckpointPassed,
  pollObservationRuntimeSample,
  readLogEntryPages,
  readMetricCount,
  requestLogStatus,
  resolveObservationTarget,
  unavailableMonitoringSample,
} from "../../scripts/observe-production-release";

const EXPECTED_REVISION = "pmi-kc-app-candidate-123";
const EXPECTED_FINGERPRINT = `sha256:${"a".repeat(64)}`;
const EXPECTED_COMMIT = "1".repeat(40);

function promotionReceipt(nowMs = Date.now()): { path: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), "pmi-promotion-receipt-"));
  const path = join(directory, "promotion.json");
  const candidate = buildCandidateAssuranceReceipt(
    {
      project: "pmi-kc-kb-prod",
      region: "us-central1",
      service: "pmi-kc-app",
      candidateOrigin: "https://candidate---pmi-kc-app-abc-uc.a.run.app",
      canonicalOrigin: "https://pmi-kc-app-abc-uc.a.run.app",
      expectedCommit: EXPECTED_COMMIT,
      expectedRevision: EXPECTED_REVISION,
      expectedConfigurationFingerprint: EXPECTED_FINGERPRINT,
      predecessorRevision: "pmi-kc-app-predecessor-122",
      predecessorBaseline: {
        verifiedAt: new Date(nowMs - 2_000).toISOString(),
        canonicalOrigin: "https://pmi-kc-app-abc-uc.a.run.app",
        expectedCommit: "2".repeat(40),
        expectedRevision: "pmi-kc-app-predecessor-122",
        expectedConfigurationFingerprint: `sha256:${"b".repeat(64)}`,
        trafficPercent: 100,
        adminVerdict: "passed",
        editorVerdict: "passed",
        monitoringState: "ready",
      },
      adminVerdict: "passed",
      editorVerdict: "passed",
      reconciliationState: "matched",
      monitoringState: "ready",
    },
    nowMs - 1_000,
  );
  writeReceipt(path, buildPromotionReceipt(candidate, nowMs, nowMs));
  return { path, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

describe("production observation command contract", () => {
  it("turns a late start or serial-check deadline into a bodyless exact-predecessor rollback", () => {
    const predecessorRevision = "pmi-kc-app-predecessor-122";
    const report = buildObservationDeadlineRollbackReport({
      target: {
        origin: "https://pmi-kc-app-abc-uc.a.run.app",
        expectedCommit: EXPECTED_COMMIT,
        expectedRevision: EXPECTED_REVISION,
        service: "pmi-kc-app",
      },
      predecessorRevision,
      promotionStartedAtMs: 0,
      nowMs: POST_PROMOTION_EVIDENCE_READY_MS,
    });

    expect(report).toMatchObject({
      verdict: "failed",
      actorRole: null,
      observation: {
        decision: "rollback_required",
        rollbackRevision: predecessorRevision,
      },
    });
    const serialized = serializeProductionAssuranceEvidence(report);
    expect(serialized).not.toContain("responseBody");
    expect(serialized).not.toContain("providerBody");
  });

  it("never starts another runtime read when the final poll meets the fixed cutoff", async () => {
    vi.useFakeTimers();
    try {
      const cutoffAtMs = 420_000;
      vi.setSystemTime(cutoffAtMs - 1);
      const controller = new AbortController();
      const read = vi.fn(async () => ({ forbiddenProviderBody: "secret" }));
      setTimeout(() => controller.abort(), 1);

      const pending = pollObservationRuntimeSample({
        deadlineAtMs: cutoffAtMs,
        abortSignal: controller.signal,
        read,
      });
      await vi.advanceTimersByTimeAsync(1);

      await expect(pending).resolves.toBeNull();
      expect(read).not.toHaveBeenCalled();
      await expect(
        pollObservationRuntimeSample({
          deadlineAtMs: cutoffAtMs,
          abortSignal: controller.signal,
          read,
        }),
      ).resolves.toBeNull();
      expect(read).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires a repeat recovery gate to reproduce every predecessor baseline dimension", () => {
    const baseline = {
      verifiedAt: "2026-09-02T20:00:00.000Z",
      canonicalOrigin: "https://pmi-kc-app-abc-uc.a.run.app",
      expectedCommit: "2".repeat(40),
      expectedRevision: "pmi-kc-app-predecessor-122",
      expectedConfigurationFingerprint: `sha256:${"b".repeat(64)}`,
      trafficPercent: 100 as const,
      adminVerdict: "passed" as const,
      editorVerdict: "passed" as const,
      monitoringState: "ready" as const,
    };
    expect(() =>
      assertRecoveredPredecessorBaseline(baseline, {
        ...baseline,
        verifiedAt: "2026-09-02T20:01:00.000Z",
      }),
    ).not.toThrow();
    for (const recovered of [
      { ...baseline, expectedCommit: "3".repeat(40) },
      { ...baseline, expectedRevision: "pmi-kc-app-other-121" },
      {
        ...baseline,
        expectedConfigurationFingerprint: `sha256:${"c".repeat(64)}`,
      },
      { ...baseline, verifiedAt: "2026-09-02T19:59:59.999Z" },
    ]) {
      expect(() => assertRecoveredPredecessorBaseline(baseline, recovered)).toThrow(
        "predecessor_recovery_mismatch",
      );
    }
  });

  it("counts a checkpoint only when both actors and exact reconciliation pass", () => {
    const passed = { verdict: "passed" as const };
    const matched = {
      verdict: "passed" as const,
      reconciliation: {
        state: "matched" as const,
      },
    };
    expect(fullCheckpointPassed(passed, passed, matched)).toBe(true);
    expect(fullCheckpointPassed(passed, { verdict: "failed" }, matched)).toBe(false);
    expect(
      fullCheckpointPassed(passed, passed, {
        verdict: "inconclusive",
        reconciliation: { state: "inconclusive_source_changed" },
      }),
    ).toBe(false);
  });

  it("requires a bound promotion receipt and the pre-promotion fingerprint", async () => {
    const receipt = promotionReceipt();
    const base = [
      "--project=pmi-kc-kb-prod",
      "--region=us-central1",
      "--service=pmi-kc-app",
      "--operator-email=operator@pmikcmetro.com",
      `--promotion-receipt=${receipt.path}`,
    ];
    await expect(
      resolveObservationTarget(base, EXPECTED_COMMIT, EXPECTED_REVISION),
    ).rejects.toThrow("expected_config_fingerprint_required");
    const resolved = await resolveObservationTarget(
      [...base, `--expected-config-fingerprint=${EXPECTED_FINGERPRINT}`],
      EXPECTED_COMMIT,
      EXPECTED_REVISION,
    );
    expect(resolved).toMatchObject({
      project: "pmi-kc-kb-prod",
      region: "us-central1",
      service: "pmi-kc-app",
      promotionStartedAtMs: expect.any(Number),
      promotionVerifiedAtMs: expect.any(Number),
      expectedConfigurationFingerprint: EXPECTED_FINGERPRINT,
      predecessorBaseline: expect.objectContaining({
        expectedRevision: "pmi-kc-app-predecessor-122",
        trafficPercent: 100,
        adminVerdict: "passed",
        editorVerdict: "passed",
        monitoringState: "ready",
      }),
    });
    expect(resolved.promotionStartedAtMs).toBe(resolved.promotionVerifiedAtMs);
    await expect(
      resolveObservationTarget(
        [
          ...base,
          `--expected-config-fingerprint=${EXPECTED_FINGERPRINT}`,
          "--predecessor-revision=pmi-kc-app-other",
        ],
        EXPECTED_COMMIT,
        EXPECTED_REVISION,
      ),
    ).rejects.toThrow("freeform_promotion_coordinates_forbidden");
    receipt.cleanup();
  });

  it("binds Logging corroboration to the exact revision resource", () => {
    const filter = cloudRunLogResourceFilter(
      {
        project: "pmi-kc-kb-prod",
        region: "us-central1",
        service: "pmi-kc-app",
      },
      EXPECTED_REVISION,
    );
    expect(filter).toContain('resource.type = "cloud_run_revision"');
    expect(filter).toContain('resource.labels.project_id = "pmi-kc-kb-prod"');
    expect(filter).toContain('resource.labels.location = "us-central1"');
    expect(filter).toContain('resource.labels.service_name = "pmi-kc-app"');
    expect(filter).toContain(`resource.labels.revision_name = "${EXPECTED_REVISION}"`);
  });

  it("keeps exact-revision traffic validation independent from configuration", () => {
    expect(
      exactRevisionTrafficPercent(
        { trafficStatuses: [{ revision: EXPECTED_REVISION, percent: 100 }] },
        EXPECTED_REVISION,
      ),
    ).toBe(100);
    expect(
      exactRevisionTrafficPercent(
        {
          trafficStatuses: [
            { revision: EXPECTED_REVISION, percent: 99 },
            { revision: "pmi-kc-app-other-122", percent: 1 },
          ],
        },
        EXPECTED_REVISION,
      ),
    ).toBe(99);
  });

  it("preserves verified monitoring configuration when only sampling is transiently unavailable", () => {
    expect(unavailableMonitoringSample(true)).toEqual({
      configurationReady: true,
      readComplete: false,
      candidateFiveXxCount: 0,
      unresolvedLiveEffectCount: 0,
    });
    expect(unavailableMonitoringSample(false)).toEqual({
      configurationReady: false,
      readComplete: false,
      candidateFiveXxCount: 0,
      unresolvedLiveEffectCount: 0,
    });
  });
});

describe("bodyless Cloud Logging corroboration reads", () => {
  it("counts bounded paginated request logs and only their status class", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          entries: [
            { httpRequest: { status: 200 }, textPayload: "must-not-return" },
            { httpRequest: { status: "503" }, jsonPayload: { private: true } },
          ],
          nextPageToken: "page-2",
        },
      })
      .mockResolvedValueOnce({
        data: { entries: [{ httpRequest: { status: 404 } }] },
      });
    const client = { request } as unknown as Parameters<typeof readLogEntryPages>[0];
    const result = await readLogEntryPages(client, {
      project: "pmi-kc-kb-prod",
      filter: 'resource.type = "cloud_run_revision"',
      interval: { startTimeMs: 1_000, endTimeMs: 301_000 },
      kind: "request",
    });
    expect(result).toEqual({ count: 3, fiveXxCount: 1 });
    expect(request).toHaveBeenCalledTimes(2);
    const first = request.mock.calls[0]?.[0] as {
      method: string;
      url: string;
      data: Record<string, unknown>;
    };
    expect(first.method).toBe("POST");
    expect(first.url).toBe("https://logging.googleapis.com/v2/entries:list");
    expect(first.data.resourceNames).toEqual(["projects/pmi-kc-kb-prod"]);
    expect(first.data.filter).toContain('timestamp >= "1970-01-01T00:00:01.000Z"');
    expect(first.data.filter).toContain('timestamp < "1970-01-01T00:05:01.000Z"');
    expect(JSON.stringify(result)).not.toContain("must-not-return");
  });

  it("validates every matched live-effect marker without retaining its payload", async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        entries: [
          {
            jsonPayload: {
              marker: "LIVE_EFFECT_REQUIRES_ATTENTION",
              data_mode: "live",
              execution_id: "private-but-not-returned",
            },
          },
        ],
      },
    });
    const client = { request } as unknown as Parameters<typeof readLogEntryPages>[0];
    const result = await readLogEntryPages(client, {
      project: "pmi-kc-kb-prod",
      filter: 'jsonPayload.marker = "LIVE_EFFECT_REQUIRES_ATTENTION"',
      interval: { startTimeMs: 1_000, endTimeMs: 301_000 },
      kind: "attention",
    });
    expect(result).toEqual({ count: 1, fiveXxCount: 0 });
    expect(JSON.stringify(result)).not.toContain("private-but-not-returned");
    expect(() =>
      assertAttentionMarker({
        jsonPayload: { marker: "OTHER", data_mode: "live" },
      }),
    ).toThrow("logging_read_invalid");
  });

  it("does not turn an absent metric series into implicit coverage", async () => {
    const request = vi.fn().mockResolvedValue({ data: {} });
    const client = { request } as unknown as Parameters<typeof readMetricCount>[0];
    const result = await readMetricCount(client, {
      project: "pmi-kc-kb-prod",
      filter: 'resource.type = "cloud_run_revision"',
      startTimeMs: 1_000,
      endTimeMs: 301_000,
    });
    expect(result).toEqual({ count: 0, seriesPresent: false });
    const url = new URL((request.mock.calls[0]?.[0] as { url: string }).url);
    expect(url.searchParams.get("interval.startTime")).toBe("1970-01-01T00:00:01.000Z");
    expect(url.searchParams.get("interval.endTime")).toBe("1970-01-01T00:05:01.000Z");
  });

  it("refuses malformed request and attention log shapes", () => {
    expect(() => requestLogStatus({ httpRequest: {} })).toThrow("logging_read_invalid");
    expect(() => assertAttentionMarker({ jsonPayload: { data_mode: "live" } })).toThrow(
      "logging_read_invalid",
    );
  });

  it("fails closed on a repeated pagination token", async () => {
    const request = vi.fn().mockResolvedValue({
      data: { entries: [], nextPageToken: "repeated" },
    });
    const client = { request } as unknown as Parameters<typeof readLogEntryPages>[0];
    await expect(
      readLogEntryPages(client, {
        project: "pmi-kc-kb-prod",
        filter: 'resource.type = "cloud_run_revision"',
        interval: { startTimeMs: 1_000, endTimeMs: 301_000 },
        kind: "request",
      }),
    ).rejects.toThrow("logging_read_invalid");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
