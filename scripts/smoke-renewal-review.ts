// Calibration review-runner: run the full live review (real Lease Renewal tab + live RentVine export)
// and print a COUNTS-ONLY breakdown — flags by severity, by field, by agreement type, and by blocked
// reason. No cell values, no PII: every line is a count or a schema label. This is the calibration
// signal (it shows WHY flags fire, e.g. "missing" vs "conflict") so the team can tune the rules with
// Dan toward the Phase-1 accuracy milestone. The per-flag review WITH values stays inside the
// authenticated app (/lease-renewal/runs), never a CLI.
//
//   npm run smoke:renewal-review            # dry: prints what it would run
//   npm run smoke:renewal-review -- --live  # one RentVine read + one Sheet read; counts-only summary

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RentVineClient,
  assertRentVineAccount,
  createFetchTransport,
  rentVineAccountCode,
} from "../lib/integrations/rentvine/client";
import { GoogleSheetsApiReader } from "../lib/google-sheets/read-client";
import { runFullyLiveRenewalReview } from "../lib/lease-renewal/live-run";

const EXPECTED_ACCOUNT = "pmikcmetro";
const root = dirname(dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      out[t.slice(0, i).trim()] = t
        .slice(i + 1)
        .trim()
        .replace(/^"|"$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

function readArg(name: string): string | undefined {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : undefined;
}
function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function tally<T extends string>(items: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[item] = (out[item] ?? 0) + 1;
  return out;
}

async function main(): Promise<void> {
  const env = loadEnvLocal();
  const get = (name: string): string | undefined => process.env[name] ?? env[name];

  const baseUrl = get("RENTVINE_API_BASE_URL");
  const apiKey = get("RENTVINE_API_KEY");
  const apiSecret = get("RENTVINE_API_SECRET");
  const spreadsheetId = get("RENEWAL_SHEET_ID");
  const live = hasArg("--live");
  const tabs = (readArg("--tabs") ?? "Lease Renewal")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const artifactDir = resolve(readArg("--artifacts") ?? "temp/renewal-review");

  if (!baseUrl || !apiKey || !apiSecret || !spreadsheetId) {
    console.error(
      "Missing config. Need RENTVINE_API_BASE_URL/KEY/SECRET and RENEWAL_SHEET_ID in .env.local.",
    );
    process.exitCode = 1;
    return;
  }
  try {
    assertRentVineAccount(baseUrl, EXPECTED_ACCOUNT);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  if (!live) {
    console.log(
      `Renewal review (DRY). Would read RentVine /leases/export (account ${rentVineAccountCode(baseUrl)}) + sheet tab(s) [${tabs.join(", ")}] and run the pipeline. Pass --live (free, read-only).`,
    );
    return;
  }

  const rentvineClient = new RentVineClient(
    { baseUrl, apiKey, apiSecret },
    createFetchTransport(),
  );
  const sheetsReader = new GoogleSheetsApiReader(
    get("SHEETS_IMPERSONATE_SA"),
    get("SHEETS_DWD_SUBJECT"),
  );

  const { run, sheetTabsRead, liveRentvineCandidates, skippedLeases } =
    await runFullyLiveRenewalReview({
      rentvineClient,
      sheetsReader,
      spreadsheetId,
      tabTitles: tabs,
      runId: "calibration-review",
      readTimestamp: new Date().toISOString(),
    });

  const flags = run.flags;
  const summary = {
    production_allowed: run.production_allowed,
    sheetTabsRead,
    liveRentvineCandidates,
    skippedLeases,
    totalOutcomes: run.outcomes.length,
    totalFlags: flags.length,
    flagsBySeverity: {
      High: run.bySeverity.High.length,
      Blocked: run.bySeverity.Blocked.length,
      Medium: run.bySeverity.Medium.length,
      Low: run.bySeverity.Low.length,
    },
    outcomesByAgreement: tally(run.outcomes.map((o) => o.reconciliation.agreement)),
    flagsByField: tally(flags.map((o) => o.fieldKey)),
    flagsByAgreement: tally(flags.map((o) => o.reconciliation.agreement)),
    blockedReasons: tally(
      flags
        .map((o) => o.reconciliation.blocked_reason)
        .filter((r): r is string => typeof r === "string"),
    ),
  };

  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    join(artifactDir, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );

  console.log("Renewal review (LIVE) — counts only, no PII:");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Summary written to ${join(artifactDir, "summary.json")} (gitignored).`);
  console.log(
    "Per-flag review WITH values is in the authenticated app (/lease-renewal/runs), not this CLI.",
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
