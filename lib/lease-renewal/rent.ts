// Base-rent reconciliation helper (Phase-1 read-only; design §3.2). Pure and deterministic; no I/O.
//
// RentVine's "current rent" is the BASE contractual rent — it excludes the resident benefit package
// and the renters-insurance charge (show-and-tell ~00:21:50: a tenant shown at base "without his RBP
// and insurance charge"). The tracking sheet's "Current Rent" sometimes carries those add-ons folded
// in. Comparing the two raw numbers then surfaces a false "conflict". `rentsAgree` treats the two as
// consistent when their difference is explained by some subset of the known add-ons (within a small
// tolerance), so reconciliation only flags a current_rent conflict that is a REAL pricing difference.

/** Known monthly add-ons that may be folded into a sheet "Current Rent" but not RentVine's base rent. */
export const DEFAULT_RENT_ADDONS = [
  11.95, // second-nature renters insurance (transcript: "$11.95")
  28, // resident benefit package (transcript: "$28 or something")
];

export interface RentAgreementOptions {
  addOns?: number[];
  /** Absolute dollar tolerance for rounding / cents drift. */
  tolerance?: number;
}

/** All distinct subset sums of `values` (including the empty subset, 0). */
export function subsetSums(values: number[]): number[] {
  let sums = [0];
  for (const value of values) {
    sums = [...sums, ...sums.map((sum) => sum + value)];
  }
  return Array.from(new Set(sums));
}

/** Coerce a rent value (number, "$1,250", "1250.00") to a finite number, else null. */
export function toRentAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const amount = Number(trimmed.replace(/[$,\s]/g, ""));
    return Number.isFinite(amount) ? amount : null;
  }
  return null;
}

/**
 * True when two rent figures are the SAME base rent once known add-ons are accounted for: either they
 * are equal (within tolerance) or the larger exceeds the smaller by a subset-sum of the add-ons. This
 * is a magnitude-only primitive (symmetric in `a`/`b`); the DIRECTIONAL decision — which side may
 * legitimately carry the add-ons (the sheet folds them onto RentVine's base, so only sheet >= base
 * may be suppressed) — is the caller's responsibility (see pipeline.ts §2.3). Only ever used to
 * SUPPRESS a false conflict, never to assert agreement that isn't there.
 */
export function rentsAgree(
  a: number,
  b: number,
  options: RentAgreementOptions = {},
): boolean {
  const addOns = options.addOns ?? DEFAULT_RENT_ADDONS;
  const tolerance = options.tolerance ?? 0.5;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const gap = hi - lo;
  return subsetSums(addOns).some((sum) => Math.abs(gap - sum) <= tolerance);
}
