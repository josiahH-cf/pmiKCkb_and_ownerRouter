// Renewal candidate detection + skip-classification (Phase-1 live read; design §1 stage "Candidate
// detection"). Mirrors what Dan does by hand in Rentvine: filter leases by end date for the active
// batch (e.g. end of August / September), then set aside the ones that should NOT be auto-worked —
// no end date, month-to-month, an owner-authorized hold, or a program lease — and surface the
// off-cycle dates that fall outside the standard month-end batch (the ones he has missed before).
//
// CONSERVATIVE by construction: a lease is only `actionable` when it ends inside a requested window
// on a month boundary AND carries no skip signal. Anything uncertain (no end date, off-cycle date,
// an ambiguous signal) routes to `review`, never silently actioned and never silently dropped.
//
// Pure and deterministic: no I/O, no Date.now() — the renewal windows are an INPUT. The exact Rentvine
// field names confirm on the live read, so the signals are a CONFIGURABLE map (the same pattern as the
// lease field map); when the live keys differ, only DEFAULT_COHORT_CONFIG changes, in one place.

import type { RawLease } from "@/lib/integrations/rentvine/client";
import { DEFAULT_RENTVINE_LEASE_FIELD_MAP } from "@/lib/integrations/rentvine/lease-mapper";

/** An inclusive end-date window (ISO YYYY-MM-DD), e.g. the "end of August" batch. */
export interface DateWindow {
  startIso: string;
  endIso: string;
}

export type CohortDisposition = "actionable" | "skip" | "review" | "out_of_window";

export type CohortReason =
  | "actionable"
  | "month_to_month"
  | "owner_authorized"
  | "program"
  | "no_end_date"
  | "off_cycle_date"
  | "out_of_window";

/** How a skip signal's candidate values are matched. */
export type SkipMatch = "truthy" | { containsAnyOf: string[] };

export interface SkipSignal {
  reason: Extract<CohortReason, "month_to_month" | "owner_authorized" | "program">;
  /** Lease keys to inspect (first present wins). */
  keys: string[];
  match: SkipMatch;
}

export interface CohortConfig {
  /** Lease keys carrying the lease end date (first present wins). */
  endDateKeys: string[];
  /** Lease keys carrying a stable lease identifier (first present wins). */
  leaseIdKeys: string[];
  /** Definitive exclusions — first matching signal wins. */
  skipSignals: SkipSignal[];
}

/**
 * Best-effort defaults. The skip signals are heuristic until the live lease shape is confirmed; they
 * are deliberately specific (so a false skip is unlikely) and anything they do not catch falls through
 * to `actionable`/`review`, never a silent drop. Tune here once the real keys/values are observed.
 */
export const DEFAULT_COHORT_CONFIG: CohortConfig = {
  endDateKeys: DEFAULT_RENTVINE_LEASE_FIELD_MAP.renewalDate,
  leaseIdKeys: ["leaseID", "leaseId", "id"],
  skipSignals: [
    {
      reason: "month_to_month",
      keys: ["isMonthToMonth", "monthToMonth", "mtm"],
      match: "truthy",
    },
    {
      reason: "month_to_month",
      keys: ["leaseType", "leaseTypeName", "term", "frequency", "leaseTerm", "status"],
      match: { containsAnyOf: ["month to month", "month-to-month", "monthly", "m2m"] },
    },
    {
      reason: "owner_authorized",
      keys: ["status", "leaseStatus", "note", "notes", "tags"],
      match: {
        containsAnyOf: ["owner authorized", "owner hold", "owner approved", "let renew"],
      },
    },
    {
      reason: "program",
      keys: ["program", "programName", "leaseType", "leaseTypeName", "tags", "status"],
      match: {
        containsAnyOf: ["program", "padsplit", "section 8", "section8", "voucher", "hap"],
      },
    },
  ],
};

export interface CohortLease {
  /** Position in the input array (so callers can zip back to the original lease views). */
  index: number;
  leaseId: string | null;
  endDateIso: string | null;
  disposition: CohortDisposition;
  reason: CohortReason;
}

export interface RenewalCohort {
  /** Aligned 1:1 with the input leases, in input order. */
  classifications: CohortLease[];
  actionable: CohortLease[];
  skipped: CohortLease[];
  needsReview: CohortLease[];
  outOfWindow: CohortLease[];
  summary: {
    total: number;
    actionable: number;
    skipped: number;
    needsReview: number;
    outOfWindow: number;
    byReason: Record<CohortReason, number>;
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function firstPresent(
  lease: RawLease,
  keys: string[],
): { key: string; value: unknown } | null {
  for (const key of keys) {
    if (key in lease) {
      const value = lease[key];
      if (
        value !== undefined &&
        value !== null &&
        !(typeof value === "string" && value.trim() === "")
      ) {
        return { key, value };
      }
    }
  }
  return null;
}

/** Coerce a lease end-date value to ISO YYYY-MM-DD; null if unparseable. Accepts ISO and US M/D/Y. */
export function toCohortIsoDate(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text === "") return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    let year = Number(us[3]);
    if (us[3].length === 2) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }
  return null;
}

/** True when the ISO date is the last calendar day of its month (Dan's standard month-end batch). */
export function isMonthEnd(iso: string): boolean {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day === lastDay;
}

function inAnyWindow(iso: string, windows: DateWindow[]): boolean {
  // ISO YYYY-MM-DD compares correctly as a string.
  return windows.some((w) => iso >= w.startIso && iso <= w.endIso);
}

function isTruthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return ["true", "yes", "y", "1"].includes(value.trim().toLowerCase());
  }
  return false;
}

function signalMatches(value: unknown, match: SkipMatch): boolean {
  if (match === "truthy") return isTruthy(value);
  const text = String(value).toLowerCase();
  return match.containsAnyOf.some((needle) => text.includes(needle.toLowerCase()));
}

function matchedSkipReason(
  lease: RawLease,
  signals: SkipSignal[],
): SkipSignal["reason"] | null {
  for (const signal of signals) {
    const hit = firstPresent(lease, signal.keys);
    if (hit && signalMatches(hit.value, signal.match)) return signal.reason;
  }
  return null;
}

export interface ClassifyCohortOptions {
  windows: DateWindow[];
  config?: Partial<CohortConfig>;
}

/**
 * Classify each lease for the active renewal batch. Order of decision (first wins):
 *   1. a definitive skip signal (month-to-month / owner-authorized / program) -> skip
 *   2. no resolvable end date -> review ("no_end_date")
 *   3. end date outside every window -> out_of_window
 *   4. end date in a window but not a month-end -> review ("off_cycle_date")
 *   5. otherwise -> actionable
 */
export function classifyRenewalCohort(
  leases: RawLease[],
  options: ClassifyCohortOptions,
): RenewalCohort {
  const config: CohortConfig = {
    endDateKeys: options.config?.endDateKeys ?? DEFAULT_COHORT_CONFIG.endDateKeys,
    leaseIdKeys: options.config?.leaseIdKeys ?? DEFAULT_COHORT_CONFIG.leaseIdKeys,
    skipSignals: options.config?.skipSignals ?? DEFAULT_COHORT_CONFIG.skipSignals,
  };

  const classifications: CohortLease[] = leases.map((lease, index) => {
    const idHit = firstPresent(lease, config.leaseIdKeys);
    const leaseId = idHit ? String(idHit.value) : null;
    const endHit = firstPresent(lease, config.endDateKeys);
    const endDateIso = endHit ? toCohortIsoDate(endHit.value) : null;

    const skipReason = matchedSkipReason(lease, config.skipSignals);
    if (skipReason) {
      return { index, leaseId, endDateIso, disposition: "skip", reason: skipReason };
    }
    if (endDateIso === null) {
      return { index, leaseId, endDateIso, disposition: "review", reason: "no_end_date" };
    }
    if (!inAnyWindow(endDateIso, options.windows)) {
      return {
        index,
        leaseId,
        endDateIso,
        disposition: "out_of_window",
        reason: "out_of_window",
      };
    }
    if (!isMonthEnd(endDateIso)) {
      return {
        index,
        leaseId,
        endDateIso,
        disposition: "review",
        reason: "off_cycle_date",
      };
    }
    return {
      index,
      leaseId,
      endDateIso,
      disposition: "actionable",
      reason: "actionable",
    };
  });

  const actionable = classifications.filter((c) => c.disposition === "actionable");
  const skipped = classifications.filter((c) => c.disposition === "skip");
  const needsReview = classifications.filter((c) => c.disposition === "review");
  const outOfWindow = classifications.filter((c) => c.disposition === "out_of_window");

  // Typed seed (not an `as` cast) so adding a CohortReason without a count is a compile error —
  // mirrors the cast-free bySeverity map in pipeline.ts.
  const byReason: Record<CohortReason, number> = {
    actionable: 0,
    month_to_month: 0,
    owner_authorized: 0,
    program: 0,
    no_end_date: 0,
    off_cycle_date: 0,
    out_of_window: 0,
  };
  for (const c of classifications) byReason[c.reason] += 1;

  return {
    classifications,
    actionable,
    skipped,
    needsReview,
    outOfWindow,
    summary: {
      total: leases.length,
      actionable: actionable.length,
      skipped: skipped.length,
      needsReview: needsReview.length,
      outOfWindow: outOfWindow.length,
      byReason,
    },
  };
}

/** Keep only the lease views the cohort marked `actionable`, preserving input order. */
export function selectActionableLeases<T>(leases: T[], cohort: RenewalCohort): T[] {
  return leases.filter(
    (_, index) => cohort.classifications[index]?.disposition === "actionable",
  );
}
