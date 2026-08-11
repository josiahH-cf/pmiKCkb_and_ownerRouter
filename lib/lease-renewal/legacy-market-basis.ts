/**
 * Bounded read-only compatibility for pre-2026-08-10 market-basis records.
 *
 * The historical keys are deliberately quarantined in this module. Valid numeric values become
 * neutral manual-reference facts. The historical URL is recognized only so callers can prove it is
 * ignored; it is never returned, rendered, followed, or copied into a current write.
 */

export interface LegacyManualMarketBasis {
  rangeLow?: number;
  rangeHigh?: number;
  invalid: boolean;
  ignoredUrlPresent: boolean;
}

const LEGACY_LOW_KEYS = ["zillowLow", "zillow_low"] as const;
const LEGACY_HIGH_KEYS = ["zillowHigh", "zillow_high"] as const;
const LEGACY_URL_KEYS = ["compsUrl", "comps_url"] as const;

function ownValue(
  input: Record<string, unknown>,
  keys: readonly string[],
): { present: boolean; value?: unknown } {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      return { present: true, value: input[key] };
    }
  }
  return { present: false };
}

function validLegacyMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function decodeLegacyManualMarketBasis(input: unknown): LegacyManualMarketBasis {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { invalid: false, ignoredUrlPresent: false };
  }
  const record = input as Record<string, unknown>;
  const low = ownValue(record, LEGACY_LOW_KEYS);
  const high = ownValue(record, LEGACY_HIGH_KEYS);
  const url = ownValue(record, LEGACY_URL_KEYS);
  const invalid =
    (low.present && !validLegacyMoney(low.value)) ||
    (high.present && !validLegacyMoney(high.value)) ||
    (validLegacyMoney(low.value) &&
      validLegacyMoney(high.value) &&
      high.value < low.value);
  if (invalid) {
    return { invalid: true, ignoredUrlPresent: url.present };
  }
  return {
    ...(validLegacyMoney(low.value) ? { rangeLow: low.value } : {}),
    ...(validLegacyMoney(high.value) ? { rangeHigh: high.value } : {}),
    invalid: false,
    ignoredUrlPresent: url.present,
  };
}
