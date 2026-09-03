import { createHash } from "node:crypto";

export const MONITORING_INGESTION_DELAY_MS = 2 * 60 * 1_000;
export const REVISION_CONFIGURATION_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;

const REVISION_OUTPUT_ONLY_FIELDS = new Set([
  "conditions",
  "createTime",
  "deleteTime",
  "expireTime",
  "generation",
  "logUri",
  "name",
  "observedGeneration",
  "reconciling",
  "satisfiesPzs",
  "uid",
  "updateTime",
]);

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

/**
 * Fingerprint only the immutable revision's runtime configuration. Identity, timestamps, observed
 * conditions, and console links are verified separately or are mutable control-plane observations.
 * Every other top-level field, including any future configuration field, remains in the digest.
 */
export function fingerprintRevisionRuntimeConfiguration(value: unknown): string {
  if (
    !isRecord(value) ||
    !Array.isArray(value.containers) ||
    value.containers.length === 0
  ) {
    throw new Error("revision_configuration_invalid");
  }
  const configuration = Object.fromEntries(
    Object.entries(value).filter(([key]) => !REVISION_OUTPUT_ONLY_FIELDS.has(key)),
  );
  const canonical = canonicalizeJson(configuration);
  const digest = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  return `sha256:${digest}`;
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

function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("revision_configuration_invalid");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!isRecord(value)) throw new Error("revision_configuration_invalid");
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeJson(value[key])]),
  );
}

function assertCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("monitoring_count_invalid");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
