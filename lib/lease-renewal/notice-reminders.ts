// Operator-triggered renewal-notice reminders (S13 Wave 3 F4). Pure planner that turns a batch of
// per-lease facts + the notice rule set + a reference date into a deduped list of reminders an
// operator can act on: "notice due soon", "notice overdue", and "follow-up due". Mirrors the existing
// queue-notifications pattern (operator-triggered, dry-run by default at the CLI) — NO Cloud
// Scheduler, NO email delivery, NO send. The reminder is a console/queue nudge; a human still acts.
//
// Pure and deterministic: reference date and the lease facts are all inputs; no Date.now(), no I/O.

import {
  detectNoticeStatus,
  resolveNoticeRule,
  type NoticeRuleSet,
  type NoticeStatusCode,
} from "@/lib/lease-renewal/notice-rules";

/** The per-lease facts the reminder planner needs (in-boundary; labels are never committed). */
export interface NoticeReminderLeaseFacts {
  leaseId: string;
  /** Property key for per-property rule resolution, if known. */
  propertyKey?: string | null;
  /** Human label for the reminder message (in-boundary only). */
  label: string;
  leaseEndDateIso: string | null;
  renewalLetterSentIso: string | null;
  tenantResponded: boolean;
}

/** The reminder kinds an operator acts on. A subset of the status codes (the actionable ones). */
export type NoticeReminderKind = Extract<
  NoticeStatusCode,
  "notice_due_soon" | "notice_overdue" | "follow_up_due"
>;

const ACTIONABLE: Record<NoticeStatusCode, NoticeReminderKind | null> = {
  disabled: null,
  no_lease_end: null,
  notice_scheduled: null,
  notice_due_soon: "notice_due_soon",
  notice_overdue: "notice_overdue",
  awaiting_response: null,
  follow_up_due: "follow_up_due",
  responded: null,
};

export interface NoticeReminder {
  leaseId: string;
  label: string;
  kind: NoticeReminderKind;
  /** The relevant date: the notice deadline, or the follow-up due date. */
  dueByIso: string;
  /** Stable key so the same lease/kind/date reminder is idempotent across runs (dedupe/suppress). */
  dedupeKey: string;
  message: string;
}

export interface NoticeReminderPlan {
  referenceDateIso: string;
  reminders: NoticeReminder[];
  summary: Record<NoticeReminderKind, number>;
}

function messageFor(kind: NoticeReminderKind, label: string, dueByIso: string): string {
  switch (kind) {
    case "notice_due_soon":
      return `Notice due soon for ${label}. Send the renewal notice by ${dueByIso}.`;
    case "notice_overdue":
      return `Notice overdue for ${label}. It was due ${dueByIso}; send it now.`;
    case "follow_up_due":
      return `Follow-up due for ${label}. No tenant response; follow up (due ${dueByIso}).`;
  }
}

/**
 * Plan the notice reminders for a batch of leases. One reminder per lease at most (its current
 * status), only for the actionable statuses, deduped by a stable key. Operator-triggered by design.
 */
export function planNoticeReminders(options: {
  leases: readonly NoticeReminderLeaseFacts[];
  ruleSet: NoticeRuleSet;
  referenceDateIso: string;
}): NoticeReminderPlan {
  const seen = new Set<string>();
  const reminders: NoticeReminder[] = [];
  const summary: Record<NoticeReminderKind, number> = {
    notice_due_soon: 0,
    notice_overdue: 0,
    follow_up_due: 0,
  };

  for (const lease of options.leases) {
    const resolved = resolveNoticeRule(options.ruleSet, {
      leaseId: lease.leaseId,
      propertyKey: lease.propertyKey,
    });
    const status = detectNoticeStatus(
      resolved,
      {
        leaseEndDateIso: lease.leaseEndDateIso,
        renewalLetterSentIso: lease.renewalLetterSentIso,
        tenantResponded: lease.tenantResponded,
      },
      options.referenceDateIso,
    );

    const kind = ACTIONABLE[status.code];
    if (!kind) continue;

    const dueByIso =
      kind === "follow_up_due"
        ? (status.followUpDueByIso ?? options.referenceDateIso)
        : (status.schedule?.noticeDueByIso ?? options.referenceDateIso);
    const dedupeKey = `${lease.leaseId}:${kind}:${dueByIso}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    reminders.push({
      leaseId: lease.leaseId,
      label: lease.label,
      kind,
      dueByIso,
      dedupeKey,
      message: messageFor(kind, lease.label, dueByIso),
    });
    summary[kind] += 1;
  }

  return { referenceDateIso: options.referenceDateIso, reminders, summary };
}
