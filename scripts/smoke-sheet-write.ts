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
import { fileURLToPath, pathToFileURL } from "node:url";

import { GoogleSheetsApiWriter } from "../lib/google-sheets/write-client";
import { RENEWAL_SHEET_WRITEBACK_ACTION_KEY } from "../lib/lease-renewal/sheet-writeback-contract";
import { commitWritebackAtRow } from "../lib/lease-renewal/sheet-writeback-execution";
import { SHEET_WRITEBACK_FLAG } from "../lib/lease-renewal/sheet-writeback-policy";
import {
  ActionRuntimeSuspendedError,
  assertProductionRuntimeActionExecutable,
} from "../lib/operations/runtime-suspension-gate";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TAB = "Renewals";
const PROPOSED_COLUMN = "KB Proposed — Comp basis";

type SheetSmokeWriter = Pick<
  GoogleSheetsApiWriter,
  | "createSpreadsheet"
  | "updateValues"
  | "writeValuesIfEmpty"
  | "getValues"
  | "clearValuesIfExactMatch"
>;

interface SmokeLogger {
  log(...values: unknown[]): void;
  error(...values: unknown[]): void;
}

export interface SheetWriteSmokeDependencies {
  assertRuntimeExecutable(actionKey: string): Promise<void>;
  loadEnvLocal(): Record<string, string>;
  createWriter(impersonateServiceAccount: string, dwdSubject: string): SheetSmokeWriter;
  setWritebackFlag(value: string): void;
  now(): Date;
  logger: SmokeLogger;
}

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

const PRODUCTION_DEPENDENCIES: SheetWriteSmokeDependencies = {
  assertRuntimeExecutable: assertProductionRuntimeActionExecutable,
  loadEnvLocal,
  createWriter: (impersonateServiceAccount, dwdSubject) =>
    new GoogleSheetsApiWriter(impersonateServiceAccount, dwdSubject),
  setWritebackFlag: (value) => {
    process.env[SHEET_WRITEBACK_FLAG] = value;
  },
  now: () => new Date(),
  logger: console,
};

/**
 * Keep every mutating Sheets primitive behind a fresh runtime check. The throwaway proof performs
 * several distinct provider mutations, so a stop raised after spreadsheet creation (or after any
 * later proof step) must win before the next mutation rather than relying on the construction-time
 * check alone. Reads remain available for verification and recovery.
 */
function runtimeGatedMutationWriter(
  writer: SheetSmokeWriter,
  assertRuntimeExecutable: SheetWriteSmokeDependencies["assertRuntimeExecutable"],
): SheetSmokeWriter {
  const assertClear = (): Promise<void> =>
    assertRuntimeExecutable(RENEWAL_SHEET_WRITEBACK_ACTION_KEY);
  return {
    async createSpreadsheet(title, tabTitle) {
      await assertClear();
      return writer.createSpreadsheet(title, tabTitle);
    },
    getValues: (spreadsheetId, range) => writer.getValues(spreadsheetId, range),
    async updateValues(spreadsheetId, range, values) {
      await assertClear();
      return writer.updateValues(spreadsheetId, range, values);
    },
    async writeValuesIfEmpty(spreadsheetId, range, value) {
      await assertClear();
      return writer.writeValuesIfEmpty(spreadsheetId, range, value);
    },
    async clearValuesIfExactMatch(spreadsheetId, range, expectedValue) {
      await assertClear();
      return writer.clearValuesIfExactMatch(spreadsheetId, range, expectedValue);
    },
  };
}

function hasArg(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

/** True when the error looks like a missing-scope / stale-token fail-closed (=> DEFERRED, not FAIL). */
function isAuthScopeError(message: string): boolean {
  return /scope|token|auth|invalid_grant|unauthorized|permission|403|401|DWD/i.test(
    message,
  );
}

export async function runSheetWriteSmoke(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  dependencies: SheetWriteSmokeDependencies = PRODUCTION_DEPENDENCIES,
): Promise<void> {
  const live = hasArg(argv, "--live");
  if (!live) {
    dependencies.logger.log(
      "Sheet write-back smoke (DRY). No configuration, ADC/token, writer, feature flag, or network call is made. " +
        `With --live it would target a new synthetic spreadsheet behind ${RENEWAL_SHEET_WRITEBACK_ACTION_KEY}.`,
    );
    dependencies.logger.log(
      "Pass --live only after that exact action key is enabled and runtime-clear.",
    );
    return;
  }

  // Gate before .env.local and repeat immediately before writer construction. The committed action
  // is currently seed-closed, so this live primitive diagnostic cannot bypass product governance.
  await dependencies.assertRuntimeExecutable(RENEWAL_SHEET_WRITEBACK_ACTION_KEY);

  const localEnv = dependencies.loadEnvLocal();
  const readEnv = (name: string): string | undefined => env[name] ?? localEnv[name];

  const impersonateSa = readEnv("SHEETS_IMPERSONATE_SA");
  const dwdSubject = readEnv("SHEETS_DWD_SUBJECT");

  if (!impersonateSa || !dwdSubject) {
    dependencies.logger.log(
      "DEFERRED — SHEETS_IMPERSONATE_SA / SHEETS_DWD_SUBJECT not set; cannot mint the keyless DWD write token.",
    );
    return; // exit 0: expected degradation, not a failure.
  }

  await dependencies.assertRuntimeExecutable(RENEWAL_SHEET_WRITEBACK_ACTION_KEY);
  // The flag gates the executor; enable it for THIS process only (never persisted, never deployed).
  dependencies.setWritebackFlag("true");
  const writer = runtimeGatedMutationWriter(
    dependencies.createWriter(impersonateSa, dwdSubject),
    dependencies.assertRuntimeExecutable,
  );

  // A run tag that is stable within a process without Date-based nondeterminism concerns for the sheet id.
  const runTag = dependencies.now().toISOString().replace(/[:.]/g, "-");
  const title = `KB Writeback Smoke — ${runTag}`;
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const record = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
    dependencies.logger.log(`  [${ok ? "PASS" : "FAIL"}] ${name} — ${detail}`);
  };

  let spreadsheetId: string;
  try {
    spreadsheetId = await writer.createSpreadsheet(title, TAB);
  } catch (error) {
    if (error instanceof ActionRuntimeSuspendedError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (isAuthScopeError(message)) {
      dependencies.logger.log(
        `DEFERRED — could not create the test sheet (fail-closed): ${message}\n` +
          "This is the expected result if the Sheets WRITE scope is not yet on the lease-renewal-reader " +
          "SA's DWD grant. Grant it, then re-run: npm run smoke:sheet-write -- --live",
      );
      return; // exit 0: deferred per runbook skip rule.
    }
    throw new Error(`FAIL — unexpected error creating the test sheet: ${message}`);
  }

  dependencies.logger.log(
    `Sheet write-back smoke (LIVE) — created test sheet id: ${spreadsheetId}`,
  );
  dependencies.logger.log(
    `Title: "${title}" (owned by the DWD subject; safe to delete).`,
  );

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
    dependencies.setWritebackFlag("false");
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
    dependencies.setWritebackFlag("true");
  } catch (error) {
    if (error instanceof ActionRuntimeSuspendedError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`FAIL — unexpected error during the proof: ${message}`);
  }

  const failed = checks.filter((c) => !c.ok);
  dependencies.logger.log("");
  if (failed.length === 0) {
    dependencies.logger.log(
      `DEFERRED — all ${checks.length} fixed-A1/fail-closed proofs passed on test sheet ${spreadsheetId}.`,
    );
    dependencies.logger.log(
      "Activation remains blocked on a provider-side stable-row atomic mutation seam; fixed-A1 Sheets " +
        "CAS is not sufficient. Operational sheet untouched and action key unchanged.",
    );
  } else {
    throw new Error(
      `FAIL — ${failed.length}/${checks.length} proofs failed on test sheet ${spreadsheetId}.`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runSheetWriteSmoke().catch((error) => {
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
}
