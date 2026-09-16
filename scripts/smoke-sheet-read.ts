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
import { valuesToGridWithLinks } from "../lib/google-sheets/sheet-to-grids";
import {
  getHealthCheckContract,
  runHealthCheck,
} from "../lib/integrations/health-checks";
import {
  leaseViewId,
  leaseViewsFromExport,
} from "../lib/integrations/rentvine/lease-mapper";
import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "../lib/lease-renewal/headers";
import { buildLiveRenewalConfig } from "../lib/lease-renewal/live-config";
import { parseRentvineRef, rentvineRefId } from "../lib/lease-renewal/rentvine-link";
import {
  classifyRowLinkRepresentation,
  mergeLinkLayers,
  type RowLinkRepresentation,
} from "../lib/lease-renewal/sheet-links";
import {
  PROOF_NOTE_PREFIX,
  parseRowNote,
} from "../lib/lease-renewal/sheet-writeback/proposal-contract";

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

/** True when keyless domain-wide delegation is configured (SA mints the Sheets token itself). */
function isUsingDwd(): boolean {
  const env = loadEnvLocal();
  const get = (name: string): string => (process.env[name] ?? env[name] ?? "").trim();
  return Boolean(get("SHEETS_IMPERSONATE_SA") && get("SHEETS_DWD_SUBJECT"));
}

function adcRemediation(): string {
  // With DWD, the SA mints the Sheets-readonly token; ADC only needs the default cloud-platform
  // scope to call iamcredentials.signJwt. Requesting the Sheets scope on the gcloud client is a
  // RESTRICTED scope the managed pmikcmetro.com domain blocks ("This app is blocked").
  if (isUsingDwd()) {
    return [
      "The Sheets read uses keyless domain-wide delegation, so ADC only needs the default cloud-platform scope.",
      "Re-auth once as josiah@pmikcmetro.com (free, no spend) — do NOT add the Sheets scope, the managed domain blocks it:",
      "  gcloud auth application-default login",
      "then re-run: npm run smoke:sheet-read -- --live",
    ].join("\n");
  }
  return [
    "The Sheets read needs Application Default Credentials with the read-only Sheets scope.",
    "Run this once as josiah@pmikcmetro.com (free, no spend):",
    "  gcloud auth application-default login --scopes=openid,https://www.googleapis.com/auth/spreadsheets.readonly,https://www.googleapis.com/auth/cloud-platform",
    "then re-run: npm run smoke:sheet-read -- --live",
  ].join("\n");
}

// --- S116 read-only link inspection ---------------------------------------------------------------
// `--inspect-links --live` traces how every data row of the operating tab carries its RentVine
// reference across the three representations the app can read (a `=HYPERLINK()` formula, a bare
// URL as cell text, a link attached to the cell text) and cross-checks the rows against the live
// RentVine lease set. Output is COUNTS-ONLY: no cell value, name, id or row number is printed or
// written, so the artifact can be quoted in records without carrying customer data.

interface LinkInspection {
  tab: string;
  headerRowIndex: number | null;
  dataRows: number;
  blankRows: number;
  proofRows: number;
  rowsWithAppNote: number;
  representation: Record<RowLinkRepresentation, number>;
  richTextOnlyRowsWithLeaseRef: number;
  rowsWithUnitRefOnly: number;
  rowsWithMultipleDistinctRefs: number;
  /** Rows carrying a RentVine reference in more than one cell (even to the same lease): the exact
   * join refuses such a row as an ambiguous destination, so a nonzero count needs attention. */
  rowsWithMultipleLinkedCells: number;
  cellsWithConflictingRefs: number;
  duplicateLeaseRefs: number;
  rentvine: {
    exportComplete: boolean;
    exportLeases: number;
    linkedRowsMatchingExportLease: number;
    richTextOnlyRowsMatchingExportLease: number;
    exportLeasesWithoutAnyLinkedRow: number;
  } | null;
}

async function inspectLinkRepresentations(
  reader: GoogleSheetsApiReader,
  spreadsheetId: string,
  tab: string,
  env: Record<string, string | undefined>,
): Promise<LinkInspection> {
  const [evaluated, formulas, notesByTab, richByTab] = await Promise.all([
    reader.batchGet(spreadsheetId, [tab]),
    reader.batchGetFormulas(spreadsheetId, [tab]),
    reader.batchGetNotes(spreadsheetId, [tab]),
    reader.batchGetRichLinks(spreadsheetId, [tab]),
  ]);
  const grid = valuesToGridWithLinks(evaluated.valueRanges?.[0]?.values).grid;
  const formulaLayer = valuesToGridWithLinks(formulas.valueRanges?.[0]?.values);
  const notes = notesByTab[tab] ?? [];
  const rich = richByTab[tab] ?? [];
  const header = resolveHeaders(grid, RENEWAL_TAB_SCHEMAS.Renewals);
  const tenantColumn = header.resolvedFields.tenant_name;

  const inspection: LinkInspection = {
    tab,
    headerRowIndex: header.headerRowIndex,
    dataRows: 0,
    blankRows: 0,
    proofRows: 0,
    rowsWithAppNote: 0,
    representation: { formula: 0, bare_url: 0, rich_text: 0, none: 0 },
    richTextOnlyRowsWithLeaseRef: 0,
    rowsWithUnitRefOnly: 0,
    rowsWithMultipleDistinctRefs: 0,
    rowsWithMultipleLinkedCells: 0,
    cellsWithConflictingRefs: 0,
    duplicateLeaseRefs: 0,
    rentvine: null,
  };
  const leaseRefRows = new Map<string, number>();
  const richOnlyLeaseIds = new Set<string>();
  const start = (header.headerRowIndex ?? -1) + 1;
  for (let rowIndex = start; rowIndex < grid.length; rowIndex += 1) {
    const cells = grid[rowIndex] ?? [];
    if (cells.every((cell) => cell.trim() === "")) {
      inspection.blankRows += 1;
      continue;
    }
    const rowNotes = notes[rowIndex] ?? [];
    if (rowNotes.some((note) => note?.startsWith(PROOF_NOTE_PREFIX))) {
      inspection.proofRows += 1;
      continue;
    }
    inspection.dataRows += 1;
    const note = tenantColumn === undefined ? "" : (rowNotes[tenantColumn] ?? "");
    if (note && parseRowNote(note)) inspection.rowsWithAppNote += 1;

    const formulaLinks = formulaLayer.links[rowIndex] ?? cells.map(() => null);
    const cellLinks = rich[rowIndex] ?? cells.map(() => []);
    const representation = classifyRowLinkRepresentation({
      cells,
      formulas: (formulaLayer.grid[rowIndex] ?? []).map(String),
      formulaLinks,
      cellLinks,
    });
    inspection.representation[representation] += 1;

    let merged: (string | null)[] = [];
    try {
      merged = mergeLinkLayers([formulaLinks], [cellLinks])[0];
    } catch {
      inspection.cellsWithConflictingRefs += 1;
      continue;
    }
    const refs = new Set<string>();
    let linkedCells = 0;
    merged.forEach((link, columnIndex) => {
      const id = rentvineRefId(parseRentvineRef(link ?? cells[columnIndex] ?? ""));
      if (id) {
        refs.add(id);
        linkedCells += 1;
      }
    });
    if (refs.size > 1) inspection.rowsWithMultipleDistinctRefs += 1;
    if (linkedCells > 1) inspection.rowsWithMultipleLinkedCells += 1;
    const leaseIds = [...refs].filter((id) => id.startsWith("lease:"));
    if (refs.size > 0 && leaseIds.length === 0) inspection.rowsWithUnitRefOnly += 1;
    if (leaseIds.length === 1) {
      const leaseId = leaseIds[0].slice("lease:".length);
      leaseRefRows.set(leaseId, (leaseRefRows.get(leaseId) ?? 0) + 1);
      if (representation === "rich_text") {
        inspection.richTextOnlyRowsWithLeaseRef += 1;
        richOnlyLeaseIds.add(leaseId);
      }
    }
  }
  inspection.duplicateLeaseRefs = [...leaseRefRows.values()].filter((n) => n > 1).length;

  const config = buildLiveRenewalConfig(env);
  if (config.ok) {
    const exportRead = await config.rentvineClient.listAllLeasesExport();
    const exportIds = new Set(
      leaseViewsFromExport(exportRead.rows)
        .map((lease) => leaseViewId(lease))
        .filter((id): id is string => Boolean(id)),
    );
    const linked = [...leaseRefRows.keys()].filter((id) => exportIds.has(id));
    inspection.rentvine = {
      exportComplete: exportRead.complete,
      exportLeases: exportIds.size,
      linkedRowsMatchingExportLease: linked.length,
      richTextOnlyRowsMatchingExportLease: linked.filter((id) => richOnlyLeaseIds.has(id))
        .length,
      exportLeasesWithoutAnyLinkedRow: [...exportIds].filter(
        (id) => !leaseRefRows.has(id),
      ).length,
    };
  }
  return inspection;
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

  if (hasArg("--inspect-links")) {
    const tab = readArg("--tab") ?? "Lease Renewal";
    const inspection = await inspectLinkRepresentations(reader, spreadsheetId, tab, {
      ...localEnv,
      ...process.env,
    });
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, "link-inspection.json"),
      JSON.stringify(inspection, null, 2),
      "utf8",
    );
    console.log(`Link inspection (LIVE, counts only) for tab "${tab}":`);
    console.log(JSON.stringify(inspection, null, 2));
    console.log(
      `Counts-only inspection written to ${join(artifactDir, "link-inspection.json")} (gitignored).`,
    );
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
