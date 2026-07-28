/**
 * Record-level operating lane.
 *
 * S40 makes classification explicit and fail-closed. Two rules, and the distinction between them
 * is the whole point of this module:
 *
 * 1. **Anything newly written, or any decision that grants authority, must be explicitly
 *    classified.** Use {@link requireRecordDataMode} or {@link requireExplicitDataMode}. A missing
 *    or unknown value is refused rather than resolved.
 * 2. **A record written before S40 has no stored classification.** Reading one is a bounded
 *    stage-one compatibility path: {@link resolveStoredDataMode}. It is deliberately the only
 *    place in the codebase where a missing value still resolves to Live, it is named so it can be
 *    grepped, and S49 deletes it once the migration proves no unclassified record remains.
 *
 * The original safety property is preserved in both directions: a missing, unknown, or
 * browser-supplied value can never turn a Live record into a Demo record or route it to a
 * simulated provider, and it can no longer silently promote an unclassified record to Live on a
 * write path either.
 */
export const DATA_MODES = ["live", "test"] as const;

export type DataMode = (typeof DATA_MODES)[number];

export interface DataModeRecord {
  data_mode?: DataMode;
}

/**
 * Stage-one compatibility read for a record persisted before S40 required classification.
 *
 * Missing resolves to Live because that is what the deployed application already did and what the
 * stored data means; changing it on the read path would reclassify live customer records rather
 * than protect them. Do NOT use this on a write path, for a new record, or to decide authority —
 * use {@link requireRecordDataMode} there.
 *
 * S49 removes this function after the S40 migration proves every record carries an explicit mode.
 */
export function resolveStoredDataMode(
  record: DataModeRecord | null | undefined,
): DataMode {
  return record?.data_mode === "test" ? "test" : "live";
}

/**
 * Strictly read a record's classification. Refuses a missing or unknown value instead of
 * defaulting. Use for every new record, every write, and every authority decision.
 */
export function requireRecordDataMode(
  record: DataModeRecord | null | undefined,
): DataMode {
  const parsed = parseExplicitDataMode(record?.data_mode);
  if (!parsed) {
    throw new Error(
      "This record has no data classification. A record must be explicitly live or test before it can be written or acted on.",
    );
  }
  return parsed;
}

export function parseExplicitDataMode(value: unknown): DataMode | null {
  return value === "live" || value === "test" ? value : null;
}

export function requireExplicitDataMode(value: unknown): DataMode {
  const parsed = parseExplicitDataMode(value);
  if (!parsed) throw new Error("data_mode must be exactly live or test.");
  return parsed;
}

export function dataModeLabel(mode: DataMode) {
  return mode === "test" ? "Test data" : "Live data";
}

/**
 * Non-routable aliases are mandatory for invented Demo identities. `.invalid` is reserved by
 * RFC 2606 and cannot accidentally deliver mail to a customer or provider.
 */
export function isNonRoutableTestEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.invalid$/.test(normalized);
}

export function assertNonRoutableTestEmail(value: string) {
  if (!isNonRoutableTestEmail(value)) {
    throw new Error("Test identities must use a non-routable .invalid email address.");
  }
  return value.trim().toLowerCase();
}

export interface ExecutionEvidenceMarker {
  dataMode: DataMode;
  liveEvidenceEligible: boolean;
}

export function executionEvidenceMarker(mode: DataMode): ExecutionEvidenceMarker {
  return {
    dataMode: mode,
    liveEvidenceEligible: mode === "live",
  };
}
