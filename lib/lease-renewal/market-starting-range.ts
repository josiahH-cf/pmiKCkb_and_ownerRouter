import type { MarketCompQueryBasis } from "@/lib/lease-renewal/market-comp-query-basis";

/**
 * S118 (accepted Q1A): the owner-approved starting range around the contractual base rent.
 * The percentage is 20% through $750, tapers linearly to 15% at $2,500 and is clamped beyond
 * both endpoints. Low and high are computed in exact integer cents with half-up rounding, so
 * $1,625 yields $1,340.63 to $1,909.38. The band is a preparation aid only: it never filters
 * provider comparables, never stands in for a returned range and never instructs a rent change.
 */
export const STARTING_RANGE_RULE = Object.freeze({
  lowRentDollars: 750,
  highRentDollars: 2500,
  lowRentPercent: 0.2,
  highRentPercent: 0.15,
});

export const STARTING_RANGE_LABEL =
  "Starting range from current rent, not market evidence";

export type StartingRange =
  | {
      status: "available";
      currentRent: number;
      /** The applied fraction (0.2 through 0.15). */
      percent: number;
      low: number;
      high: number;
      sourcePath: string;
    }
  | { status: "unavailable"; reason: string };

export type StartingRangeBaseRent =
  | MarketCompQueryBasis["baseRent"]
  | number
  | null
  | undefined;

/** The exact rational percentage as numerator/denominator for cents-exact arithmetic. */
function percentRatio(rentCents: number): { p: number; q: number } {
  if (rentCents <= STARTING_RANGE_RULE.lowRentDollars * 100) return { p: 1, q: 5 };
  if (rentCents >= STARTING_RANGE_RULE.highRentDollars * 100) return { p: 3, q: 20 };
  // w(r) = 0.20 - 0.05 * (r - 750) / 1750 = (7750 - r) / 35000 with r in dollars.
  return { p: 775_000 - rentCents, q: 3_500_000 };
}

/** Half-up integer division for non-negative operands. */
function halfUpDivide(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

export function startingRangePercent(rentDollars: number): number {
  const { p, q } = percentRatio(Math.round(rentDollars * 100));
  return p / q;
}

export function computeStartingRange(baseRent: StartingRangeBaseRent): StartingRange {
  if (baseRent !== null && typeof baseRent === "object") {
    if (baseRent.status !== "verified")
      return { status: "unavailable", reason: baseRent.reason };
    return computeFromRent(baseRent.value, baseRent.sourcePath);
  }
  return computeFromRent(baseRent, "current contractual base rent");
}

function computeFromRent(
  rent: number | null | undefined,
  sourcePath: string,
): StartingRange {
  if (typeof rent !== "number" || !Number.isFinite(rent) || rent <= 0)
    return {
      status: "unavailable",
      reason:
        "Contractual base rent is unavailable or not a positive amount, so there is no starting range. Resolve the current base rent first.",
    };
  const rentCents = Math.round(rent * 100);
  const { p, q } = percentRatio(rentCents);
  return {
    status: "available",
    currentRent: rentCents / 100,
    percent: p / q,
    low: halfUpDivide(rentCents * (q - p), q) / 100,
    high: halfUpDivide(rentCents * (q + p), q) / 100,
    sourcePath,
  };
}

/** True when both saved figures equal the starting band for this base rent, to the cent. */
export function matchesStartingRange(
  range: { low?: number; high?: number },
  baseRent: StartingRangeBaseRent,
): boolean {
  const band = computeStartingRange(baseRent);
  if (band.status !== "available" || range.low === undefined || range.high === undefined)
    return false;
  return (
    Math.round(range.low * 100) === Math.round(band.low * 100) &&
    Math.round(range.high * 100) === Math.round(band.high * 100)
  );
}

/** Whole dollars render without cents; anything else keeps two decimals for the input. */
export function startingRangeInputValue(amount: number): string {
  const cents = Math.round(amount * 100);
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
