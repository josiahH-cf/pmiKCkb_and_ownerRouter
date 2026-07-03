// Operator-triggered renewal-notice reminders (S13 Wave 3 F4). Mirrors scripts/run-approval-queue-
// notifications.ts: an operator runs it to see which leases need a notice sent, are overdue, or need a
// follow-up. It NEVER sends and NEVER writes a system of record — it prints a deduped plan. There is
// no Cloud Scheduler; the operator triggers it. Until a live notice feed is wired, it plans over the
// in-boundary SAMPLE renewal batch (synthetic labels), so the output is deterministic and PII-free.
//
//   npm run notices:reminders -- [--date=YYYY-MM-DD] [--json]
//
// Default text output is counts + per-reminder leaseId/kind/due date (no labels); --json includes the
// full structured plan for an in-boundary UI. Stdout only; nothing is written to disk or any system.

import { pathToFileURL } from "node:url";

import { readNoticeRuleSet } from "../lib/firestore/lease-renewal-notice-rules";
import { DEFAULT_NOTICE_RULE_SET } from "../lib/lease-renewal/notice-rules";
import {
  planNoticeReminders,
  type NoticeReminderLeaseFacts,
  type NoticeReminderPlan,
} from "../lib/lease-renewal/notice-reminders";
import { getRenewalDeskView } from "../lib/lease-renewal/sample-desk";

export interface NoticeRemindersCliOptions {
  help: boolean;
  json: boolean;
  referenceDate: string;
  /** Read the seeded config record instead of the built-in defaults (needs ADC / Firestore). */
  live: boolean;
}

export function parseNoticeRemindersArgs(
  argv = process.argv.slice(2),
  defaultDate = today(),
): NoticeRemindersCliOptions {
  const options: NoticeRemindersCliOptions = {
    help: false,
    json: false,
    referenceDate: defaultDate,
    live: false,
  };
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--live") options.live = true;
    else if (arg === "--date")
      options.referenceDate = readRequiredValue(args.shift(), "--date");
    else if (arg.startsWith("--date="))
      options.referenceDate = readRequiredValue(arg.slice("--date=".length), "--date");
    else throw new Error(`Unknown argument: ${arg}`);
  }
  assertIsoDate(options.referenceDate);
  return options;
}

/** Map the in-boundary sample desk batch to reminder facts (synthetic; no letter-sent/response set). */
export function sampleReminderLeases(): NoticeReminderLeaseFacts[] {
  const view = getRenewalDeskView();
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

export async function main(argv = process.argv.slice(2)) {
  const options = parseNoticeRemindersArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const ruleSet = options.live ? await readNoticeRuleSet() : DEFAULT_NOTICE_RULE_SET;
  const plan = planNoticeReminders({
    leases: sampleReminderLeases(),
    ruleSet,
    referenceDateIso: options.referenceDate,
  });

  console.log(
    options.json ? JSON.stringify(plan, null, 2) : formatNoticeReminderPlan(plan),
  );
}

export function formatNoticeReminderPlan(plan: NoticeReminderPlan): string {
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
  return lines.join("\n");
}

function usage() {
  return [
    "Usage: npm run notices:reminders -- [--date=YYYY-MM-DD] [--json] [--live]",
    "",
    "Prints a deduped, operator-triggered reminder plan. No send, no write, no Scheduler.",
    "Plans over the in-boundary SAMPLE batch; --live reads the seeded notice-rule config (ADC).",
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
