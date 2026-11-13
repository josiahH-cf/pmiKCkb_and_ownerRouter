// S263 R-S263-1..4 (ARCH-S263-1..4, BEH-S263-1..2): the verified current lease end and the
// supported renewal date proposals.
//
// One shared current lease-end fact serves Check the numbers, the date proposal and the tenant
// offer's lease-end sentence. It is the exact current RentVine lease end, read current and
// complete, unless the work record names a different lease end and staff have not kept that
// recorded cycle (the existing S246 decision). A stale or incomplete read, a missing date or an
// unresolved disagreement is not verified, and nothing dependent uses the raw date. Sheet values
// remain information (D-OP-7).
//
// For an eligible fixed term with a verified end and an empty current-cycle start, the proposal
// is the next calendar day: date-only arithmetic, no clock time and no timezone. An end is
// proposed only from a stated term and the inclusive-end convention. S285 R-S285-1 (ARCH-S285-1)
// supplies the term as a deliberate staff choice: a 12 month term, and the current lease's own
// length when its verified start and end give another whole number of months. `proposeRenewalEnd`
// stays the one end-date calculation, called only with the months staff chose. Loading a
// proposal saves nothing. Pure.

import { formatCalendarDate } from "@/lib/date-display";
import type { LeaseTerm } from "@/lib/lease-renewal/lease-term-types";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function parts(iso: string | null | undefined): [number, number, number] | null {
  const match = ISO_DATE.exec(iso ?? "");
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? [year, month, day]
    : null;
}

function isoFromUtc(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** A real calendar date in YYYY-MM-DD form; Feb 30 and other impossible days are not. */
export function isCalendarDate(iso: string | null | undefined): iso is string {
  return parts(iso) !== null;
}

/** Calendar-day arithmetic on a date: November 30 + 1 is December 1, December 31 + 1 is January 1. */
export function addCalendarDays(iso: string, days: number): string | null {
  const date = parts(iso);
  if (!date) return null;
  return isoFromUtc(Date.UTC(date[0], date[1] - 1, date[2]) + days * DAY_MS);
}

export function nextCalendarDay(iso: string): string | null {
  return addCalendarDays(iso, 1);
}

export type VerifiedLeaseEnd =
  | {
      readonly state: "verified";
      readonly endIso: string;
      /** RentVine's current lease end, or the recorded cycle staff kept working (S246). */
      readonly basis: "rentvine" | "recorded_cycle";
      /** Identifies the basis a proposal or review was made from. */
      readonly fingerprint: string;
    }
  | {
      readonly state: "unverified";
      readonly reason: "unreadable" | "missing" | "disputed";
      /** The raw provider date, shown as evidence only; never used for a proposal or offer. */
      readonly rawEndIso: string | null;
      /** What is wrong, in plain words. */
      readonly line: string;
    };

/** S263: the one fix that verifies the current lease end in Check the numbers. */
export const VERIFY_CURRENT_LEASE_END_LABEL = "Verify current lease end";
export const ENTER_RENEWAL_START_LABEL = "Enter renewal start date";
export const ENTER_RENEWAL_END_LABEL = "Enter renewal end date";
export const USE_DAY_AFTER_LEASE_END_LABEL = "Use the day after the current lease ends";
export const RETURN_TO_TENANT_OFFER_LABEL = "Return to tenant offer";

export function verifiedLeaseEnd(input: {
  /** The exact current RentVine lease end for this lease. */
  readonly rentvineEndIso: string | null | undefined;
  /** False when the RentVine read behind it is incomplete or expired. */
  readonly sourceReadable: boolean;
  /** The lease end the work record was recorded against, when it was recorded against one. */
  readonly recordedLeaseEndIso?: string | null;
  /** Staff kept working the recorded cycle after RentVine reported another end (S246). */
  readonly keptRecordedCycle?: boolean;
}): VerifiedLeaseEnd {
  const raw = isCalendarDate(input.rentvineEndIso) ? input.rentvineEndIso : null;
  if (!input.sourceReadable)
    return {
      state: "unverified",
      reason: "unreadable",
      rawEndIso: raw,
      line: "The RentVine read for this lease is not current. Refresh the lease to verify the current lease end.",
    };
  if (!raw)
    return {
      state: "unverified",
      reason: "missing",
      rawEndIso: null,
      line: "RentVine has no lease end for this lease.",
    };
  const recorded = isCalendarDate(input.recordedLeaseEndIso)
    ? input.recordedLeaseEndIso
    : null;
  if (recorded && recorded !== raw) {
    if (input.keptRecordedCycle)
      return {
        state: "verified",
        endIso: recorded,
        basis: "recorded_cycle",
        fingerprint: `recorded_cycle:${recorded}`,
      };
    return {
      state: "unverified",
      reason: "disputed",
      rawEndIso: raw,
      line: `RentVine now reports ${formatCalendarDate(raw)} and this renewal was recorded for ${formatCalendarDate(recorded)}.`,
    };
  }
  return {
    state: "verified",
    endIso: raw,
    basis: "rentvine",
    fingerprint: `rentvine:${raw}`,
  };
}

export type RenewalStartProposal =
  | {
      readonly state: "suggested";
      readonly startIso: string;
      readonly leaseEndIso: string;
      readonly basisFingerprint: string;
    }
  | {
      readonly state: "none";
      readonly reason:
        | "not_fixed_term"
        | "non_renewal"
        | "start_saved"
        | "unverified_end"
        | "invalid_end";
    };

/**
 * R-S263-1: the day after the verified current lease end, for an eligible fixed term whose
 * current-cycle start is authoritatively empty. A saved or unconfirmed start always wins.
 */
export function proposeRenewalStart(input: {
  readonly leaseEnd: VerifiedLeaseEnd;
  readonly term: LeaseTerm | null | undefined;
  /** A recorded non-renewal, move-out or other decision incompatible with a contiguous renewal. */
  readonly nonRenewal: boolean;
  /** The current-cycle working start holds no value and nothing waits for confirmation. */
  readonly startEmpty: boolean;
}): RenewalStartProposal {
  if (input.term !== "fixed_term") return { state: "none", reason: "not_fixed_term" };
  if (input.nonRenewal) return { state: "none", reason: "non_renewal" };
  if (!input.startEmpty) return { state: "none", reason: "start_saved" };
  if (input.leaseEnd.state !== "verified")
    return { state: "none", reason: "unverified_end" };
  const startIso = nextCalendarDay(input.leaseEnd.endIso);
  if (!startIso) return { state: "none", reason: "invalid_end" };
  return {
    state: "suggested",
    startIso,
    leaseEndIso: input.leaseEnd.endIso,
    basisFingerprint: input.leaseEnd.fingerprint,
  };
}

/**
 * R-S263-2: an intended term for one lease and cycle. S285 R-S285-1: it comes only from the term
 * staff choose (`renewalEndChoices`).
 */
export interface RenewalTermBasis {
  readonly months: number;
  /** The end is the last day of the term: the day before the same date `months` later. */
  readonly convention: "inclusive_end";
}

export type RenewalEndProposal =
  | { readonly state: "suggested"; readonly endIso: string }
  | { readonly state: "enter"; readonly reason: string };

/**
 * R-S263-2: an end only when the term and convention give one unique date. Without a basis, or
 * when the anniversary day does not exist (a month end or February 29), staff enter the end.
 */
export function proposeRenewalEnd(
  startIso: string | null | undefined,
  term: RenewalTermBasis | null | undefined,
): RenewalEndProposal {
  const start = parts(startIso);
  if (!start) return { state: "enter", reason: "Enter the renewal start date first." };
  if (!term || !Number.isInteger(term.months) || term.months <= 0)
    return {
      state: "enter",
      reason:
        "No intended term length is recorded for this renewal. Enter the renewal end date.",
    };
  const [year, month, day] = start;
  const total = month - 1 + term.months;
  const anniversary = new Date(Date.UTC(year + Math.floor(total / 12), total % 12, day));
  if (anniversary.getUTCDate() !== day)
    return {
      state: "enter",
      reason:
        "The renewal start falls on a day that does not repeat in the end month. Enter the renewal end date.",
    };
  return { state: "suggested", endIso: isoFromUtc(anniversary.getTime() - DAY_MS) };
}

// ---- S285 R-S285-1: the end-date choices staff make ---------------------------------------------

/** R-S285-1 (assumption, owner-accepted): the standard renewal term offered, in months. */
export const STANDARD_RENEWAL_TERM_MONTHS = 12;

/** R-S285-1: the basis the existing save stores with a chosen end date. */
export const RENEWAL_END_BASIS = {
  standard: "12 month term chosen by staff",
  currentLength: "current lease length chosen by staff",
} as const;
export type RenewalEndBasis = (typeof RENEWAL_END_BASIS)[keyof typeof RENEWAL_END_BASIS];

export function isRenewalEndBasis(value: unknown): value is RenewalEndBasis {
  return (
    value === RENEWAL_END_BASIS.standard || value === RENEWAL_END_BASIS.currentLength
  );
}

export interface RenewalEndChoice {
  readonly kind: "standard" | "current_length";
  readonly months: number;
  readonly endIso: string;
  /** "Use a 12 month term (ends 12/31/2027)". */
  readonly label: string;
  readonly basis: RenewalEndBasis;
}

export type RenewalEndChoices =
  | { readonly state: "choices"; readonly choices: readonly RenewalEndChoice[] }
  /** The start's day does not repeat in the end month: the existing line asks for the end. */
  | { readonly state: "enter"; readonly line: string }
  | {
      readonly state: "none";
      readonly reason:
        | "not_fixed_term"
        | "non_renewal"
        | "end_saved"
        | "no_start"
        | "no_choice";
    };

function monthsWord(months: number): string {
  return months === 1 ? "1 month" : `${months} months`;
}

/**
 * R-S285-1: the whole number of months the current lease runs, from its verified start and end
 * under the inclusive-end convention (01/01/2026 to 12/31/2026 is 12), or null when the dates do
 * not give a whole number of months.
 */
export function wholeLeaseMonths(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): number | null {
  const start = parts(startIso);
  const end = parts(endIso);
  if (!start || !end || endIso! <= startIso!) return null;
  const difference = (end[0] - start[0]) * 12 + (end[1] - start[1]);
  for (const months of [difference, difference + 1]) {
    if (months <= 0) continue;
    const proposal = proposeRenewalEnd(startIso, { months, convention: "inclusive_end" });
    if (proposal.state === "suggested" && proposal.endIso === endIso) return months;
  }
  return null;
}

/**
 * R-S285-1 (ARCH-S285-1): the end-date choices beside manual entry of the working end. Offered
 * only for an eligible fixed term (no month-to-month, non-renewal or inspection-only case), while
 * the current-cycle end is empty and a start is chosen or saved: "Use a 12 month term (ends
 * 12/31/2027)", and, when the current lease's verified start and end give a whole number of
 * months other than 12, "Use the current lease's length, 6 months (ends 06/30/2027)". Each end is
 * `proposeRenewalEnd` with the months that choice states, and nothing else. A start whose day does
 * not repeat in the end month (February 29) offers no choice; the existing line asks for the end.
 * Computing the choices saves nothing.
 */
export function renewalEndChoices(input: {
  /** The working start staff chose (not yet saved) or saved, for the current cycle. */
  readonly startIso: string | null | undefined;
  readonly term: LeaseTerm | null | undefined;
  readonly nonRenewal: boolean;
  /** The current-cycle working end holds no saved value. */
  readonly endEmpty: boolean;
  /** The current lease's verified start and end, when both are verified. */
  readonly currentLease?: {
    readonly startIso: string | null;
    readonly endIso: string | null;
  } | null;
}): RenewalEndChoices {
  if (input.term !== "fixed_term") return { state: "none", reason: "not_fixed_term" };
  if (input.nonRenewal) return { state: "none", reason: "non_renewal" };
  if (!input.endEmpty) return { state: "none", reason: "end_saved" };
  if (!isCalendarDate(input.startIso)) return { state: "none", reason: "no_start" };
  const choices: RenewalEndChoice[] = [];
  const standard = proposeRenewalEnd(input.startIso, {
    months: STANDARD_RENEWAL_TERM_MONTHS,
    convention: "inclusive_end",
  });
  if (standard.state === "enter") return { state: "enter", line: standard.reason };
  choices.push({
    kind: "standard",
    months: STANDARD_RENEWAL_TERM_MONTHS,
    endIso: standard.endIso,
    label: `Use a ${STANDARD_RENEWAL_TERM_MONTHS} month term (ends ${formatCalendarDate(standard.endIso)})`,
    basis: RENEWAL_END_BASIS.standard,
  });
  const leaseMonths = input.currentLease
    ? wholeLeaseMonths(input.currentLease.startIso, input.currentLease.endIso)
    : null;
  if (leaseMonths !== null && leaseMonths !== STANDARD_RENEWAL_TERM_MONTHS) {
    const current = proposeRenewalEnd(input.startIso, {
      months: leaseMonths,
      convention: "inclusive_end",
    });
    if (current.state === "suggested")
      choices.push({
        kind: "current_length",
        months: leaseMonths,
        endIso: current.endIso,
        label: `Use the current lease's length, ${monthsWord(leaseMonths)} (ends ${formatCalendarDate(current.endIso)})`,
        basis: RENEWAL_END_BASIS.currentLength,
      });
  }
  return choices.length
    ? { state: "choices", choices }
    : { state: "none", reason: "no_choice" };
}

/**
 * R-S285-1 / S263 R-S263-3: a saved end chosen as a term no longer equals that term from the
 * current start. The saved end stays; the line asks staff to review it. Null when consistent,
 * typed by staff, or not computable.
 */
export function chosenEndInconsistency(input: {
  readonly startIso: string | null | undefined;
  readonly endIso: string | null | undefined;
  /** The basis the end was saved with (its context), if any. */
  readonly basis: string | null | undefined;
  readonly currentLease?: {
    readonly startIso: string | null;
    readonly endIso: string | null;
  } | null;
}): string | null {
  if (!isRenewalEndBasis(input.basis) || !isCalendarDate(input.endIso)) return null;
  if (!isCalendarDate(input.startIso)) return null;
  const months =
    input.basis === RENEWAL_END_BASIS.standard
      ? STANDARD_RENEWAL_TERM_MONTHS
      : input.currentLease
        ? wholeLeaseMonths(input.currentLease.startIso, input.currentLease.endIso)
        : null;
  if (months === null) return null;
  const expected = proposeRenewalEnd(input.startIso, {
    months,
    convention: "inclusive_end",
  });
  if (expected.state === "suggested" && expected.endIso === input.endIso) return null;
  return input.basis === RENEWAL_END_BASIS.standard
    ? "The saved end date was chosen as a 12 month term and no longer matches the start date. Review the end date."
    : "The saved end date was chosen as the current lease's length and no longer matches the start date. Review the end date.";
}
