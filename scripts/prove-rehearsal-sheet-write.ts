#!/usr/bin/env tsx

// Exact-confirmed write/read/rollback proof for a configured COPY of the renewal Sheet.
// The operating Sheet id is loaded alongside the copy id and aliases are refused before writer
// construction. Dry mode makes no auth or network call. Live mode touches one explicitly named blank
// cell in the copy with a synthetic marker and restores it in the same run.

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { GoogleSheetsApiWriter } from "../lib/google-sheets/write-client";
import {
  proveRehearsalSheetRoundTrip,
  resolveRenewalSheetBindings,
} from "../lib/lease-renewal/rehearsal-sheet";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function readArg(name: string, argv: readonly string[]): string | undefined {
  const prefix = `${name}=`;
  return argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function readEnvFile(path: string): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!match) continue;
      out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

export function rehearsalProofConfirmationToken(
  rehearsalSpreadsheetId: string,
  range: string,
): string {
  return createHash("sha256")
    .update(`pmi-rehearsal-sheet-proof:v1:${rehearsalSpreadsheetId}:${range}`)
    .digest("hex");
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  ambient: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const fileName = readArg("--env-file", argv) ?? ".env.production.local";
  const fileEnv = readEnvFile(resolve(root, fileName));
  const env = { ...fileEnv, ...ambient };
  const bindings = resolveRenewalSheetBindings(env);
  if (!bindings.operating.configured) {
    throw new Error(
      "Operating renewal Sheet is not configured; alias safety cannot be proven.",
    );
  }
  if (bindings.rehearsal.status !== "ready") {
    throw new Error(
      bindings.rehearsal.status === "same_as_operating"
        ? "Rehearsal Sheet equals the operating Sheet; proof refused."
        : "RENEWAL_REHEARSAL_SHEET_ID is not configured.",
    );
  }
  const range = readArg("--range", argv) ?? "Lease Renewal!ZZ1";
  const confirmation = rehearsalProofConfirmationToken(
    bindings.rehearsal.spreadsheetId,
    range,
  );
  if (!argv.includes("--live")) {
    console.log("Rehearsal Sheet proof plan (DRY): no auth or network call was made.");
    console.log(`Target: configured rehearsal copy only; exact cell ${range}.`);
    console.log(
      "Sequence: require blank → synthetic CAS write → readback → exact clear → blank readback.",
    );
    console.log(
      `To execute: npm run prove:rehearsal-sheet -- --live --range=${JSON.stringify(range)} --confirm=${confirmation}`,
    );
    return;
  }
  if (readArg("--confirm", argv) !== confirmation) {
    throw new Error(
      "Live copy proof requires the exact confirmation token printed by dry mode.",
    );
  }
  const impersonateSa = env.SHEETS_IMPERSONATE_SA?.trim();
  const dwdSubject = env.SHEETS_DWD_SUBJECT?.trim();
  if (!impersonateSa || !dwdSubject) {
    throw new Error("SHEETS_IMPERSONATE_SA and SHEETS_DWD_SUBJECT are required.");
  }
  const marker = `PMI_REHEARSAL_PROBE_${randomBytes(8).toString("hex").toUpperCase()}`;
  const writer = new GoogleSheetsApiWriter(impersonateSa, dwdSubject);
  const result = await proveRehearsalSheetRoundTrip(writer, {
    operatingSpreadsheetId: bindings.operating.spreadsheetId!,
    rehearsalSpreadsheetId: bindings.rehearsal.spreadsheetId,
    range,
    marker,
  });
  if (result.status !== "proved") {
    throw new Error(
      `Rehearsal Sheet proof refused (${result.reason}); restored=${String(result.restored)}.`,
    );
  }
  console.log(`Rehearsal Sheet copy proof passed for ${result.range}; restored=true.`);
  console.log("No operating Google Sheet cell was changed during this run.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
