// LIVE throwaway proof for the fixed-A1 Google Sheets primitives beneath the write-back action.
//
// Runs only against a BRAND-NEW spreadsheet containing SYNTHETIC rows. It proves exact-cell append,
// drift refusal, and exact-value clear, while also proving that the product action remains blocked:
// GoogleSheetsApiWriter deliberately lacks the provider-side stable-row transaction required to bind
// logical row + human-confirmed A1 + value atomically. These primitive checks cannot activate the key.
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
import { commitWritebackAtRow } from "../lib/lease-renewal/sheet-writeback-execution";
import { SHEET_WRITEBACK_FLAG } from "../lib/lease-renewal/sheet-writeback-policy";

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
        "prove fixed-A1 CAS/correction plus fail-closed stable-row capability refusal. It never touches " +
        "the operational sheet and cannot activate the action key.",
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

    // 1. Prove only the fixed-A1 primitive against the synthetic throwaway row.
    const written = await writer.writeValuesIfEmpty(
      spreadsheetId,
      `${TAB}!D2`,
      proposedValue,
    );
    record(
      "fixed-A1 primitive writes one empty synthetic cell",
      written,
      `changed=${String(written)}`,
    );

    // read-after-write (independent confirm).
    const readBack = await writer.getValues(spreadsheetId, `${TAB}!D2`);
    record(
      "read-after-write matches",
      (readBack[0]?.[0] ?? "") === proposedValue,
      `cell="${readBack[0]?.[0] ?? ""}"`,
    );

    // 2a. Pre-read guard — a second write to the now-filled cell must BLOCK.
    const second = await commitWritebackAtRow(writer, {
      spreadsheetId,
      tabName: TAB,
      propertyKey: "synthetic-property",
      fieldKey: "synthetic_comp_basis",
      proposedColumnHeader: PROPOSED_COLUMN,
      rowIndex: 1,
      proposedValue: "SHOULD NOT WRITE",
    });
    record(
      "CAS blocks overwrite of a filled cell",
      second.status === "blocked",
      JSON.stringify(second),
    );

    // 2b. The real product action additionally requires stable-row atomicity, which the generic
    // Sheets REST writer cannot honestly claim. An empty eligible cell therefore remains untouched.
    const stableRowBlocked = await commitWritebackAtRow(writer, {
      spreadsheetId,
      tabName: TAB,
      propertyKey: "synthetic-property",
      fieldKey: "synthetic_comp_basis",
      proposedColumnHeader: PROPOSED_COLUMN,
      rowIndex: 2,
      proposedValue: "SHOULD NOT WRITE",
    });
    record(
      "product action blocks without stable-row atomicity",
      stableRowBlocked.status === "blocked" &&
        stableRowBlocked.reason.includes("stable-row atomic"),
      JSON.stringify(stableRowBlocked),
    );
    const stableRowReadback = await writer.getValues(spreadsheetId, `${TAB}!D3`);
    record(
      "stable-row refusal leaves the candidate cell empty",
      (stableRowReadback[0]?.[0] ?? "") === "",
      "no product-action effect",
    );

    // 2c. Provider CAS — bypass the product action intentionally to prove the Sheets-side
    // exact-cell primitive itself returns zero changes after collaborator drift.
    await writer.updateValues(spreadsheetId, `${TAB}!D3`, [["INTERVENING SYNTHETIC"]]);
    const driftedAppend = await writer.writeValuesIfEmpty(
      spreadsheetId,
      `${TAB}!D3`,
      "SHOULD NOT WRITE",
    );
    const driftedReadback = await writer.getValues(spreadsheetId, `${TAB}!D3`);
    record(
      "provider CAS refuses collaborator drift",
      !driftedAppend && driftedReadback[0]?.[0] === "INTERVENING SYNTHETIC",
      `changed=${String(driftedAppend)}`,
    );

    // 2d/3. Conditional correction — wrong expected value changes nothing; exact expected value
    // clears the one synthetic cell and reads back empty.
    const wrongClear = await writer.clearValuesIfExactMatch(
      spreadsheetId,
      `${TAB}!D2`,
      "WRONG SYNTHETIC VALUE",
    );
    const afterWrongClear = await writer.getValues(spreadsheetId, `${TAB}!D2`);
    record(
      "provider correction refuses an intervening value",
      !wrongClear && afterWrongClear[0]?.[0] === proposedValue,
      `changed=${String(wrongClear)}`,
    );
    const exactClear = await writer.clearValuesIfExactMatch(
      spreadsheetId,
      `${TAB}!D2`,
      proposedValue,
    );
    const afterExactClear = await writer.getValues(spreadsheetId, `${TAB}!D2`);
    record(
      "provider correction clears only the exact value",
      exactClear && (afterExactClear[0]?.[0] ?? "") === "",
      `changed=${String(exactClear)}`,
    );

    // 4a. BLOCK — missing KB-Proposed column.
    const missingCol = await commitWritebackAtRow(writer, {
      spreadsheetId,
      tabName: TAB,
      propertyKey: "synthetic-property",
      fieldKey: "synthetic_comp_basis",
      proposedColumnHeader: "KB Proposed — Nonexistent",
      rowIndex: 2,
      proposedValue,
    });
    record(
      "missing column blocks",
      missingCol.status === "blocked",
      JSON.stringify(missingCol),
    );

    // 4b. BLOCK — empty proposed value (a value is never invented upstream).
    const emptyValue = await commitWritebackAtRow(writer, {
      spreadsheetId,
      tabName: TAB,
      propertyKey: "synthetic-property",
      fieldKey: "synthetic_comp_basis",
      proposedColumnHeader: PROPOSED_COLUMN,
      rowIndex: 2,
      proposedValue: "   ",
    });
    record(
      "empty value blocks",
      emptyValue.status === "blocked",
      JSON.stringify(emptyValue),
    );

    // 4c. BLOCK — target row outside the sheet.
    const outOfRange = await commitWritebackAtRow(writer, {
      spreadsheetId,
      tabName: TAB,
      propertyKey: "synthetic-property",
      fieldKey: "synthetic_comp_basis",
      proposedColumnHeader: PROPOSED_COLUMN,
      rowIndex: 99,
      proposedValue,
    });
    record(
      "out-of-range row blocks",
      outOfRange.status === "blocked",
      JSON.stringify(outOfRange),
    );

    // 5. GATE — with the flag OFF the executor is DISABLED (no read, no write). Row 1 was corrected
    // back to empty,
    // so this proves the DISABLED path is taken *instead of* a write.
    process.env[SHEET_WRITEBACK_FLAG] = "false";
    const disabled = await commitWritebackAtRow(writer, {
      spreadsheetId,
      tabName: TAB,
      propertyKey: "synthetic-property",
      fieldKey: "synthetic_comp_basis",
      proposedColumnHeader: PROPOSED_COLUMN,
      rowIndex: 1,
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
      `DEFERRED — all ${checks.length} fixed-A1/fail-closed proofs passed on test sheet ${spreadsheetId}.`,
    );
    console.log(
      "Activation remains blocked on a provider-side stable-row atomic mutation seam; fixed-A1 Sheets " +
        "CAS is not sufficient. Operational sheet untouched and action key unchanged.",
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
