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

// ---------------------------------------------------------------------------
// Call-task cadence (deferred-cycle bullet 3c). Turns the actionable reminders into operator "make a
// call task" items, suppressing a task when there is a recent contact on file. "Last contact" is an
// INTERNAL signal (the renewal-letter-sent date, or the notification log) — never a Gmail read. Pure
// and deterministic: reference date + last-contact map are inputs; no Date.now(), no I/O, no send.

/** Reminder kinds that escalate to a phone call (a due-soon nudge is "send the notice", not a call). */
const CALL_TASK_BASIS: readonly NoticeReminderKind[] = [
  "notice_overdue",
  "follow_up_due",
];

export interface CallTask {
  leaseId: string;
  label: string;
  kind: "make_call";
  /** The underlying reminder that escalated to a call. */
  basis: NoticeReminderKind;
  /** The most recent internal contact on file, or null when none is recorded. */
  lastContactIso: string | null;
  dueByIso: string;
  dedupeKey: string;
  message: string;
}

export interface CallTaskPlan {
  referenceDateIso: string;
  minDaysSinceContact: number;
  tasks: CallTask[];
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return (to - from) / (1000 * 60 * 60 * 24);
}

function callMessage(reminder: NoticeReminder, lastContactIso: string | null): string {
  const contact =
    lastContactIso === null
      ? "No recorded contact on file"
      : `Last recorded contact ${lastContactIso.slice(0, 10)}`;
  const why =
    reminder.kind === "notice_overdue" ? "notice is overdue" : "tenant follow-up is due";
  return `Make a call for ${reminder.label}. ${contact}; ${why} (due ${reminder.dueByIso}).`;
}

/**
 * Turn a batch of reminders into "make a call" tasks. A task is emitted for an escalating reminder
 * (overdue / follow-up-due) UNLESS a contact is on file within the cadence window (minDaysSinceContact).
 * Deduped by a stable key. Operator-triggered; no Cloud Scheduler, no send.
 */
export function planCallTasks(options: {
  reminders: readonly NoticeReminder[];
  lastContactByLease: Readonly<Record<string, string | null | undefined>>;
  referenceDateIso: string;
  minDaysSinceContact?: number;
}): CallTaskPlan {
  const minDays = options.minDaysSinceContact ?? 7;
  const seen = new Set<string>();
  const tasks: CallTask[] = [];

  for (const reminder of options.reminders) {
    if (!CALL_TASK_BASIS.includes(reminder.kind)) continue;
    const lastContactIso = options.lastContactByLease[reminder.leaseId] ?? null;
    // Suppress when we already have a recent contact on file (within the cadence window).
    if (
      lastContactIso !== null &&
      daysBetween(lastContactIso, options.referenceDateIso) < minDays
    ) {
      continue;
    }
    const dedupeKey = `${reminder.leaseId}:make_call:${reminder.dueByIso}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    tasks.push({
      leaseId: reminder.leaseId,
      label: reminder.label,
      kind: "make_call",
      basis: reminder.kind,
      lastContactIso,
      dueByIso: reminder.dueByIso,
      dedupeKey,
      message: callMessage(reminder, lastContactIso),
    });
  }

  return {
    referenceDateIso: options.referenceDateIso,
    minDaysSinceContact: minDays,
    tasks,
  };
}
