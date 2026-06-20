// Read-side ingest pipeline for the renewal sheet connector (Phase-1, read-only).
//
// Composes the deterministic units into one read pass over the flattened export (a list of
// back-to-back sub-tables):
//   - Unit 1: hard-exclude credential tabs (4 & 7) at the boundary and never emit their cells;
//             a content guard also catches credential tables fingerprinting failed to recognize.
//   - Unit 2: drop `-----`/`.`/blank divider rows and re-stitch a headerless fractured fragment
//             onto the preceding recognized tab when their widths match.
//   - Unit 7: assemble one record per data row and emit a COUNTS-ONLY IngestManifest; rows wider
//             than the header cannot be aligned, so the tab is reported Blocked (fail-closed) and
//             row-conservation (records + ragged == data rows) is preserved.
//
// Pure and deterministic; no I/O, no credentials, no external system. The manifest carries only
// counts/field-keys/statuses — never a cell value — so it is safe to log or persist.

import { fingerprintTab, normalizeHeaderText } from "@/lib/lease-renewal/fingerprint";
import {
  RENEWAL_TAB_SCHEMAS,
  resolveHeaders,
  type ColumnSchemaField,
} from "@/lib/lease-renewal/headers";
import {
  normalizeCell,
  type NormalizedType,
  type NormalizedValue,
} from "@/lib/lease-renewal/normalized-value";
import type { RawGrid, RawRow } from "@/lib/lease-renewal/sheet-types";

export interface IngestRecord {
  tab: string;
  tabNumber: number | null;
  /** Row index within the (divider-stripped, re-stitched) tab grid; header is row 0. */
  sourceRowIndex: number;
  fields: Record<string, NormalizedValue>;
}

export type TabIngestStatus = "ok" | "blocked";

export interface TabIngestSummary {
  tab: string;
  tabNumber: number | null;
  dataRowCount: number;
  recordCount: number;
  murkyColumnCount: number;
  mismatchCount: number;
  status: TabIngestStatus;
  blockedReason?: string;
}

export interface ExcludedTab {
  tab: string;
  tabNumber: number | null;
  reason: string;
}

export interface IngestManifest {
  tabsRecognized: number;
  tabsUnrecognized: number;
  credentialTabsExcluded: number;
  dividerRowsDropped: number;
  unrecognizedRowCount: number;
  totalRecords: number;
  perTab: TabIngestSummary[];
}

export interface IngestResult {
  records: IngestRecord[];
  manifest: IngestManifest;
  /** Metadata only — excluded tabs carry a label and reason, never any cell value. */
  excludedTabs: ExcludedTab[];
}

// Header tokens that mark a credential-bearing table even when fingerprinting fails. Two distinct
// hits are required so legitimate tabs (which contain none) are never falsely excluded.
const CREDENTIAL_HEADER_INDICATORS = ["password", "username", "platform", "pin", "wifi"];
const CREDENTIAL_INDICATOR_THRESHOLD = 2;

function isDividerRow(row: RawRow): boolean {
  return row.every((cell) => {
    const trimmed = cell.trim();
    return trimmed === "" || /^-+$/.test(trimmed) || /^\.+$/.test(trimmed);
  });
}

function isAllEmpty(row: RawRow): boolean {
  return row.every((cell) => cell.trim() === "");
}

function dropDividers(grid: RawGrid): { cleaned: RawRow[]; dropped: number } {
  const cleaned: RawRow[] = [];
  let dropped = 0;
  for (const row of grid) {
    if (isDividerRow(row)) {
      dropped++;
    } else {
      cleaned.push(row);
    }
  }
  return { cleaned, dropped };
}

/** Credential guard: fingerprint says credential-bearing, or the header tokens show ≥2 indicators. */
function isCredentialSuspect(grid: RawGrid, fingerprintCredential: boolean): boolean {
  if (fingerprintCredential) return true;
  const tokens = new Set(
    grid
      .slice(0, 3)
      .flat()
      .flatMap((cell) => normalizeHeaderText(cell).split(" ")),
  );
  const hits = CREDENTIAL_HEADER_INDICATORS.filter((indicator) =>
    tokens.has(indicator),
  ).length;
  return hits >= CREDENTIAL_INDICATOR_THRESHOLD;
}

function nameHint(fieldKey: string): NormalizedType | undefined {
  return fieldKey.includes("name") || fieldKey === "owner" ? "name" : undefined;
}

function padRow(row: RawRow, width: number): string[] {
  const padded = [...row];
  while (padded.length < width) padded.push("");
  return padded;
}

interface RecognizedGroup {
  tab: string;
  tabNumber: number | null;
  width: number;
  rows: RawRow[]; // header row first, then data rows (incl. re-stitched fragments)
}

/**
 * Ingest the flattened export (an ordered list of sub-tables) into typed records plus a
 * counts-only manifest. Credential tabs are dropped at the boundary; fractured fragments are
 * re-stitched by width; misaligned rows mark their tab Blocked.
 */
export function ingestTables(tables: RawGrid[]): IngestResult {
  const recognizedGroups: RecognizedGroup[] = [];
  const excludedTabs: ExcludedTab[] = [];
  let dividerRowsDropped = 0;
  let unrecognizedRowCount = 0;
  let tabsUnrecognized = 0;
  let lastRecognized: RecognizedGroup | null = null;

  for (const table of tables) {
    const { cleaned, dropped } = dropDividers(table);
    dividerRowsDropped += dropped;
    if (cleaned.length === 0) continue;

    const fingerprint = fingerprintTab(cleaned);

    if (isCredentialSuspect(cleaned, fingerprint.credentialBearing)) {
      excludedTabs.push({
        tab:
          fingerprint.tab === "UNRECOGNIZED" ? "suspected-credential" : fingerprint.tab,
        tabNumber: fingerprint.tabNumber,
        reason: "credential-bearing tab hard-excluded at the connector boundary",
      });
      // Hard exclusion: the table's cells never enter records, the manifest, or lastRecognized.
      continue;
    }

    if (fingerprint.tab !== "UNRECOGNIZED") {
      const group: RecognizedGroup = {
        tab: fingerprint.tab,
        tabNumber: fingerprint.tabNumber,
        width: cleaned[0].length,
        rows: [...cleaned],
      };
      recognizedGroups.push(group);
      lastRecognized = group;
      continue;
    }

    // Unrecognized fragment: re-stitch onto the preceding recognized tab only when widths match.
    if (lastRecognized && cleaned[0].length === lastRecognized.width) {
      lastRecognized.rows.push(...cleaned);
    } else {
      tabsUnrecognized++;
      unrecognizedRowCount += cleaned.length;
    }
  }

  const records: IngestRecord[] = [];
  const perTab: TabIngestSummary[] = [];

  for (const group of recognizedGroups) {
    const schema: readonly ColumnSchemaField[] = RENEWAL_TAB_SCHEMAS[group.tab] ?? [];
    const resolution = resolveHeaders(group.rows, schema);

    if (resolution.headerRowIndex === null) {
      perTab.push({
        tab: group.tab,
        tabNumber: group.tabNumber,
        dataRowCount: Math.max(group.rows.length - 1, 0),
        recordCount: 0,
        murkyColumnCount: 0,
        mismatchCount: 0,
        status: "blocked",
        blockedReason: "no header row could be resolved",
      });
      continue;
    }

    const headerRow = group.rows[resolution.headerRowIndex];
    const dataRows = group.rows.slice(resolution.headerRowIndex + 1);
    let dataRowCount = 0;
    let raggedRows = 0;
    let tabRecordCount = 0;

    dataRows.forEach((row, offset) => {
      if (isAllEmpty(row)) return;
      dataRowCount++;
      if (row.length > headerRow.length) {
        raggedRows++;
        return;
      }
      const padded = padRow(row, headerRow.length);
      const sourceRowIndex = resolution.headerRowIndex! + 1 + offset;
      const fields: Record<string, NormalizedValue> = {};
      for (const [fieldKey, columnIndex] of Object.entries(resolution.resolvedFields)) {
        fields[fieldKey] = normalizeCell(
          padded[columnIndex] ?? "",
          { tab: group.tab, row: sourceRowIndex, column: fieldKey },
          nameHint(fieldKey),
        );
      }
      records.push({
        tab: group.tab,
        tabNumber: group.tabNumber,
        sourceRowIndex,
        fields,
      });
      tabRecordCount++;
    });

    perTab.push({
      tab: group.tab,
      tabNumber: group.tabNumber,
      dataRowCount,
      recordCount: tabRecordCount,
      murkyColumnCount: resolution.murkyColumns.length,
      mismatchCount: resolution.mismatches.length,
      status: raggedRows > 0 ? "blocked" : "ok",
      ...(raggedRows > 0
        ? {
            blockedReason: `${raggedRows} row(s) had more columns than the header and could not be aligned`,
          }
        : {}),
    });
  }

  const manifest: IngestManifest = {
    tabsRecognized: recognizedGroups.length,
    tabsUnrecognized,
    credentialTabsExcluded: excludedTabs.length,
    dividerRowsDropped,
    unrecognizedRowCount,
    totalRecords: records.length,
    perTab,
  };

  return { records, manifest, excludedTabs };
}
