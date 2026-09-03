// S63 secure four-case baseline capture. Exact case and actor values arrive only through the
// git-excluded runtime config. Invalid config refuses before any provider read. RentVine and the
// operating Sheet are read-only; the only mutation is an immutable app-plane Firestore create.
// Terminal output contains counts plus one opaque run reference and never emits a case value.
//
//   S63_TEST_SET_RUNTIME_CONFIG_PATH=<secure path> npm run testset:capture-baseline

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  captureTestSetBaseline,
  getTestSetBaseline,
  testSetBaselineMatchesInput,
  verifyTestSetBaselineHash,
  type CaptureTestSetBaselineInput,
} from "../lib/firestore/test-set-baseline";
import { GoogleSheetsApiReader } from "../lib/google-sheets/read-client";
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
import { enrichLeaseViewsWithDetail } from "../lib/integrations/rentvine/lease-detail-enrichment";
import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "../lib/lease-renewal/headers";
import { readRenewalSheetGridsWithLinks } from "../lib/lease-renewal/sheet-links";
import {
  createTestSetRunReference,
  formatTestSetCaptureSummary,
  formatTestSetRefusal,
  S63RunError,
  safeTestSetFailureCode,
} from "../lib/lease-renewal/test-set-run-output";
import { loadTestSetRuntimeConfig } from "../lib/lease-renewal/test-set-runtime-config";
import { assertTestSetSheetBindingIdentity } from "../lib/lease-renewal/test-set-source-binding";

function loadLocalEnv(root: string): void {
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && match[1] && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  } catch {
    // Ambient environment remains authoritative when no local env file exists.
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new S63RunError("required_environment_missing");
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
  const root = process.cwd();
  loadLocalEnv(root);
  const runtime = loadTestSetRuntimeConfig({ rootDir: root });
  const runReference = createTestSetRunReference();

  const rentvine = new RentVineClient(
    {
      baseUrl: requireEnv("RENTVINE_API_BASE_URL"),
      apiKey: requireEnv("RENTVINE_API_KEY"),
      apiSecret: requireEnv("RENTVINE_API_SECRET"),
    },
    createFetchTransport({ timeoutMs: 30_000 }),
  );
  const exportResult = await rentvine.listAllLeasesExport();
  if (!exportResult.complete) {
    throw new S63RunError("rentvine_export_incomplete");
  }
  const views = leaseViewsFromExport(exportResult.rows);
  // S102: base rent comes from the documented lease detail, never from the export unit's rent.
  await enrichLeaseViewsWithDetail(views, rentvine);

  const sheetReader = new GoogleSheetsApiReader(
    requireEnv("SHEETS_IMPERSONATE_SA"),
    requireEnv("SHEETS_DWD_SUBJECT"),
  );
  const sheetRead = await readRenewalSheetGridsWithLinks({
    reader: sheetReader,
    spreadsheetId: requireEnv("RENEWAL_SHEET_ID"),
    tabTitles: ["Lease Renewal"],
  });
  const grid = sheetRead.tables[0];
  if (!grid) throw new S63RunError("sheet_grid_missing");
  const resolution = resolveHeaders(grid, RENEWAL_TAB_SCHEMAS.Renewals ?? []);
  if (resolution.headerRowIndex === null) {
    throw new S63RunError("sheet_headers_unresolved");
  }

  // Resolve every secure binding before opening the app-plane store. Missing source evidence
  // therefore produces no partial baseline write.
  const prepared: CaptureTestSetBaselineInput[] = [];
  for (const binding of runtime.cases) {
    const view = findLeaseViewById(views, binding.leaseId);
    const row = grid[binding.sheetRowNumber - 1];
    if (!view || !row) {
      throw new S63RunError("source_binding_unresolved");
    }
    assertTestSetSheetBindingIdentity({
      leaseId: binding.leaseId,
      rowJoinId: sheetRead.tableJoinIds[0]?.[binding.sheetRowNumber - 1] ?? null,
    });
    const sheetRow: Record<string, string> = {};
    for (const [field, columnIndex] of Object.entries(resolution.resolvedFields)) {
      const cell = row[columnIndex];
      if (typeof cell === "string" && cell.trim() !== "") {
        sheetRow[field] = cell;
      }
    }
    const tenants = (view as { tenants?: unknown[] }).tenants;
    prepared.push({
      leaseId: binding.leaseId,
      sheetRowNumber: binding.sheetRowNumber,
      rentvineFacts: {
        leaseId: binding.leaseId,
        leaseEnd: leaseEndDateIso(view) ?? null,
        currentRent: leaseCurrentRent(view) ?? null,
        tenantCount: Array.isArray(tenants) ? tenants.length : null,
        addressLabel: leaseAddressLabel(view) ?? null,
        portfolioId: leasePortfolioId(view) ?? null,
      },
      sheetRow,
    });
  }

  const db = getLiveFirestore();
  let capturedCount = 0;
  let reusedCount = 0;
  for (const input of prepared) {
    const existing = await getTestSetBaseline(runtime.actor, input.leaseId, db);
    if (existing) {
      if (!verifyTestSetBaselineHash(existing)) {
        throw new S63RunError("baseline_hash_invalid");
      }
      if (!testSetBaselineMatchesInput(existing, input)) {
        throw new S63RunError("baseline_source_conflict");
      }
      reusedCount += 1;
      continue;
    }

    try {
      await captureTestSetBaseline(runtime.actor, input, db);
      capturedCount += 1;
    } catch {
      // A concurrent create is acceptable only when readback proves the exact immutable binding.
      const after = await getTestSetBaseline(runtime.actor, input.leaseId, db);
      if (!after) {
        throw new S63RunError("app_plane_write_failed");
      }
      if (!verifyTestSetBaselineHash(after)) {
        throw new S63RunError("baseline_hash_invalid");
      }
      if (!testSetBaselineMatchesInput(after, input)) {
        throw new S63RunError("baseline_source_conflict");
      }
      reusedCount += 1;
    }
  }

  console.log(
    formatTestSetCaptureSummary({
      runReference,
      configuredCount: runtime.cases.length,
      capturedCount,
      reusedCount,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      formatTestSetRefusal({
        operation: "capture",
        code: safeTestSetFailureCode(error),
      }),
    );
    process.exitCode = 1;
  });
}
