// S103: the ONE lease-term projection consumed by the cohort, the desk, the workspace, and the
// assistant.
//
// The term is a PROVIDER fact first. S102's lease-detail enrichment places the documented
// `isMonthToMonth` (exact "1"/"0"), `monthToMonthStartDate`, and `hasPendingMonthToMonthConversion`
// on every live lease view; those exact fields decide the term. Dates are EVIDENCE, never the
// classifier: an expired end date, a missing end date, a pending conversion, an unreadable detail,
// or a signal that contradicts the dates all yield `needs_review`, never a silent classification.
//
// When provider evidence is absent or contradictory a person may record one app-owned term review.
// That record is bound to the exact source fingerprint of the lease view the person saw; a drifted
// fingerprint makes it stale and the term falls back to `needs_review`. A recorded review may move a
// lease OUT of the monthly renewal cohort (`month_to_month`), and may resolve an unclear lease into
// `fixed_term`, but it can never override an exact provider month-to-month signal.
//
// Pure and deterministic: no I/O and no Date.now() — the reference date is an INPUT.

import { createHash } from "node:crypto";

import type { RawLease } from "@/lib/integrations/rentvine/client";
import {
  leaseDetailOf,
  leaseEndDateIso,
  leaseIdOfView,
  type LeaseDetailView,
} from "@/lib/integrations/rentvine/lease-mapper";

export const LEASE_TERMS = ["fixed_term", "month_to_month", "needs_review"] as const;
export type LeaseTerm = (typeof LEASE_TERMS)[number];

/** The two terms a person may record. `needs_review` is a projection state, never a decision. */
export const RECORDABLE_LEASE_TERMS = ["fixed_term", "month_to_month"] as const;
export type RecordableLeaseTerm = (typeof RECORDABLE_LEASE_TERMS)[number];

/** Owner direction 2026-09-03: month-to-month leases are reviewed 12 months after their anchor. */
export const LEASE_TERM_REVIEW_INTERVAL_MONTHS = 12;

export const LEASE_TERM_SOURCE_FINGERPRINT_VERSION = "lease-term-source/v1" as const;

export type LeaseTermEvidence =
  | "provider_detail"
  | "recorded_review"
  | "legacy_signal"
  | "detail_unavailable"
  | "absent";

export type LeaseTermReason =
  | "provider_month_to_month"
  | "provider_fixed_term"
  | "recorded_month_to_month"
  | "recorded_fixed_term"
  | "legacy_month_to_month"
  | "pending_month_to_month_conversion"
  | "signal_contradicts_dates"
  | "expired_end_date"
  | "missing_end_date"
  | "detail_unavailable"
  | "no_term_evidence";

export type LeaseTermReviewState = "not_applicable" | "scheduled" | "needs_anchor";

export type LeaseTermAnchorSource =
  | "provider_month_to_month_start"
  | "recorded_review"
  | null;

/** One recorded term review, reduced to the facts the projection consumes. */
export interface LeaseTermReviewFact {
  readonly leaseId: string;
  readonly term: RecordableLeaseTerm;
  readonly anchorDateIso: string | null;
  readonly sourceFingerprint: string;
}

export interface LeaseTermProjection {
  readonly term: LeaseTerm;
  readonly reason: LeaseTermReason;
  readonly evidence: LeaseTermEvidence;
  readonly startDateIso: string | null;
  readonly endDateIso: string | null;
  /** Month-to-month review anchor: the provider start date, else the recorded anchor. */
  readonly anchorDateIso: string | null;
  readonly anchorSource: LeaseTermAnchorSource;
  readonly nextReviewIso: string | null;
  readonly reviewState: LeaseTermReviewState;
  /** True when a review record exists but its bound source fingerprint no longer matches. */
  readonly recordedReviewStale: boolean;
  /** Exact fingerprint of the term-bearing source facts this projection read. */
  readonly sourceFingerprint: string;
}

export interface ProjectLeaseTermOptions {
  /** ISO YYYY-MM-DD used only to decide whether an end date is expired; omitted disables that rule. */
  readonly referenceDateIso?: string;
}

/**
 * Legacy heuristic keys. They are consulted ONLY when no exact provider signal exists — a flat
 * fixture that never received a lease detail, or a live view whose detail read failed. They can
 * therefore never compete with the documented `isMonthToMonth` field; they only preserve the
 * pre-S103 protection that a lease describing itself as month-to-month stays out of the monthly
 * cohort while the exact signal is unreadable.
 */
const LEGACY_MONTH_TO_MONTH_TRUTHY_KEYS = ["isMonthToMonth", "monthToMonth", "mtm"];
const LEGACY_MONTH_TO_MONTH_TEXT_KEYS = [
  "leaseType",
  "leaseTypeName",
  "term",
  "frequency",
  "leaseTerm",
  "status",
];
const LEGACY_MONTH_TO_MONTH_PHRASES = [
  "month to month",
  "month-to-month",
  "monthly",
  "m2m",
];

function isPresent(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    !(typeof value === "string" && value.trim() === "")
  );
}

function isTruthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return ["true", "yes", "y", "1"].includes(value.trim().toLowerCase());
  }
  return false;
}

function legacyMonthToMonth(view: RawLease): boolean {
  for (const key of LEGACY_MONTH_TO_MONTH_TRUTHY_KEYS) {
    if (key in view && isPresent(view[key]) && isTruthy(view[key])) return true;
  }
  for (const key of LEGACY_MONTH_TO_MONTH_TEXT_KEYS) {
    if (!(key in view) || !isPresent(view[key])) continue;
    const text = String(view[key]).toLowerCase();
    if (LEGACY_MONTH_TO_MONTH_PHRASES.some((phrase) => text.includes(phrase))) {
      return true;
    }
  }
  return false;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Coerce a lease date value to ISO YYYY-MM-DD; null when unparseable. Accepts ISO and US M/D/Y. */
export function toLeaseTermIsoDate(value: unknown): string | null {
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

/**
 * Add whole months to an ISO date, clamping to the last day of the target month (so 2024-02-29 plus
 * 12 months is 2025-02-28). Returns null for an unparseable input.
 */
export function addLeaseTermMonths(iso: string, months: number): string | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  const zeroBased = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = (zeroBased % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${pad2(targetMonth)}-${pad2(Math.min(day, lastDay))}`;
}

/** The next annual review date for a month-to-month anchor, or null without an anchor. */
export function nextLeaseTermReviewIso(anchorDateIso: string | null): string | null {
  if (anchorDateIso === null) return null;
  return addLeaseTermMonths(anchorDateIso, LEASE_TERM_REVIEW_INTERVAL_MONTHS);
}

interface LeaseTermDetailFacts {
  status: "available" | "unavailable" | "absent";
  isMonthToMonth: boolean | null;
  monthToMonthStartDate: string | null;
  hasPendingMonthToMonthConversion: boolean | null;
}

function detailFacts(detail: LeaseDetailView | null): LeaseTermDetailFacts {
  if (detail === null) {
    return {
      status: "absent",
      isMonthToMonth: null,
      monthToMonthStartDate: null,
      hasPendingMonthToMonthConversion: null,
    };
  }
  if (detail.status === "unavailable") {
    return {
      status: "unavailable",
      isMonthToMonth: null,
      monthToMonthStartDate: null,
      hasPendingMonthToMonthConversion: null,
    };
  }
  return {
    status: "available",
    isMonthToMonth: detail.isMonthToMonth,
    monthToMonthStartDate: detail.monthToMonthStartDate,
    hasPendingMonthToMonthConversion: detail.hasPendingMonthToMonthConversion,
  };
}

/**
 * Versioned digest of exactly the term-bearing source facts a person sees. Read timestamps, rent,
 * labels, and links are excluded so an equivalent reread keeps a recorded review current; any change
 * to the term signal, the conversion flag, or the lease dates makes it stale.
 */
export function leaseTermSourceFingerprint(view: RawLease): string {
  const detail = detailFacts(leaseDetailOf(view));
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        version: LEASE_TERM_SOURCE_FINGERPRINT_VERSION,
        leaseId: leaseIdOfView(view),
        detailStatus: detail.status,
        isMonthToMonth: detail.isMonthToMonth,
        monthToMonthStartDate: detail.monthToMonthStartDate,
        hasPendingMonthToMonthConversion: detail.hasPendingMonthToMonthConversion,
        legacyMonthToMonth:
          detail.status === "available" ? null : legacyMonthToMonth(view),
        startDateIso: toLeaseTermIsoDate(view.startDate),
        endDateIso: leaseEndDateIso(view) ?? null,
      }),
    )
    .digest("hex");
  return `ltf1_${digest}`;
}

/**
 * The one term projection. Decision order (first wins):
 *   1. an exact provider month-to-month signal;
 *   2. a current recorded review that says month-to-month;
 *   3. an exact provider fixed-term signal with uncontradicted, unexpired dates;
 *   4. a current recorded review that says fixed-term;
 *   5. a legacy signal, only when no exact provider signal exists;
 *   6. otherwise `needs_review`, with the exact reason.
 */
export function projectLeaseTerm(
  view: RawLease,
  review: LeaseTermReviewFact | null = null,
  options: ProjectLeaseTermOptions = {},
): LeaseTermProjection {
  const sourceFingerprint = leaseTermSourceFingerprint(view);
  const currentReview =
    review && review.sourceFingerprint === sourceFingerprint ? review : null;
  const recordedReviewStale = review !== null && currentReview === null;
  const detail = detailFacts(leaseDetailOf(view));
  const startDateIso = toLeaseTermIsoDate(view.startDate);
  const endDateIso = leaseEndDateIso(view) ?? null;
  const referenceDateIso = options.referenceDateIso;

  const build = (
    term: LeaseTerm,
    reason: LeaseTermReason,
    evidence: LeaseTermEvidence,
  ): LeaseTermProjection => {
    const providerAnchor =
      term === "month_to_month" ? detail.monthToMonthStartDate : null;
    const recordedAnchor =
      term === "month_to_month" ? (currentReview?.anchorDateIso ?? null) : null;
    const anchorDateIso = providerAnchor ?? recordedAnchor;
    const anchorSource: LeaseTermAnchorSource =
      providerAnchor !== null
        ? "provider_month_to_month_start"
        : recordedAnchor !== null
          ? "recorded_review"
          : null;
    const nextReviewIso = nextLeaseTermReviewIso(anchorDateIso);
    const reviewState: LeaseTermReviewState =
      term !== "month_to_month"
        ? "not_applicable"
        : nextReviewIso === null
          ? "needs_anchor"
          : "scheduled";
    return {
      term,
      reason,
      evidence,
      startDateIso,
      endDateIso,
      anchorDateIso,
      anchorSource,
      nextReviewIso,
      reviewState,
      recordedReviewStale,
      sourceFingerprint,
    };
  };

  if (detail.status === "available" && detail.isMonthToMonth === true) {
    return build("month_to_month", "provider_month_to_month", "provider_detail");
  }
  if (currentReview?.term === "month_to_month") {
    return build("month_to_month", "recorded_month_to_month", "recorded_review");
  }
  if (detail.status === "available" && detail.isMonthToMonth === false) {
    if (detail.monthToMonthStartDate !== null) {
      return build("needs_review", "signal_contradicts_dates", "provider_detail");
    }
    if (detail.hasPendingMonthToMonthConversion === true) {
      return currentReview?.term === "fixed_term"
        ? build("fixed_term", "recorded_fixed_term", "recorded_review")
        : build("needs_review", "pending_month_to_month_conversion", "provider_detail");
    }
    if (endDateIso === null) {
      return currentReview?.term === "fixed_term"
        ? build("fixed_term", "recorded_fixed_term", "recorded_review")
        : build("needs_review", "missing_end_date", "provider_detail");
    }
    if (referenceDateIso !== undefined && endDateIso < referenceDateIso) {
      return currentReview?.term === "fixed_term"
        ? build("fixed_term", "recorded_fixed_term", "recorded_review")
        : build("needs_review", "expired_end_date", "provider_detail");
    }
    return build("fixed_term", "provider_fixed_term", "provider_detail");
  }
  if (currentReview?.term === "fixed_term") {
    return build("fixed_term", "recorded_fixed_term", "recorded_review");
  }
  if (legacyMonthToMonth(view)) {
    return build("month_to_month", "legacy_month_to_month", "legacy_signal");
  }
  if (detail.status === "unavailable") {
    return build("needs_review", "detail_unavailable", "detail_unavailable");
  }
  if (detail.status === "absent") {
    if (endDateIso === null) return build("needs_review", "missing_end_date", "absent");
    if (referenceDateIso !== undefined && endDateIso < referenceDateIso) {
      return build("needs_review", "expired_end_date", "absent");
    }
    return build("fixed_term", "provider_fixed_term", "legacy_signal");
  }
  return build("needs_review", "no_term_evidence", "provider_detail");
}

export const LEASE_TERM_LABELS: Record<LeaseTerm, string> = {
  fixed_term: "Fixed-term",
  month_to_month: "Month-to-month",
  needs_review: "Needs review",
};

export function humanizeLeaseTerm(term: LeaseTerm): string {
  return LEASE_TERM_LABELS[term];
}
