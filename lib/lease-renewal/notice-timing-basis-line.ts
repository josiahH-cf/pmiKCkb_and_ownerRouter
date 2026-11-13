// S283 R-S283-5: the shared notice timing basis as one read-only line on a lease. Every role reads
// it; an Admin also gets "Change in Admin", which opens the existing Admin entry. The line is a
// read projection of the saved version: it never changes the saved basis, its version or its
// history. Pure and client-safe.

import { formatBusinessDate } from "@/lib/date-display";

/** The existing Admin entry for the basis, in Renewal notice rules. */
export const NOTICE_TIMING_BASIS_ADMIN_HREF =
  "/admin?task=renewal#admin-move-out-timing-basis";
export const NOTICE_TIMING_BASIS_CHANGE_LABEL = "Change in Admin";
export const NOTICE_TIMING_BASIS_NOT_SET =
  "Notice timing basis: not set. An Admin sets it in Renewal notice rules.";
export const NOTICE_TIMING_BASIS_INVALID =
  "Notice timing basis: the saved basis is not one this app can use. An Admin reviews it in Renewal notice rules.";
export const NOTICE_TIMING_BASIS_UNREADABLE =
  "Notice timing basis: could not be read just now. Reload the lease to read it again.";

/** The fields of a basis read the line uses. */
export interface NoticeTimingBasisLineRead {
  readonly state: "saved" | "missing" | "invalid" | "unreadable";
  readonly record: {
    readonly target_kind: string;
    readonly counting_rule: string;
    readonly threshold_days: number;
    readonly updated_at: string;
  } | null;
}

const TARGETS: Readonly<Record<string, string>> = {
  lease_end: "the lease end date",
  expected_move_out: "the expected move-out date",
};

const COUNTING: Readonly<Record<string, string>> = {
  calendar_days_target_minus_notice_v1: "in calendar days",
};

/**
 * "Notice timing: counted from the lease end date, in calendar days, 30 days. Applies to every
 * renewal. Set on 11/03/2026." With no basis saved it says so and who sets it.
 */
export function noticeTimingBasisLine(read: NoticeTimingBasisLineRead): string {
  if (read.state === "missing") return NOTICE_TIMING_BASIS_NOT_SET;
  if (read.state === "unreadable") return NOTICE_TIMING_BASIS_UNREADABLE;
  const record = read.record;
  if (read.state !== "saved" || !record) return NOTICE_TIMING_BASIS_INVALID;
  const target = TARGETS[record.target_kind];
  const counting = COUNTING[record.counting_rule];
  if (!target || !counting || !Number.isSafeInteger(record.threshold_days))
    return NOTICE_TIMING_BASIS_INVALID;
  const days = `${record.threshold_days} ${record.threshold_days === 1 ? "day" : "days"}`;
  return `Notice timing: counted from ${target}, ${counting}, ${days}. Applies to every renewal. Set on ${formatBusinessDate(record.updated_at, "an unrecorded date")}.`;
}
