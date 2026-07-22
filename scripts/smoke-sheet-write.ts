// Slice 2 (overnight run 2026-07-22): LIVE proof that the append-only Sheet write-back executes.
//
// Proves commitWritebackAtRow end-to-end against a BRAND-NEW, clearly-named THROWAWAY spreadsheet
// created by the DWD subject — NEVER the team's operational renewal sheet. The test sheet is seeded
// with SYNTHETIC rows only (no client PII). It asserts:
//   1. write     — an empty "KB Proposed — <field>" cell is filled; read-after-write matches.
//   2. CAS       — a second write to the now-filled cell is BLOCKED (append-only never overwrites).
//   3. block     — missing column / empty value / out-of-range row each BLOCK (uncertainty never writes).
//   4. gate      — with the feature flag OFF the executor is DISABLED (no read, no write).
//
// Fail-closed: if the DWD grant lacks the Sheets WRITE scope (or the token is stale), creation/write
// throws and the smoke records DEFERRED (exit 0) rather than failing — matching the runbook skip rule.
//
//   npm run smoke:sheet-write            # dry: prints what it would do
//   npm run smoke:sheet-write -- --live  # creates a test sheet + runs the proof (free; no GCP budget)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GoogleSheetsApiWriter } from "../lib/google-sheets/write-client";
import {
  SHEET_WRITEBACK_FLAG,
  commitWritebackAtRow,
} from "../lib/lease-renewal/sheet-writeback-execution";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TAB = "Renewals";
const PROPOSED_COLUMN = "KB Proposed — Comp basis";

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

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

const checks: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name} — ${detail}`);
}

/** True when the error looks like a missing-scope / stale-token fail-closed (=> DEFERRED, not FAIL). */
function isAuthScopeError(message: string): boolean {
  return /scope|token|auth|invalid_grant|unauthorized|permission|403|401|DWD/i.test(
    message,
  );
}

async function main(): Promise<void> {
  const localEnv = loadEnvLocal();
  const readEnv = (name: string): string | undefined =>
    process.env[name] ?? localEnv[name];
  const live = hasArg("--live");

  const impersonateSa = readEnv("SHEETS_IMPERSONATE_SA");
  const dwdSubject = readEnv("SHEETS_DWD_SUBJECT");

  if (!live) {
    console.log(
      "Sheet write-back smoke (DRY). With --live it would: create a NEW test spreadsheet " +
        `("KB Writeback Smoke — <run>"), seed synthetic rows + the "${PROPOSED_COLUMN}" column, then ` +
        "prove write + CAS + block-on-uncertainty + gate-off. It never touches the operational sheet.",
    );
    console.log(
      "Pass --live to run the proof (free; read/WRITE Sheets scope; no GCP budget spend).",
    );
    return;
  }

  if (!impersonateSa || !dwdSubject) {
    console.log(
      "DEFERRED — SHEETS_IMPERSONATE_SA / SHEETS_DWD_SUBJECT not set; cannot mint the keyless DWD write token.",
    );
    return; // exit 0: expected degradation, not a failure.
  }

  // The flag gates the executor; enable it for THIS process only (never persisted, never deployed).
  process.env[SHEET_WRITEBACK_FLAG] = "true";
  const writer = new GoogleSheetsApiWriter(impersonateSa, dwdSubject);

  // A run tag that is stable within a process without Date-based nondeterminism concerns for the sheet id.
  const runTag = `${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const title = `KB Writeback Smoke — ${runTag}`;

  let spreadsheetId: string;
  try {
    spreadsheetId = await writer.createSpreadsheet(title, TAB);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isAuthScopeError(message)) {
      console.log(
        `DEFERRED — could not create the test sheet (fail-closed): ${message}\n` +
          "This is the expected result if the Sheets WRITE scope is not yet on the lease-renewal-reader " +
          "SA's DWD grant. Grant it, then re-run: npm run smoke:sheet-write -- --live",
      );
      return; // exit 0: deferred per runbook skip rule.
    }
    console.error(`FAIL — unexpected error creating the test sheet: ${message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Sheet write-back smoke (LIVE) — created test sheet id: ${spreadsheetId}`);
  console.log(`Title: "${title}" (owned by the DWD subject; safe to delete).`);

  try {
    // Seed: header + 2 synthetic data rows; KB-Proposed cells start EMPTY (append-only target).
    const seed: string[][] = [
      ["Lease", "Tenant", "Current Rent", PROPOSED_COLUMN],
      ["lease:SMOKE-1", "Test Tenant A", "1500", ""],
      ["lease:SMOKE-2", "Test Tenant B", "1600", ""],
    ];
    await writer.updateValues(spreadsheetId, `${TAB}!A1`, seed);

    const proposedValue = "Zillow 1450-1600; PMI 1550 (synthetic test)";

    // 1. WRITE into the empty KB-Proposed cell of data row 1 (0-based grid index 1 => sheet row 2 => D2).
    const written = await commitWritebackAtRow(writer, {
      spreadsheetId,
      tabName: TAB,
      proposedColumnHeader: PROPOSED_COLUMN,
      rowIndex: 1,
      proposedValue,
    });
    record(
      "write into empty KB-Proposed cell",
      written.status === "written" && written.a1 === `${TAB}!D2`,
      JSON.stringify(written),
    );

    // read-after-write (independent confirm).
    const readBack = await writer.getValues(spreadsheetId, `${TAB}!D2`);
    record(
      "read-after-write matches",
      (readBack[0]?.[0] ?? "") === proposedValue,
      `cell="${readBack[0]?.[0] ?? ""}"`,
    );

    // 2. CAS — a second write to the now-filled cell must BLOCK (never overwrite team data).
    const second = await commitWritebackAtRow(writer, {
      spreadsheetId,
      tabName: TAB,
      proposedColumnHeader: PROPOSED_COLUMN,
      rowIndex: 1,
      proposedValue: "SHOULD NOT WRITE",
    });
    record(
      "CAS blocks overwrite of a filled cell",
      second.status === "blocked",
      JSON.stringify(second),
    );

    // 3a. BLOCK — missing KB-Proposed column.
    const missingCol = await commitWritebackAtRow(writer, {
      spreadsheetId,
      tabName: TAB,
      proposedColumnHeader: "KB Proposed — Nonexistent",
      rowIndex: 2,
      proposedValue,
    });
    record(
      "missing column blocks",
      missingCol.status === "blocked",
      JSON.stringify(missingCol),
    );

    // 3b. BLOCK — empty proposed value (a value is never invented upstream).
    const emptyValue = await commitWritebackAtRow(writer, {
      spreadsheetId,
      tabName: TAB,
      proposedColumnHeader: PROPOSED_COLUMN,
      rowIndex: 2,
      proposedValue: "   ",
    });
    record(
      "empty value blocks",
      emptyValue.status === "blocked",
      JSON.stringify(emptyValue),
    );

    // 3c. BLOCK — target row outside the sheet.
    const outOfRange = await commitWritebackAtRow(writer, {
      spreadsheetId,
      tabName: TAB,
      proposedColumnHeader: PROPOSED_COLUMN,
      rowIndex: 99,
      proposedValue,
    });
    record(
      "out-of-range row blocks",
      outOfRange.status === "blocked",
      JSON.stringify(outOfRange),
    );

    // 4. GATE — with the flag OFF the executor is DISABLED (no read, no write). Row 2 is still empty,
    // so this proves the DISABLED path is taken *instead of* a write.
    process.env[SHEET_WRITEBACK_FLAG] = "false";
    const disabled = await commitWritebackAtRow(writer, {
      spreadsheetId,
      tabName: TAB,
      proposedColumnHeader: PROPOSED_COLUMN,
      rowIndex: 2,
      proposedValue,
    });
    record(
      "flag OFF => disabled (no write)",
      disabled.status === "disabled",
      JSON.stringify(disabled),
    );
    process.env[SHEET_WRITEBACK_FLAG] = "true";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL — unexpected error during the proof: ${message}`);
    process.exitCode = 1;
    return;
  }

  const failed = checks.filter((c) => !c.ok);
  console.log("");
  if (failed.length === 0) {
    console.log(
      `PASS — all ${checks.length} write-back proofs passed on test sheet ${spreadsheetId}.`,
    );
    console.log(
      "The append-only write-back executes live: it writes an empty KB-Proposed cell, blocks every " +
        "overwrite/uncertainty, and is fully gated by the flag. Operational sheet untouched.",
    );
  } else {
    console.error(
      `FAIL — ${failed.length}/${checks.length} proofs failed on test sheet ${spreadsheetId}.`,
    );
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (isAuthScopeError(message)) {
    console.log(
      `DEFERRED — fail-closed (likely missing write scope / stale token): ${message}`,
    );
    return;
  }
  console.error(message);
  process.exitCode = 1;
});
