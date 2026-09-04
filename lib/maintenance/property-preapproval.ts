// S108 property maintenance preapproval: the exact amount an owner has already authorized for a
// property, recorded by an Admin from the owner's records. Money is stored as whole cents so a
// comparison against an estimate is exact; nothing here reaches a provider, and a preapproval never
// claims owner approval inside RentVine.

export interface MaintenancePropertyPreapproval {
  readonly property_key: string;
  readonly amount_cents: number;
  readonly effective_from_iso: string;
  readonly recorded_by_uid: string;
  readonly version: number;
  readonly note?: string;
}

/** The largest amount an Admin may record. A larger entry is a typo, not an authorization. */
export const MAX_PREAPPROVAL_AMOUNT_CENTS = 100_000_00;

export class PreapprovalAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreapprovalAmountError";
  }
}

/**
 * Parse an operator-entered amount into whole cents. Only a plain positive decimal with at most two
 * fractional digits is accepted; grouping commas and one leading currency symbol are tolerated
 * because that is how the amount appears in the owner's records.
 */
export function parsePreapprovalAmountCents(input: string): number {
  const trimmed = String(input ?? "")
    .trim()
    .replace(/^\$/, "")
    .replaceAll(",", "");
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(trimmed)) {
    throw new PreapprovalAmountError(
      "Enter the preapproval as a dollar amount with at most two decimal places, for example 500 or 1250.75.",
    );
  }
  const [dollars, fraction = ""] = trimmed.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new PreapprovalAmountError("A preapproval amount must be greater than zero.");
  }
  if (cents > MAX_PREAPPROVAL_AMOUNT_CENTS) {
    throw new PreapprovalAmountError(
      `A preapproval above ${formatPreapprovalAmount(MAX_PREAPPROVAL_AMOUNT_CENTS)} needs the owner's written direction; record the exact authorized amount instead.`,
    );
  }
  return cents;
}

export function formatPreapprovalAmount(cents: number): string {
  const negative = cents < 0;
  const absolute = Math.abs(Math.trunc(cents));
  const dollars = String(Math.floor(absolute / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  const remainder = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars}.${remainder}`;
}

/**
 * True only when an exact recorded estimate is at or below an exact recorded preapproval. A missing
 * estimate or a missing preapproval is never "within": absence is not authorization.
 */
export function isWithinPreapproval(
  estimateCents: number | null | undefined,
  preapproval: MaintenancePropertyPreapproval | null | undefined,
): boolean {
  if (typeof estimateCents !== "number" || !Number.isFinite(estimateCents)) return false;
  if (estimateCents <= 0) return false;
  if (!preapproval || !Number.isFinite(preapproval.amount_cents)) return false;
  return estimateCents <= preapproval.amount_cents;
}
