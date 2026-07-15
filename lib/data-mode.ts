/**
 * Record-level operating lane used anywhere Live and invented Test data coexist.
 *
 * Legacy records intentionally resolve to Live. Test must always be an explicit stored
 * value; a missing/unknown/browser-supplied value can never silently turn a Live record
 * into a Test record or route it to a simulated provider.
 */
export const DATA_MODES = ["live", "test"] as const;

export type DataMode = (typeof DATA_MODES)[number];

export interface DataModeRecord {
  data_mode?: DataMode;
}

export function resolveDataMode(record: DataModeRecord | null | undefined): DataMode {
  return record?.data_mode === "test" ? "test" : "live";
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
 * Non-routable aliases are mandatory for the production Test workspace. `.invalid` is
 * reserved by RFC 2606 and cannot accidentally deliver mail to a customer or provider.
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
