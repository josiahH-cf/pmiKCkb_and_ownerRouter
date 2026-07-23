// S39 B2 — the support (feedback) attention lane. A value-free, Admin-scoped gather over the app's OWN
// `support_reports` queue (F-SUPP-1), mirroring lib/attention/review-lane.ts + standing-signals.ts. It
// returns at most two signals — "N new feedback filed" and "M follow-up due" — carrying counts + lane +
// a deep link to the /admin feedback panel ONLY. Never a description, element hint, route value, reporter
// identity, or any per-report value (the AttentionSignal contract enforces the six-key set).
//
// This ONE gather feeds BOTH the /notifications hub AND the /admin SupportReportsPanel badge, so their
// numbers cannot diverge (extends the S17 single-gather interlock). Follow-up-due is computed ON READ from
// status + age; no new Firestore index, no new collection. Makes ZERO external calls (reads only
// `support_reports`). Non-fatal: any read failure degrades to empty, never a thrown error.

import type { Firestore } from "firebase-admin/firestore";

import { toAttentionSignal, type AttentionSignal } from "@/lib/attention/lanes";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { listSupportReports } from "@/lib/firestore/support-reports";
import type { SupportReportRecord } from "@/lib/firestore/types";

/** The support surface: the Admin-gated feedback queue. Deep-linked, never a per-report value. */
const SUPPORT_HREF = "/admin";

// Follow-up window (Q-SUPP-FOLLOWUP). Owner-tunable defaults: a report still `new` after 1 day, or
// `acknowledged` (not resolved) after 3 days, is past its follow-up window. Computed on read from age.
export const SUPPORT_NEW_FOLLOWUP_DAYS = 1;
export const SUPPORT_ACK_FOLLOWUP_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Read count for the count-bearing gather (feedback is low-volume; the panel list is trimmed separately). */
const SUPPORT_SCAN_LIMIT = 200;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Whether a report is past its follow-up window at `nowIso`. Pure + deterministic (age from created_at).
 * `resolved` reports are never due; a non-parseable timestamp is treated as not-due (never a false alarm).
 */
export function isSupportFollowUpDue(
  report: Pick<SupportReportRecord, "status" | "created_at">,
  nowIso: string,
): boolean {
  if (report.status === "resolved") return false;
  const created = Date.parse(report.created_at);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(created) || !Number.isFinite(now)) return false;
  const ageDays = (now - created) / DAY_MS;
  if (report.status === "new") return ageDays > SUPPORT_NEW_FOLLOWUP_DAYS;
  if (report.status === "acknowledged") return ageDays > SUPPORT_ACK_FOLLOWUP_DAYS;
  return false;
}

/** The count of newly-filed (`new`) reports and the count past their follow-up window. */
export function countSupportAttention(
  reports: readonly Pick<SupportReportRecord, "status" | "created_at">[],
  nowIso: string,
): { newCount: number; followUpDueCount: number } {
  return {
    newCount: reports.filter((report) => report.status === "new").length,
    followUpDueCount: reports.filter((report) => isSupportFollowUpDue(report, nowIso))
      .length,
  };
}

/**
 * Build the value-free support signals from already-fetched reports. Returns 0, 1, or 2 signals — a "new
 * feedback" signal only when some report is `new`, and a "follow-up due" signal only when some report is
 * past its window. Counts + lane + `/admin` deep link only; never a per-report value.
 */
export function buildSupportSignals(
  reports: readonly Pick<SupportReportRecord, "status" | "created_at">[],
  nowIso: string,
): AttentionSignal[] {
  const { newCount, followUpDueCount } = countSupportAttention(reports, nowIso);
  const signals: AttentionSignal[] = [];
  if (newCount > 0) {
    signals.push(
      toAttentionSignal({
        lane: "support",
        severity: "low",
        label: "New feedback",
        detail: `${plural(newCount, "new report")} filed`,
        href: SUPPORT_HREF,
        signalKey: "support:new",
      }),
    );
  }
  if (followUpDueCount > 0) {
    signals.push(
      toAttentionSignal({
        lane: "support",
        severity: "medium",
        label: "Feedback follow-up",
        detail: `${plural(followUpDueCount, "report")} past the follow-up window`,
        href: SUPPORT_HREF,
        signalKey: "support:follow_up_due",
      }),
    );
  }
  return signals;
}

export interface SupportAttention {
  signals: AttentionSignal[];
  newCount: number;
  followUpDueCount: number;
}

const EMPTY_SUPPORT_ATTENTION: SupportAttention = {
  signals: [],
  newCount: 0,
  followUpDueCount: 0,
};

/**
 * Admin-scoped single gather: read the app's OWN `support_reports` and return the value-free signals plus
 * the raw counts, both derived from the SAME reads so the hub and the /admin panel are one number. Reads
 * nothing else and never throws — a failure degrades to the empty attention. `listSupportReports` asserts
 * Admin, so a non-Admin caller degrades to empty here too (the hub/panel gate the call on Admin anyway).
 */
export async function gatherSupportAttention(
  user: AuthenticatedUser,
  options: { now?: string; db?: Firestore } = {},
): Promise<SupportAttention> {
  const nowIso = options.now ?? new Date().toISOString();
  try {
    const reports = await listSupportReports(
      user,
      { limit: SUPPORT_SCAN_LIMIT },
      options.db,
    );
    const { newCount, followUpDueCount } = countSupportAttention(reports, nowIso);
    return { signals: buildSupportSignals(reports, nowIso), newCount, followUpDueCount };
  } catch {
    return { ...EMPTY_SUPPORT_ATTENTION, signals: [] };
  }
}
