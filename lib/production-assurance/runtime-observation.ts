export { fingerprintRevisionRuntimeConfiguration } from "./revision-fingerprint.mjs";

export const MONITORING_INGESTION_DELAY_MS = 2 * 60 * 1_000;
export const REVISION_CONFIGURATION_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;

export interface ClosedObservationInterval {
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly readAfterMs: number;
}

export interface MetricCountRead {
  readonly count: number;
  readonly seriesPresent: boolean;
}

export interface LoggingCorroborationRead {
  readonly requestLogCount: number;
  readonly requestFiveXxCount: number;
  readonly attentionMarkerCount: number;
}

export interface CorroboratedMonitoringCounts {
  readonly readComplete: boolean;
  readonly candidateFiveXxCount: number;
  readonly unresolvedLiveEffectCount: number;
}

export function requireRevisionConfigurationFingerprint(
  value: string | undefined,
): string {
  const normalized = value?.toLowerCase();
  if (!normalized || !REVISION_CONFIGURATION_FINGERPRINT_PATTERN.test(normalized)) {
    throw new Error("expected_config_fingerprint_required");
  }
  return normalized;
}

export function closedObservationInterval(
  promotedAtMs: number,
  observationWindowMs: number,
): ClosedObservationInterval {
  if (
    !Number.isSafeInteger(promotedAtMs) ||
    promotedAtMs < 0 ||
    !Number.isSafeInteger(observationWindowMs) ||
    observationWindowMs < 1
  ) {
    throw new Error("observation_interval_invalid");
  }
  const endTimeMs = promotedAtMs + observationWindowMs;
  const readAfterMs = endTimeMs + MONITORING_INGESTION_DELAY_MS;
  if (!Number.isSafeInteger(endTimeMs) || !Number.isSafeInteger(readAfterMs)) {
    throw new Error("observation_interval_invalid");
  }
  return { startTimeMs: promotedAtMs, endTimeMs, readAfterMs };
}

/**
 * Monitoring metrics are advisory until both Logging queries complete. A successful empty
 * attention-marker query proves zero markers; request logs must contain at least one entry so an
 * empty request-count time series cannot masquerade as coverage.
 */
export function corroborateMonitoringCounts(
  requestMetric: MetricCountRead,
  attentionMetric: MetricCountRead,
  logging: LoggingCorroborationRead,
): CorroboratedMonitoringCounts {
  assertCount(requestMetric.count);
  assertCount(attentionMetric.count);
  assertCount(logging.requestLogCount);
  assertCount(logging.requestFiveXxCount);
  assertCount(logging.attentionMarkerCount);
  if (logging.requestFiveXxCount > logging.requestLogCount) {
    throw new Error("logging_corroboration_invalid");
  }
  return {
    readComplete: logging.requestLogCount > 0,
    candidateFiveXxCount: Math.max(requestMetric.count, logging.requestFiveXxCount),
    unresolvedLiveEffectCount: Math.max(
      attentionMetric.count,
      logging.attentionMarkerCount,
    ),
  };
}

function assertCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("monitoring_count_invalid");
  }
}
