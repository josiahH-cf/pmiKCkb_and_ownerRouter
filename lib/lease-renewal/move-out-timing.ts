import type {
  MoveOutDisposition,
  MoveOutFreshness,
} from "@/lib/lease-renewal/move-out-disposition";

/**
 * S125 (F04): a pure, versioned thirty-day notice timing comparison over date-only facts and an
 * explicitly reviewed basis. It is an operational timing indicator for staff review: it never
 * decides law, fees, balances or deposits, never alters a source date, never sends or records
 * anything, and never turns an unknown date or an unreviewed basis into a yes or a no.
 *
 * The notice date and the candidate target dates come from the S124 move-out disposition (the
 * documented RentVine lease-detail fields) and the cohort classification's contractual lease end.
 * The basis (which target date, which counting rule, which threshold) is app-owned configuration
 * recorded by an Admin; until it is saved every initiated notice reads Cannot determine.
 */
export const MOVE_OUT_TIMING_TARGET_KINDS = ["expected_move_out", "lease_end"] as const;
export type MoveOutTimingTargetKind = (typeof MOVE_OUT_TIMING_TARGET_KINDS)[number];

export const MOVE_OUT_TIMING_TARGET_LABELS: Record<MoveOutTimingTargetKind, string> = {
  expected_move_out: "scheduled move-out date",
  lease_end: "contractual lease-end date",
};

/** Proposed technical default (calendar-date ordinals, target minus notice, 30 satisfies). */
export const MOVE_OUT_TIMING_COUNTING_RULES = [
  "calendar_days_target_minus_notice_v1",
] as const;
export type MoveOutTimingCountingRule = (typeof MOVE_OUT_TIMING_COUNTING_RULES)[number];

export const MOVE_OUT_TIMING_COUNTING_RULE_LABELS: Record<
  MoveOutTimingCountingRule,
  string
> = {
  calendar_days_target_minus_notice_v1:
    "Calendar days, target date minus notice date; exactly the threshold satisfies it",
};

export const MOVE_OUT_TIMING_THRESHOLD_DAYS_DEFAULT = 30;

export interface MoveOutTimingBasis {
  readonly targetKind: MoveOutTimingTargetKind;
  readonly countingRule: MoveOutTimingCountingRule;
  readonly thresholdDays: number;
}

/** Read provenance for the reviewed basis; only a saved record can produce a yes or a no. */
export interface MoveOutTimingBasisSnapshot {
  readonly state: "saved" | "missing" | "invalid" | "unreadable";
  readonly basis: MoveOutTimingBasis | null;
  readonly version: number | null;
  readonly updatedAtIso: string | null;
}

export const MISSING_MOVE_OUT_TIMING_BASIS: MoveOutTimingBasisSnapshot = {
  state: "missing",
  basis: null,
  version: null,
  updatedAtIso: null,
};

export const MOVE_OUT_TIMING_STATES = [
  "meets",
  "below",
  "cannot_determine",
  "not_applicable",
] as const;
export type MoveOutTimingState = (typeof MOVE_OUT_TIMING_STATES)[number];

export type MoveOutTimingReason =
  | "meets_threshold"
  | "below_threshold"
  | "no_notice"
  | "notice_withdrawn"
  | "disposition_unknown"
  | "basis_not_reviewed"
  | "basis_unreadable"
  | "source_stale"
  | "notice_date_missing"
  | "target_date_missing"
  | "invalid_date"
  | "notice_after_observed"
  | "target_before_notice";

export interface MoveOutTimingResult {
  readonly state: MoveOutTimingState;
  readonly reason: MoveOutTimingReason;
  /** Short visible result; never a legal, fee or compliance claim. */
  readonly label: string;
  /** One or two sentences naming the dates, the basis and why review is needed. */
  readonly explanation: string;
  readonly noticeDateIso: string | null;
  readonly targetDateIso: string | null;
  readonly targetKind: MoveOutTimingTargetKind | null;
  readonly targetLabel: string | null;
  readonly daysGiven: number | null;
  readonly thresholdDays: number | null;
  readonly countingRule: MoveOutTimingCountingRule | null;
  /** The saved basis version the comparison used; null when no yes or no was possible. */
  readonly basisVersion: number | null;
  readonly sourceFreshness: MoveOutFreshness;
  readonly evaluatedOnIso: string;
}

export interface MoveOutTimingInput {
  readonly disposition: MoveOutDisposition;
  /** The contractual lease end from the same generation, when known. */
  readonly leaseEndIso: string | null;
  readonly basis: MoveOutTimingBasisSnapshot;
  /** The business date of the read (YYYY-MM-DD); a notice recorded after it is not evidence. */
  readonly observedDateIso: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar-day ordinal of a strict YYYY-MM-DD date, or null when the date is not real. */
export function calendarDayOrdinal(iso: string | null | undefined): number | null {
  if (typeof iso !== "string") return null;
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = Date.UTC(year, month - 1, day);
  const probe = new Date(utc);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(utc / 86_400_000);
}

/**
 * The explicit counting rule: calendar-date ordinals, target minus notice. Time of day, time zone,
 * daylight-saving changes, weekends and holidays never enter it.
 */
export function countCalendarDays(
  rule: MoveOutTimingCountingRule,
  noticeDateIso: string,
  targetDateIso: string,
): number | null {
  if (rule !== "calendar_days_target_minus_notice_v1") return null;
  const notice = calendarDayOrdinal(noticeDateIso);
  const target = calendarDayOrdinal(targetDateIso);
  if (notice === null || target === null) return null;
  return target - notice;
}

const DISCLAIMER =
  "This is an operational timing comparison for staff review, not a legal, fee or compliance determination.";

function result(
  input: MoveOutTimingInput,
  fields: Pick<MoveOutTimingResult, "state" | "reason" | "label" | "explanation"> &
    Partial<MoveOutTimingResult>,
): MoveOutTimingResult {
  return {
    noticeDateIso: input.disposition.evidence.noticeDateIso,
    targetDateIso: null,
    targetKind: null,
    targetLabel: null,
    daysGiven: null,
    thresholdDays: null,
    countingRule: null,
    basisVersion: null,
    sourceFreshness: input.disposition.freshness,
    evaluatedOnIso: input.observedDateIso,
    ...fields,
  };
}

export function evaluateMoveOutTiming(input: MoveOutTimingInput): MoveOutTimingResult {
  const { disposition, basis } = input;
  const cannot = (
    reason: MoveOutTimingReason,
    explanation: string,
    extra: Partial<MoveOutTimingResult> = {},
  ) =>
    result(input, {
      state: "cannot_determine",
      reason,
      label: "Cannot determine",
      explanation: `${explanation} ${DISCLAIMER}`,
      ...extra,
    });

  if (disposition.state === "not_initiated")
    return result(input, {
      state: "not_applicable",
      reason: "no_notice",
      label: "Not applicable",
      explanation: `No move-out notice is recorded in RentVine for this lease, so there is no notice timing to compare. ${DISCLAIMER}`,
    });
  if (disposition.state === "withdrawn")
    return result(input, {
      state: "not_applicable",
      reason: "notice_withdrawn",
      label: "Not applicable",
      explanation: `${disposition.label} There is no current notice to compare. ${DISCLAIMER}`,
    });
  if (disposition.state === "unknown")
    return cannot(
      "disposition_unknown",
      `${disposition.label} The notice timing cannot be compared until the notice itself is established.`,
    );

  if (basis.state === "missing")
    return cannot(
      "basis_not_reviewed",
      "The timing basis (which target date and which counting rule apply) has not been reviewed and saved, so this notice has no yes or no yet. An Admin records the reviewed basis on the Admin page.",
    );
  if (basis.state !== "saved" || !basis.basis)
    return cannot(
      "basis_unreadable",
      "The saved timing basis could not be read or was not valid, so this notice has no yes or no right now.",
    );

  const { targetKind, countingRule, thresholdDays } = basis.basis;
  const targetLabel = MOVE_OUT_TIMING_TARGET_LABELS[targetKind];
  const basisFields: Partial<MoveOutTimingResult> = {
    targetKind,
    targetLabel,
    thresholdDays,
    countingRule,
    basisVersion: basis.version,
  };

  if (disposition.freshness === "expired" || disposition.freshness === "unavailable")
    return cannot(
      "source_stale",
      "The lease data behind this notice is too old to act on. Refresh before relying on a timing result.",
      basisFields,
    );

  const noticeDateIso = disposition.evidence.noticeDateIso;
  if (!noticeDateIso)
    return cannot(
      "notice_date_missing",
      `RentVine reports a move-out notice but no notice-given date, so the ${targetLabel} cannot be compared against it.`,
      basisFields,
    );
  const targetDateIso =
    targetKind === "expected_move_out"
      ? disposition.evidence.expectedMoveOutIso
      : input.leaseEndIso;
  if (!targetDateIso)
    return cannot(
      "target_date_missing",
      `The reviewed basis compares notice against the ${targetLabel}, and that date is not recorded for this lease. The other date is never substituted for it.`,
      { ...basisFields, noticeDateIso },
    );

  const noticeOrdinal = calendarDayOrdinal(noticeDateIso);
  const targetOrdinal = calendarDayOrdinal(targetDateIso);
  if (noticeOrdinal === null || targetOrdinal === null)
    return cannot(
      "invalid_date",
      `A source date is not a real calendar date (notice ${noticeDateIso}, ${targetLabel} ${targetDateIso}). Review the RentVine record; the value is invalid evidence, not a timing result.`,
      { ...basisFields, noticeDateIso, targetDateIso },
    );
  const observedOrdinal = calendarDayOrdinal(input.observedDateIso);
  if (observedOrdinal !== null && noticeOrdinal > observedOrdinal)
    return cannot(
      "notice_after_observed",
      `The notice-given date ${noticeDateIso} is after the date of this read (${input.observedDateIso}), so it cannot be treated as notice already given. Review the RentVine record.`,
      { ...basisFields, noticeDateIso, targetDateIso },
    );
  if (targetOrdinal < noticeOrdinal)
    return cannot(
      "target_before_notice",
      `The ${targetLabel} ${targetDateIso} is before the notice-given date ${noticeDateIso}, which contradicts the notice. Review both dates in RentVine.`,
      { ...basisFields, noticeDateIso, targetDateIso },
    );

  const daysGiven = countCalendarDays(countingRule, noticeDateIso, targetDateIso);
  if (daysGiven === null)
    return cannot("invalid_date", "The dates could not be counted.", {
      ...basisFields,
      noticeDateIso,
      targetDateIso,
    });
  const dates = `Notice given ${noticeDateIso}; ${targetLabel} ${targetDateIso}; ${daysGiven} calendar ${daysGiven === 1 ? "day" : "days"} given against the reviewed ${thresholdDays}-day basis (version ${basis.version ?? "unknown"}).`;
  if (daysGiven >= thresholdDays)
    return result(input, {
      state: "meets",
      reason: "meets_threshold",
      label: `Meets configured ${thresholdDays}-day timing`,
      explanation: `${dates} ${DISCLAIMER}`,
      ...basisFields,
      noticeDateIso,
      targetDateIso,
      daysGiven,
    });
  return result(input, {
    state: "below",
    reason: "below_threshold",
    label: `Below configured ${thresholdDays}-day timing: staff review`,
    explanation: `${dates} Review the recorded dates with the lease's source record and the non-renewal handoff; nothing here calculates fees, balances or legal standing. ${DISCLAIMER}`,
    ...basisFields,
    noticeDateIso,
    targetDateIso,
    daysGiven,
  });
}

export const MOVE_OUT_TIMING_DESK_FILTERS = ["all", ...MOVE_OUT_TIMING_STATES] as const;
export type MoveOutTimingDeskFilter = (typeof MOVE_OUT_TIMING_DESK_FILTERS)[number];

export const MOVE_OUT_TIMING_CONTROL_LABEL = "Notice timing";

export const MOVE_OUT_TIMING_STATE_LABELS: Record<MoveOutTimingState, string> = {
  meets: "Meets configured timing",
  below: "Below configured timing: staff review",
  cannot_determine: "Cannot determine",
  not_applicable: "Not applicable",
};

export function moveOutTimingFilterLabel(filter: MoveOutTimingDeskFilter): string {
  return filter === "all"
    ? "All notice timing states"
    : MOVE_OUT_TIMING_STATE_LABELS[filter];
}

/** An absent key means the comparison was not evaluated; it filters as Cannot determine, never as compliant. */
export function matchesMoveOutTimingFilter(
  filter: MoveOutTimingDeskFilter,
  key: MoveOutTimingState | undefined,
): boolean {
  if (filter === "all") return true;
  return (key ?? "cannot_determine") === filter;
}
