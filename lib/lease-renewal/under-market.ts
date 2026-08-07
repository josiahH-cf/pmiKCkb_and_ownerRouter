// S60: the internal under-market signal. Compares the authoritative current rent against the
// PROVIDER point estimate and flags when it falls materially below. INTERNAL ONLY — it surfaces on
// the desk and in the operator's view and never enters a client-facing draft, because a statement
// about what a property "should" rent for is exactly the owner-money territory the governance
// carve-out keeps human. It is a prompt for a person to look, not an instruction to raise rent.
//
// It computes only from a provider basis: comparing the operator's own typed figure against itself
// would be meaningless (AC-S60-9). Pure and deterministic; renders the ACTUAL percentage so the
// reader judges the number rather than trusting the threshold.

/**
 * The threshold, in percent below the provider point estimate, at which a rent counts as
 * materially under market. 10 percent is the owner-adopted confirmed policy
 * (`Q-UNDER-MARKET-THRESHOLD`, 2026-08-06).
 */
export const UNDER_MARKET_THRESHOLD_PCT = 10;

export interface UnderMarketInput {
  /** Authoritative current rent (RentVine). */
  currentRent: number;
  /** The PROVIDER point estimate. Absent → no signal, never a guess. */
  providerPointEstimate?: number;
  /** Threshold in percent; defaults to the confirmed policy constant. */
  thresholdPct?: number;
}

export interface UnderMarketSignal {
  /** The actual percentage below the provider point estimate, rounded to one decimal. */
  percentBelow: number;
  thresholdPct: number;
  /** Operator-facing sentence. Never enters a client draft. */
  message: string;
}

/**
 * Compute the signal, or null when it does not apply: no provider estimate, a non-positive input,
 * or a rent at/above the threshold line. Pure function of its inputs (AC-S60-7).
 */
export function computeUnderMarketSignal(
  input: UnderMarketInput,
): UnderMarketSignal | null {
  const threshold = input.thresholdPct ?? UNDER_MARKET_THRESHOLD_PCT;
  const estimate = input.providerPointEstimate;
  if (
    estimate === undefined ||
    !Number.isFinite(estimate) ||
    estimate <= 0 ||
    !Number.isFinite(input.currentRent) ||
    input.currentRent <= 0 ||
    !Number.isFinite(threshold) ||
    threshold <= 0
  ) {
    return null;
  }
  const percentBelow = ((estimate - input.currentRent) / estimate) * 100;
  if (percentBelow < threshold) return null;
  const rounded = Math.round(percentBelow * 10) / 10;
  return {
    percentBelow: rounded,
    thresholdPct: threshold,
    message: `Current rent is ${rounded}% below the market point estimate. Worth a look before the owner conversation. Internal note; this stays out of client drafts.`,
  };
}
