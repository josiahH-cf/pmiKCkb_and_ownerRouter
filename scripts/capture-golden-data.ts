// Golden-data live-capture tool (R2). Reads RentVine + the Lease Renewal sheet READ-ONLY and writes a
// LABELED golden-scenario DRAFT to a gitignored, in-boundary dir (golden-data/captured/). The captured
// input is real client data: it is never committed (gitignored) and never printed (stdout is
// counts-only, no cell values). expectedFlags are the pipeline's CURRENT output as CANDIDATE labels
// (labelsVerified:false) — a human/team must verify each against ground truth, then set
// labelsVerified:true, before the harness gates on the set. Mirrors smoke:renewal-review's read path.
//
//   npm run golden:capture                                   # dry: prints what it would do
//   npm run golden:capture -- --live                         # one RentVine read + one Sheet read; writes a gitignored draft
//   npm run golden:capture -- --live --name=aug-cohort --tabs="Lease Renewal"

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
  const name =
    readArg("--name") ?? `capture-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const outDir = resolve(readArg("--out") ?? "golden-data/captured");

  if (!live) {
    console.log(
      `Golden capture (DRY). Would read RentVine /leases/export + sheet tab(s) [${tabs.join(", ")}] and write a gitignored golden DRAFT to golden-data/captured/. Pass --live (free, read-only).`,
    );
    return;
  }

  if (!baseUrl || !apiKey || !apiSecret || !spreadsheetId) {
    console.log(
      "Golden capture (LIVE) skipped: set RENTVINE_API_BASE_URL/KEY/SECRET and RENEWAL_SHEET_ID in .env.local to capture.",
    );
    return; // clean skip (exit 0) — fresh checkouts / CI have no live config
  }
  try {
    assertRentVineAccount(baseUrl, EXPECTED_ACCOUNT);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
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

  const { run, pipelineInput, sheetTabsRead, liveRentvineCandidates, skippedLeases } =
    await runFullyLiveRenewalReview({
      rentvineClient,
      sheetsReader,
      spreadsheetId,
      tabTitles: tabs,
      runId: name,
      readTimestamp: new Date().toISOString(),
    });

  // Candidate labels: the pipeline's CURRENT flags. NOT ground truth until a human verifies them.
  const expectedFlags = run.flags.map((flag) => ({
    tab: flag.recordRef.tab,
    sourceRowIndex: flag.recordRef.sourceRowIndex,
    fieldKey: flag.fieldKey,
    severity: flag.reconciliation.severity,
  }));

  const draft = {
    name,
    category: "wrong" as const,
    description:
      `Live-captured golden DRAFT from RentVine account ${rentVineAccountCode(baseUrl)} + sheet tab(s) [${tabs.join(", ")}]. expectedFlags are the pipeline's current output as CANDIDATE labels and are NOT verified — review each against ground truth with the team, then set labelsVerified:true. The harness only gates on verified sets.`,
    labelsVerified: false,
    capturedAt: new Date().toISOString(),
    input: pipelineInput,
    expectedFlags,
  };

  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${name}.json`);
  writeFileSync(outPath, JSON.stringify(draft, null, 2), "utf8");

  console.log("Golden capture (LIVE) — counts only, no PII:");
  console.log(
    JSON.stringify(
      {
        name,
        sheetTabsRead,
        liveRentvineCandidates,
        skippedLeases,
        totalOutcomes: run.outcomes.length,
        candidateFlags: expectedFlags.length,
        flagsBySeverity: {
          High: run.bySeverity.High.length,
          Blocked: run.bySeverity.Blocked.length,
          Medium: run.bySeverity.Medium.length,
          Low: run.bySeverity.Low.length,
        },
      },
      null,
      2,
    ),
  );
  console.log(
    `Golden DRAFT written to ${outPath} (gitignored, in-boundary). Labels are UNVERIFIED — review with the team, then set labelsVerified:true so the harness gates on it.`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
