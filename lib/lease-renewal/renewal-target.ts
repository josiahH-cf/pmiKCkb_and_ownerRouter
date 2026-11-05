// S246 R-S246-1: the one renewal target definition. A lease is a renewal target for a month when
// RentVine reports it active, its term is fixed-term or needs review (S103), its end date falls in
// that month, no move-out is initiated, no skip signal applies and no completion is recorded for
// that cycle. The Renewals desk, the lease page and the Dashboard assistant all read this one
// projection, so they cannot disagree about which leases are renewal work.
//
// Pure and client-safe: no I/O, no clock, no provider module. The lease status fact is read from
// the documented RentVine lease status table by `rentvine-lease-status.ts`. R-S246-12: an
// unreadable table or lease status arrives here as unavailable and never excludes a lease.

import { formatCalendarDate, formatCalendarMonth } from "@/lib/date-display";
import type { CycleSourceDateChange } from "@/lib/lease-renewal/cycle-source-date";
import type { LeaseTerm } from "@/lib/lease-renewal/lease-term-types";

/** R-S246-12: the exact label a lease carries when its RentVine status could not be read. */
export const RENTVINE_STATUS_UNAVAILABLE_LABEL = "RentVine status unavailable";

export type RentvineStatusUnavailableCause =
  | "status_table_unavailable"
  | "lease_status_missing"
  | "status_unresolved"
  | "primary_status_unreadable";

/** What RentVine reports for one lease, read from the status table. */
export type RentvineLeaseStatusFact =
  | { readonly state: "active" | "pending" | "closed"; readonly name: string }
  | {
      readonly state: "unavailable";
      readonly cause: RentvineStatusUnavailableCause;
      /** The status name when the row resolved but its primary status did not. */
      readonly name: string | null;
    };

export type RenewalNotTargetReason =
  | "rentvine_closed"
  | "rentvine_pending"
  | "owner_hold"
  | "program"
  | "move_out_initiated"
  | "staff_non_renewal"
  | "month_to_month"
  | "completed"
  | "renewed_in_rentvine"
  | "no_end_date";

export interface RenewalTargetInput {
  readonly status: RentvineLeaseStatusFact;
  /** S103: the one shared lease term. */
  readonly term: LeaseTerm;
  /** The lease end RentVine reports now. */
  readonly endDateIso: string | null;
  /** The existing cohort skip signal, when one applies. */
  readonly skipReason: "owner_authorized" | "program" | null;
  /** S124: the documented RentVine notice status says a move-out is initiated. */
  readonly moveOutInitiated: boolean;
  /** The staff record of the current work record, or null when none exists. */
  readonly staffRecord: {
    readonly complete: boolean;
    readonly nonRenewal: boolean;
  } | null;
  /** True only when the app-recorded completion is verified against the current evidence. */
  readonly appCompletionCurrent: boolean;
  /** S123: the recorded cycle date compared with the lease end RentVine reports now. */
  readonly cycleSourceDate: CycleSourceDateChange | null;
  /** S103: the month-to-month review due now, when the term projection names one. */
  readonly reviewDateIso?: string | null;
  /**
   * R-S246-5: staff chose to keep working the recorded cycle after RentVine reported a later
   * lease end, for exactly this recorded date and this RentVine date.
   */
  readonly keepWorking: boolean;
  /**
   * R-S246-5: the cycle and revision of the work record this projection read, so a confirmation
   * can name the exact version staff reviewed. Null or absent when no work record exists.
   */
  readonly workRecord?: { readonly cycleId: string; readonly revision: number } | null;
}

export type RenewalTargetProjection =
  | {
      readonly kind: "target";
      /** The date of the cycle being worked: the RentVine lease end, or the kept recorded date. */
      readonly cycleDateIso: string;
      /** `YYYY-MM` of `cycleDateIso`; the lease is a target for exactly this month. */
      readonly cycleMonth: string;
      readonly statusUnavailable: boolean;
      readonly keptWorking: boolean;
      /** The RentVine status name when it was read. */
      readonly statusName: string | null;
    }
  | {
      readonly kind: "not_target";
      readonly reason: RenewalNotTargetReason;
      /** The plain reason in words, as the desk counts it. */
      readonly label: string;
      readonly statusUnavailable: boolean;
      readonly statusName: string | null;
      /** R-S246-5: the recorded cycle date and the later lease end RentVine reports now. */
      readonly recordedDateIso?: string;
      readonly sourceDateIso?: string;
      /** R-S246-5: the work record version behind those dates, which a confirmation names. */
      readonly cycleId?: string;
      readonly revision?: number;
    };

const SKIP_LABEL = {
  owner_authorized: "Owner-authorized hold",
  program: "Program lease",
} as const;

/** True when RentVine reports a later lease end than the recorded cycle date. */
export function cycleRenewedInRentvine(
  cycle: CycleSourceDateChange | null | undefined,
): cycle is Extract<CycleSourceDateChange, { state: "changed" }> {
  return cycle?.state === "changed" && cycle.recordedIso < cycle.currentIso;
}

/**
 * The one target projection. Decision order (first wins):
 *   1. RentVine reports the lease closed or pending;
 *   2. an existing skip signal (owner hold, program);
 *   3. a completed non-renewal handoff for the current cycle;
 *   4. a move-out initiated in RentVine, or an open staff non-renewal decision;
 *   5. a completion recorded for the current cycle;
 *   6. a month-to-month term (it follows the annual review, never the monthly batch);
 *   7. a later RentVine lease end than the recorded cycle, until staff confirm or keep working;
 *   8. no end date to place the lease in a month;
 *   9. otherwise a renewal target for the month of its cycle date.
 * A completion (rules 3 and 5) belongs to an earlier cycle when RentVine now reports a later lease
 * end than the cycle it was recorded for, or when it was recorded for an earlier periodic review;
 * it then settles nothing for the cycle RentVine reports now. An earlier RentVine lease end is a
 * change to the same cycle, so a completion recorded for that cycle still stands.
 * An unavailable status never reaches rule 1, so it never excludes a lease.
 */
export function projectRenewalTarget(input: RenewalTargetInput): RenewalTargetProjection {
  const { status } = input;
  const statusUnavailable = status.state === "unavailable";
  const statusName = status.name;
  const not = (
    reason: RenewalNotTargetReason,
    label: string,
    extra: {
      recordedDateIso?: string;
      sourceDateIso?: string;
      cycleId?: string;
      revision?: number;
    } = {},
  ): RenewalTargetProjection => ({
    kind: "not_target",
    reason,
    label,
    statusUnavailable,
    statusName,
    ...extra,
  });

  if (status.state === "closed" || status.state === "pending")
    return not(
      status.state === "closed" ? "rentvine_closed" : "rentvine_pending",
      `RentVine reports ${status.name}`,
    );
  if (input.skipReason)
    return not(
      input.skipReason === "owner_authorized" ? "owner_hold" : "program",
      SKIP_LABEL[input.skipReason],
    );
  const staff = input.staffRecord;
  const renewedInRentvine = cycleRenewedInRentvine(input.cycleSourceDate);
  // A completion recorded for an earlier periodic review does not cover the review due now.
  const earlierReview =
    input.cycleSourceDate?.state === "review_basis" &&
    typeof input.reviewDateIso === "string" &&
    input.cycleSourceDate.recordedIso !== input.reviewDateIso;
  // The staff record's completion belongs to an earlier cycle: RentVine has since moved the lease
  // end past the cycle it was recorded for, or it closed an earlier periodic review.
  const completedEarlierCycle =
    staff?.complete === true && (renewedInRentvine || earlierReview);
  if (staff?.complete && staff.nonRenewal && !completedEarlierCycle)
    return not("completed", "Non-renewal handoff completed, recorded by staff");
  if (input.moveOutInitiated)
    return not("move_out_initiated", "Move-out notice in RentVine");
  if (staff?.nonRenewal && !staff.complete)
    return not("staff_non_renewal", "Non-renewal recorded by staff");
  if (staff?.complete && !completedEarlierCycle)
    return not("completed", "Renewal completed, recorded by staff");
  if (!staff && input.appCompletionCurrent)
    return not("completed", "Renewal completed, recorded in the app");
  if (input.term === "month_to_month") return not("month_to_month", "Month-to-month");

  const keptWorking = renewedInRentvine && input.keepWorking && !staff?.complete;
  if (renewedInRentvine && !staff?.complete && !keptWorking) {
    const cycle = input.cycleSourceDate as Extract<
      CycleSourceDateChange,
      { state: "changed" }
    >;
    return not(
      "renewed_in_rentvine",
      `Cycle recorded ${formatCalendarDate(cycle.recordedIso)}; RentVine now reports ${formatCalendarDate(cycle.currentIso)}`,
      {
        recordedDateIso: cycle.recordedIso,
        sourceDateIso: cycle.currentIso,
        ...(input.workRecord
          ? { cycleId: input.workRecord.cycleId, revision: input.workRecord.revision }
          : {}),
      },
    );
  }
  const cycleDateIso = keptWorking
    ? (input.cycleSourceDate as { recordedIso: string }).recordedIso
    : input.endDateIso;
  if (!cycleDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(cycleDateIso))
    return not("no_end_date", "No end date on file");
  return {
    kind: "target",
    cycleDateIso,
    cycleMonth: cycleDateIso.slice(0, 7),
    statusUnavailable,
    keptWorking,
    statusName,
  };
}

/**
 * R-S246-1: the verdict in one line for the lease page, so the page a lease opens on says the
 * same thing as the group the desk placed it in.
 */
export function renewalTargetLine(projection: RenewalTargetProjection): string {
  const unavailable = projection.statusUnavailable
    ? RENTVINE_STATUS_UNAVAILABLE_LABEL
    : null;
  if (projection.kind === "target")
    return [
      `Renewal target for ${formatCalendarMonth(projection.cycleMonth)}`,
      projection.keptWorking ? "staff kept working this cycle" : null,
      unavailable,
    ]
      .filter((part): part is string => part !== null)
      .join(" · ");
  const line =
    projection.reason === "renewed_in_rentvine"
      ? `Renewed in RentVine, confirm and close: ${projection.label}`
      : projection.reason === "month_to_month"
        ? "Month-to-month: follows the annual review"
        : `Outside the monthly renewal batch: ${projection.label}`;
  return unavailable ? `${line} · ${unavailable}` : line;
}

/** R-S246-1: whether the lease is a renewal target for one `YYYY-MM` month. */
export function isRenewalTargetForMonth(
  projection: RenewalTargetProjection | null | undefined,
  month: string,
): boolean {
  return projection?.kind === "target" && projection.cycleMonth === month;
}
