#!/usr/bin/env tsx

// BODYLESS live-read diagnostic for S73. It reports field-path presence and outcome COUNTS only.
// It never prints an address, resident, provider id, sheet id, rent value, credential, or response
// body. It makes one complete RentVine export read plus the read-only renewal reconciliation.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildLiveRenewalConfig } from "../lib/lease-renewal/live-config";
import { runFullyLiveRenewalReview } from "../lib/lease-renewal/live-run";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function readEnv(path: string): Record<string, string> {
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

function present(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizedMoney(value: unknown): number | undefined {
  if (!present(value)) return undefined;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function diagnoseCurrentRentTruth(
  env: Record<string, string | undefined>,
  readTimestamp: string,
) {
  const config = buildLiveRenewalConfig(env);
  if (!config.ok) throw new Error(`Live sources unavailable (${config.reason}).`);

  const exportRead = await config.rentvineClient.listAllLeasesExport();
  const pathCounts = {
    rows: exportRead.rows.length,
    unitRentPresent: 0,
    leaseRentPresent: 0,
    bothPresent: 0,
    bothAgree: 0,
    bothDiffer: 0,
  };
  for (const raw of exportRead.rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const lease =
      row.lease && typeof row.lease === "object" && !Array.isArray(row.lease)
        ? (row.lease as Record<string, unknown>)
        : row;
    const unit =
      row.unit && typeof row.unit === "object" && !Array.isArray(row.unit)
        ? (row.unit as Record<string, unknown>)
        : {};
    const unitRent = unit.rent;
    const leaseRent = lease.rent ?? lease.currentRent ?? lease.rentAmount;
    const hasUnit = present(unitRent);
    const hasLease = present(leaseRent);
    if (hasUnit) pathCounts.unitRentPresent += 1;
    if (hasLease) pathCounts.leaseRentPresent += 1;
    if (hasUnit && hasLease) {
      pathCounts.bothPresent += 1;
      const left = normalizedMoney(unitRent);
      const right = normalizedMoney(leaseRent);
      if (left !== undefined && right !== undefined && left === right) {
        pathCounts.bothAgree += 1;
      } else {
        pathCounts.bothDiffer += 1;
      }
    }
  }

  const review = await runFullyLiveRenewalReview({
    rentvineClient: config.rentvineClient,
    sheetsReader: config.sheetsReader,
    spreadsheetId: config.spreadsheetId,
    tabTitles: ["Lease Renewal"],
    runId: "s73-bodyless-diagnostic",
    readTimestamp,
  });
  const outcomes = review.run.outcomes.filter(
    (outcome) => outcome.fieldKey === "current_rent",
  );
  const reconciliationCounts = {
    agree: 0,
    conflict: 0,
    singleSource: 0,
    missing: 0,
    raisedHigh: 0,
  };
  for (const outcome of outcomes) {
    if (outcome.reconciliation.agreement === "agree") reconciliationCounts.agree++;
    if (outcome.reconciliation.agreement === "conflict") {
      reconciliationCounts.conflict++;
    }
    if (outcome.reconciliation.agreement === "single_source") {
      reconciliationCounts.singleSource++;
    }
    if (outcome.reconciliation.agreement === "missing") reconciliationCounts.missing++;
    if (outcome.reconciliation.raise_flag && outcome.reconciliation.severity === "High") {
      reconciliationCounts.raisedHigh++;
    }
  }

  return {
    kind: "s73_current_rent_bodyless_diagnostic",
    readAt: readTimestamp,
    exportComplete: exportRead.complete,
    resolvedPrecedence: "unit.rent then lease.currentRent then lease.rent",
    pathCounts,
    reconciliationCounts,
  } as const;
}

async function main() {
  const file = process.argv.find((arg) => arg.startsWith("--env-file="))?.slice(11);
  const fileEnv = readEnv(resolve(root, file ?? ".env.production.local"));
  const report = await diagnoseCurrentRentTruth(
    { ...fileEnv, ...process.env },
    new Date().toISOString(),
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
