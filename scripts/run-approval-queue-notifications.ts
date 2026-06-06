import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  runScheduledApprovalQueueNotifications,
  type ScheduledApprovalQueueNotificationResult,
} from "../lib/firestore/approval-queue-scheduled-notifications";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export interface QueueNotificationsCliOptions {
  help: boolean;
  json: boolean;
  referenceDate: string;
  write: boolean;
}

export function parseQueueNotificationsArgs(
  argv = process.argv.slice(2),
  defaultDate = today(),
): QueueNotificationsCliOptions {
  const args = [...argv];
  const options: QueueNotificationsCliOptions = {
    help: false,
    json: false,
    referenceDate: defaultDate,
    write: false,
  };
  let dryRun = false;

  while (args.length > 0) {
    const arg = args.shift()!;

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--write") {
      options.write = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--date") {
      options.referenceDate = readRequiredValue(args.shift(), "--date");
    } else if (arg.startsWith("--date=")) {
      options.referenceDate = readRequiredValue(arg.slice("--date=".length), "--date");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (dryRun && options.write) {
    throw new Error("Use either --dry-run or --write, not both.");
  }

  assertIsoDate(options.referenceDate);
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseQueueNotificationsArgs(argv);

  if (options.help) {
    console.log(usage());
    return;
  }

  loadLocalEnv();

  const result = await runScheduledApprovalQueueNotifications({
    referenceDate: options.referenceDate,
    write: options.write,
  });

  console.log(
    options.json
      ? JSON.stringify(result, null, 2)
      : formatScheduledApprovalQueueNotificationResult(result),
  );
}

export function formatScheduledApprovalQueueNotificationResult(
  result: ScheduledApprovalQueueNotificationResult,
) {
  const lines = [
    `Approval Queue scheduled notifications (${result.mode})`,
    `Reference date: ${result.reference_date}`,
    [
      `Eligible unsnoozed: ${result.summary.eligible_unsnoozed_count}`,
      `eligible overdue: ${result.summary.eligible_overdue_count}`,
      `planned: ${result.summary.planned_count}`,
      `written: ${result.summary.written_count}`,
      `skipped: ${result.summary.skipped_count}`,
      `notifications planned: ${result.summary.notifications_planned_count}`,
      `notifications written: ${result.summary.notifications_written_count}`,
    ].join("; "),
  ];

  for (const item of result.results) {
    lines.push(
      [
        `- ${item.outcome}`,
        item.event,
        item.item_id,
        `recipients=${item.recipient_count}`,
        item.new_status ? `new_status="${item.new_status}"` : null,
        `notifications_written=${item.notifications_written}`,
        `notifications_planned=${item.notifications_planned}`,
        `message="${item.message}"`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  return lines.join("\n");
}

function usage() {
  return [
    "Usage: npm run queue:notifications -- [--dry-run|--write] [--date=YYYY-MM-DD] [--json]",
    "",
    "Default mode is dry-run. Use --write only after the target Firestore environment is approved.",
  ].join("\n");
}

function loadLocalEnv() {
  for (const [key, value] of Object.entries(readLocalEnv())) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readLocalEnv() {
  try {
    return Object.fromEntries(
      readFileSync(join(root, ".env.local"), "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const separator = line.indexOf("=");

          if (separator === -1) {
            return null;
          }

          const key = line.slice(0, separator).trim();
          const value = line
            .slice(separator + 1)
            .trim()
            .replace(/^"|"$/g, "");
          return [key, value];
        })
        .filter(isEnvEntry),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

function isEnvEntry(entry: string[] | null): entry is [string, string] {
  return Array.isArray(entry) && entry.length === 2;
}

function readRequiredValue(value: string | undefined, name: string) {
  if (!value?.trim()) {
    throw new Error(`${name} requires a value.`);
  }

  return value.trim();
}

function assertIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Scheduled queue notification date must be YYYY-MM-DD.");
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
