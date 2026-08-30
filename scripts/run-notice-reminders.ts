// Operator-triggered renewal-notice reminders (S13 Wave 3 F4). Mirrors scripts/run-approval-queue-
// notifications.ts: an operator runs it to see which leases need a notice sent, are overdue, or need a
// follow-up. It NEVER sends and NEVER writes a system of record — it prints a deduped plan. There is
// no Cloud Scheduler; the operator triggers it. It reads the authenticated Live Renewal Desk and
// fails closed when those sources are unavailable; invented leases are never substituted.
//
//   npm run notices:reminders -- [--date=YYYY-MM-DD] [--json]
//
// Default text output is counts + per-reminder leaseId/kind/due date (no labels); --json includes the
// full structured plan for an in-boundary UI. Stdout only; nothing is written to disk or any system.

import { pathToFileURL } from "node:url";

import { readNoticeRuleSet } from "../lib/firestore/lease-renewal-notice-rules";
import {
  planNoticeReminders,
  type CallTaskPlan,
  type NoticeReminderLeaseFacts,
  type NoticeReminderPlan,
} from "../lib/lease-renewal/notice-reminders";
import type { RenewalDeskView } from "../lib/lease-renewal/desk-model";
import {
  loadLiveRenewalDesk,
  type LiveRenewalDeskResult,
} from "../lib/lease-renewal/live-desk";

export interface NoticeRemindersCliOptions {
  help: boolean;
  json: boolean;
  referenceDate: string;
}

export function parseNoticeRemindersArgs(
  argv = process.argv.slice(2),
  defaultDate = today(),
): NoticeRemindersCliOptions {
  const options: NoticeRemindersCliOptions = {
    help: false,
    json: false,
    referenceDate: defaultDate,
  };
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--date")
      options.referenceDate = readRequiredValue(args.shift(), "--date");
    else if (arg.startsWith("--date="))
      options.referenceDate = readRequiredValue(arg.slice("--date=".length), "--date");
    else throw new Error(`Unknown argument: ${arg}`);
  }
  assertIsoDate(options.referenceDate);
  return options;
}

/** Map an already-authorized Live desk read to reminder facts. Pure; performs no send or write. */
export function reminderLeasesFromDesk(
  view: RenewalDeskView,
): NoticeReminderLeaseFacts[] {
  return [...view.actionable, ...view.review, ...view.outOfWindow]
    .filter((summary) => summary.endDateIso !== null)
    .map((summary) => ({
      leaseId: summary.id,
      label: summary.addressLabel,
      leaseEndDateIso: summary.endDateIso,
      renewalLetterSentIso: null,
      tenantResponded: false,
    }));
}

type LiveDeskLoader = (
  windows: { startIso: string; endIso: string }[],
  readTimestamp: string,
) => Promise<LiveRenewalDeskResult>;

/** Read the Live lease facts or refuse. No fixture/default branch exists. */
export async function loadLiveReminderLeases(
  referenceDateIso: string,
  loader: LiveDeskLoader = loadLiveRenewalDesk,
): Promise<NoticeReminderLeaseFacts[]> {
  const outcome = await loader(
    [{ startIso: referenceDateIso, endIso: addDaysIso(referenceDateIso, 120) }],
    `${referenceDateIso}T00:00:00.000Z`,
  );
  if (outcome.status !== "ok") {
    throw new Error(`Live renewal reminder data is unavailable (${outcome.status}).`);
  }
  return reminderLeasesFromDesk(outcome.view);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseNoticeRemindersArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const [leases, ruleSet] = await Promise.all([
    loadLiveReminderLeases(options.referenceDate),
    readNoticeRuleSet(),
  ]);
  const plan = planNoticeReminders({
    leases,
    ruleSet,
    referenceDateIso: options.referenceDate,
  });
  console.log(
    options.json ? JSON.stringify({ plan }, null, 2) : formatNoticeReminderPlan(plan),
  );
}

export function formatNoticeReminderPlan(
  plan: NoticeReminderPlan,
  callPlan?: CallTaskPlan,
): string {
  const lines = [
    `Renewal-notice reminders (operator-triggered; no send, no write)`,
    `Reference date: ${plan.referenceDateIso}`,
    [
      `due soon: ${plan.summary.notice_due_soon}`,
      `overdue: ${plan.summary.notice_overdue}`,
      `follow-up due: ${plan.summary.follow_up_due}`,
      `total: ${plan.reminders.length}`,
    ].join("; "),
  ];
  for (const reminder of plan.reminders) {
    lines.push(`- ${reminder.kind} ${reminder.leaseId} due=${reminder.dueByIso}`);
  }
  if (callPlan) {
    lines.push("");
    lines.push(
      `Call tasks (no send, no scheduler; last-contact from internal records): ${callPlan.tasks.length}`,
    );
    for (const task of callPlan.tasks) {
      lines.push(
        `- make_call ${task.leaseId} basis=${task.basis} last_contact=${task.lastContactIso ?? "none"} due=${task.dueByIso}`,
      );
    }
  }
  return lines.join("\n");
}

function usage() {
  return [
    "Usage: npm run notices:reminders -- [--date=YYYY-MM-DD] [--json]",
    "",
    "Prints a deduped, operator-triggered reminder plan. No send, no write, no Scheduler.",
    "Reads Live renewal facts and the seeded notice-rule config (ADC); no fixture fallback.",
  ].join("\n");
}

function readRequiredValue(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`${name} requires a value.`);
  return value.trim();
}

function assertIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Notice reminder date must be YYYY-MM-DD.");
  }
}

function addDaysIso(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
