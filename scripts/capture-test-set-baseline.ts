// S63 baseline capture (AC-S63-2). Captures the frozen baseline for each cohort lease ONCE: the
// authoritative RentVine facts from the complete paged export, the Sheet row as it reads today
// (normalized by the Renewals-tab header schema), and the hash over both. The store is
// create-only, so re-running this script refuses per lease instead of replacing anything.
// Read-only against RentVine and the Sheet; its only writes are the app-plane Firestore baseline
// documents. Output prints NO address, NO rent figure, NO tenant identity — ids, row numbers,
// booleans, and hashes only.
//
//   npm run testset:capture-baseline

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { AuthenticatedUser } from "../lib/auth/session";
import { captureTestSetBaseline } from "../lib/firestore/test-set-baseline";
import {
  GoogleSheetsApiReader,
  readRenewalSheetGrids,
} from "../lib/google-sheets/read-client";
import {
  RentVineClient,
  createFetchTransport,
} from "../lib/integrations/rentvine/client";
import {
  findLeaseViewById,
  leaseAddressLabel,
  leaseCurrentRent,
  leaseEndDateIso,
  leasePortfolioId,
  leaseViewsFromExport,
} from "../lib/integrations/rentvine/lease-mapper";
import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "../lib/lease-renewal/headers";

const COHORT: ReadonlyArray<{ leaseId: string; sheetRow: number }> = [
  { leaseId: "278", sheetRow: 507 },
  { leaseId: "279", sheetRow: 508 },
  { leaseId: "280", sheetRow: 509 },
  { leaseId: "297", sheetRow: 510 },
];

const CAPTURE_ACTOR: AuthenticatedUser = {
  uid: "script:capture-test-set-baseline",
  email: "ops@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

function loadLocalEnv(root: string): void {
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && match[1] && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  } catch {
    // Fall back to ambient env.
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function getLiveFirestore() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }
  return getFirestore();
}

async function main(): Promise<void> {
  loadLocalEnv(process.cwd());

  // 1) The authoritative RentVine facts via the SAME complete paged read the desk uses.
  const client = new RentVineClient(
    {
      baseUrl: requireEnv("RENTVINE_API_BASE_URL"),
      apiKey: requireEnv("RENTVINE_API_KEY"),
      apiSecret: requireEnv("RENTVINE_API_SECRET"),
    },
    createFetchTransport({ timeoutMs: 30_000 }),
  );
  const exportResult = await client.listAllLeasesExport();
  if (!exportResult.complete) {
    throw new Error("RentVine export read incomplete; refusing to capture baselines.");
  }
  const views = leaseViewsFromExport(exportResult.rows);

  // 2) The Sheet rows as they read right now (read-only), normalized by the Renewals schema.
  const sheetReader = new GoogleSheetsApiReader(
    requireEnv("SHEETS_IMPERSONATE_SA"),
    requireEnv("SHEETS_DWD_SUBJECT"),
  );
  const sheetRead = await readRenewalSheetGrids({
    reader: sheetReader,
    spreadsheetId: requireEnv("RENEWAL_SHEET_ID"),
    tabTitles: ["Lease Renewal"],
  });
  const grid = sheetRead.tables[0];
  if (!grid) throw new Error("Lease Renewal tab read returned no grid.");
  const resolution = resolveHeaders(grid, RENEWAL_TAB_SCHEMAS.Renewals ?? []);
  if (resolution.headerRowIndex === null) {
    throw new Error("Could not resolve the Lease Renewal tab headers.");
  }

  const db = getLiveFirestore();
  for (const member of COHORT) {
    const view = findLeaseViewById(views, member.leaseId);
    if (!view) {
      console.log(`lease ${member.leaseId}: NOT in the export; baseline not captured`);
      continue;
    }
    const row = grid[member.sheetRow - 1];
    if (!row) {
      console.log(
        `lease ${member.leaseId}: Sheet row ${member.sheetRow} absent; baseline not captured`,
      );
      continue;
    }
    const sheetRow: Record<string, string> = {};
    for (const [field, columnIndex] of Object.entries(resolution.resolvedFields)) {
      const cell = row[columnIndex];
      if (typeof cell === "string" && cell.trim() !== "") {
        sheetRow[field] = cell;
      }
    }

    const tenants = (view as { tenants?: unknown[] }).tenants;
    try {
      const baseline = await captureTestSetBaseline(
        CAPTURE_ACTOR,
        {
          leaseId: member.leaseId,
          sheetRowNumber: member.sheetRow,
          rentvineFacts: {
            leaseId: member.leaseId,
            leaseEnd: leaseEndDateIso(view) ?? null,
            currentRent: leaseCurrentRent(view) ?? null,
            tenantCount: Array.isArray(tenants) ? tenants.length : null,
            addressLabel: leaseAddressLabel(view) ?? null,
            portfolioId: leasePortfolioId(view) ?? null,
          },
          sheetRow,
        },
        db,
      );
      console.log(
        `lease ${member.leaseId}: baseline CAPTURED row=${member.sheetRow} sheetFields=${Object.keys(sheetRow).length} hash=${baseline.hash}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already exists/i.test(message)) {
        console.log(
          `lease ${member.leaseId}: baseline already captured; capture refused (immutable)`,
        );
      } else {
        throw error;
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
