// Phase-1 proof: read the approved lease-renewal Google Sheet (read-only) and confirm structure.
//
// Free (Sheets read quota) and read-only. Default is DRY; pass `--live` to read. Output is
// COUNTS-ONLY: tab titles + per-tab row/col dimensions + the ingest-ready table count — never a cell
// value (the sheet holds real client PII). Credential-marker tabs (WiFi / Logins — tabs 4 & 7) are
// skipped at fetch time as a belt-and-suspenders; the pipeline's ingest Stage B is the authoritative
// content-signature exclusion.
//
//   npm run smoke:sheet-read             # dry: prints what it would read
//   npm run smoke:sheet-read -- --live   # one read-only metadata + values read; counts-only proof

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GoogleSheetsApiReader,
  SHEETS_READONLY_SCOPE,
  readRenewalSheetGrids,
} from "../lib/google-sheets/read-client";
import { createGoogleSheetsHealthCheckTransport } from "../lib/google-sheets/health-probe";
import {
  getHealthCheckContract,
  runHealthCheck,
} from "../lib/integrations/health-checks";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// Skip credential-bearing tabs (4 PadSplit WiFi, 7 Platform Logins) by title so the smoke never
// fetches real credentials. Mirrors the §2.2 credential markers applied to tab titles.
const CREDENTIAL_TITLE_RE = /wifi|ssid|password|passcode|\bpin\b|\blogin/i;

function loadEnvLocal(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const sep = trimmed.indexOf("=");
      if (sep === -1) continue;
      out[trimmed.slice(0, sep).trim()] = trimmed
        .slice(sep + 1)
        .trim()
        .replace(/^"|"$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

function readArg(name: string): string | undefined {
  const prefix = `${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

/** Extract a spreadsheet id from a full Sheets URL, or pass a bare id through. */
function parseSheetId(value: string): string {
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : value;
}

function adcRemediation(): string {
  return [
    "The Sheets read needs Application Default Credentials with the read-only Sheets scope.",
    "Run this once as josiah@pmikcmetro.com (free, no spend):",
    "  gcloud auth application-default login --scopes=openid,https://www.googleapis.com/auth/spreadsheets.readonly,https://www.googleapis.com/auth/cloud-platform",
    "then re-run: npm run smoke:sheet-read -- --live",
  ].join("\n");
}

async function main(): Promise<void> {
  const localEnv = loadEnvLocal();
  const readEnv = (name: string): string | undefined =>
    process.env[name] ?? localEnv[name];

  const rawId =
    readArg("--sheet-url") ?? readArg("--sheet-id") ?? readEnv("RENEWAL_SHEET_ID");
  const live = hasArg("--live");
  const artifactDir = resolve(readArg("--artifacts") ?? "temp/sheet-read-smoke");

  if (!rawId) {
    console.error(
      "Missing RENEWAL_SHEET_ID. Set it in .env.local, or pass --sheet-id=<id> / --sheet-url=<url>.",
    );
    process.exitCode = 1;
    return;
  }
  const spreadsheetId = parseSheetId(rawId);

  if (!live) {
    console.log(
      `Sheet read smoke (DRY). Would read the renewal sheet (id ending …${spreadsheetId.slice(-6)}) read-only via ADC + Sheets scope.`,
    );
    console.log(
      `Scope: ${SHEETS_READONLY_SCOPE}. Pass --live to read (free, read-only).`,
    );
    return;
  }

  const reader = new GoogleSheetsApiReader(
    readEnv("SHEETS_IMPERSONATE_SA"),
    readEnv("SHEETS_DWD_SUBJECT"),
  );

  const contract = getHealthCheckContract("health.google_sheets.api");
  if (!contract) {
    console.error("Missing the health.google_sheets.api contract.");
    process.exitCode = 1;
    return;
  }
  const health = await runHealthCheck(
    contract,
    createGoogleSheetsHealthCheckTransport(reader, spreadsheetId),
  );

  console.log(`Sheet read smoke (LIVE) — sheet id ending …${spreadsheetId.slice(-6)}`);
  console.log(`Health check: ${health.ok ? "OK" : "FAILED"}`);
  for (const step of health.steps) {
    console.log(`  - ${step.step_id}: ${step.ok ? "ok" : "FAIL"} — ${step.detail ?? ""}`);
  }

  if (!health.ok) {
    const detail = health.steps.map((step) => step.detail ?? "").join(" ");
    if (/credential|token|auth|ADC|invalid|401|403|scope/i.test(detail)) {
      console.log("");
      console.log(adcRemediation());
    }
    process.exitCode = 1;
    return;
  }

  const titles = await reader.listTabTitles(spreadsheetId);
  const inScope = titles.filter((title) => !CREDENTIAL_TITLE_RE.test(title));
  const skipped = titles.filter((title) => CREDENTIAL_TITLE_RE.test(title));
  const read = await readRenewalSheetGrids({ reader, spreadsheetId, tabTitles: inScope });

  const perTab = read.titles.map((title, index) => {
    const grid = read.tables[index] ?? [];
    const cols = grid.reduce((max, row) => Math.max(max, row.length), 0);
    return { title, rows: grid.length, cols };
  });

  const proof = {
    spreadsheetIdSuffix: spreadsheetId.slice(-6),
    healthOk: health.ok,
    tabCount: titles.length,
    inScopeTabCount: inScope.length,
    skippedCredentialTabs: skipped, // titles only (labels, not values)
    perTab, // dimensions only — no cell values
  };

  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, "proof.json"), JSON.stringify(proof, null, 2), "utf8");

  console.log(
    `Tabs total: ${titles.length}; in-scope read: ${inScope.length}; skipped (credential-marker): ${skipped.length}`,
  );
  console.log(`Tab titles: ${titles.join(", ")}`);
  console.log("Per-tab dimensions (rows x cols; no cell values):");
  for (const tab of perTab) {
    console.log(`  - ${tab.title}: ${tab.rows} x ${tab.cols}`);
  }
  console.log(
    `Counts-only proof written to ${join(artifactDir, "proof.json")} (gitignored).`,
  );
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (
    /credential|token|ADC|default credentials|invalid_grant|scope|401|403/i.test(message)
  ) {
    console.error("");
    console.error(adcRemediation());
  }
  process.exitCode = 1;
});
