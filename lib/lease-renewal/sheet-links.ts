// Bridge the live Sheet hyperlink layer to the pipeline's RentVine-id join (Phase-1 read-only).
//
// The tracking sheet hyperlinks each row back to its RentVine dashboard. Read with FORMULA rendering,
// each such cell surfaces as `=HYPERLINK("url","text")`; this module turns one FORMULA `batchGet`
// response into the pipeline's two parallel inputs — `tables` (display grids) and `tableJoinIds`
// (per-row RentVine ids) — so the id-join runs on real data. Pure composition; the only I/O is the
// injected reader's FORMULA read.

import {
  batchGetToTables,
  valuesToGridWithLinks,
  type SheetsBatchGetResponse,
} from "@/lib/google-sheets/sheet-to-grids";
import { PROOF_NOTE_PREFIX } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { rentvineReferencesForGrid } from "@/lib/lease-renewal/rentvine-link";
import type { RawGrid } from "@/lib/lease-renewal/sheet-types";
import type {
  ReadRenewalSheetOptions,
  SheetsValuesReader,
} from "@/lib/google-sheets/read-client";

export interface TablesWithJoinIds {
  tables: RawGrid[];
  /** Parallel to `tables`: the RentVine join id per row (or null). Pass straight to the pipeline. */
  tableJoinIds: (string | null)[][];
  /** Parallel source-provided RentVine URL per row. It is validated again before rendering. */
  tableRentvineSourceUrls: (string | null)[][];
}

/** Pure: a FORMULA `values:batchGet` response → display grids + per-row RentVine join ids. */
export function formulaResponseToTablesWithJoinIds(
  response: SheetsBatchGetResponse,
): TablesWithJoinIds {
  const tables: RawGrid[] = [];
  const tableJoinIds: (string | null)[][] = [];
  const tableRentvineSourceUrls: (string | null)[][] = [];
  for (const valueRange of response.valueRanges ?? []) {
    const { grid, links } = valuesToGridWithLinks(valueRange.values);
    const references = rentvineReferencesForGrid(grid, links);
    tables.push(grid);
    tableJoinIds.push(references.map((reference) => reference?.joinId ?? null));
    tableRentvineSourceUrls.push(
      references.map((reference) => reference?.sourceUrl ?? null),
    );
  }
  return { tables, tableJoinIds, tableRentvineSourceUrls };
}

/**
 * Pair evaluated cell values with the FORMULA-only hyperlink layer. Ordinary formulas must retain
 * their evaluated value in the reconciliation grid; only HYPERLINK formulas contribute URLs.
 */
export function sheetResponsesToTablesWithJoinIds(
  evaluatedResponse: SheetsBatchGetResponse,
  formulaResponse: SheetsBatchGetResponse,
): TablesWithJoinIds {
  const tables = batchGetToTables(evaluatedResponse);
  const formulaRanges = formulaResponse.valueRanges ?? [];
  if (tables.length !== formulaRanges.length) {
    throw new Error(
      "The evaluated and FORMULA Sheet reads returned different range counts.",
    );
  }
  const tableJoinIds: (string | null)[][] = [];
  const tableRentvineSourceUrls: (string | null)[][] = [];
  tables.forEach((table, tableIndex) => {
    const { links } = valuesToGridWithLinks(formulaRanges[tableIndex]?.values);
    const references = rentvineReferencesForGrid(table, links);
    tableJoinIds.push(references.map((reference) => reference?.joinId ?? null));
    tableRentvineSourceUrls.push(
      references.map((reference) => reference?.sourceUrl ?? null),
    );
  });
  return { tables, tableJoinIds, tableRentvineSourceUrls };
}

export interface RenewalSheetReadWithLinks extends TablesWithJoinIds {
  titles: string[];
}

/**
 * Read the in-scope tabs as evaluated values plus a FORMULA hyperlink layer (both read-only) →
 * titles + display grids + per-row RentVine join ids. Throws if the injected reader has no FORMULA
 * read. The paired reads intentionally prevent an ordinary formula from entering reconciliation as
 * literal `=...` text.
 */
export async function readRenewalSheetGridsWithLinks(
  options: ReadRenewalSheetOptions,
): Promise<RenewalSheetReadWithLinks> {
  const reader: SheetsValuesReader = options.reader;
  if (!reader.batchGetFormulas) {
    throw new Error(
      "This Sheets reader does not support a FORMULA read, which the RentVine-id link join requires.",
    );
  }
  const titles = options.tabTitles ?? (await reader.listTabTitles(options.spreadsheetId));
  const [evaluatedResponse, formulaResponse] = await Promise.all([
    reader.batchGet(options.spreadsheetId, titles),
    reader.batchGetFormulas(options.spreadsheetId, titles),
  ]);
  const result = sheetResponsesToTablesWithJoinIds(evaluatedResponse, formulaResponse);
  // S98: rows machine-marked with the exact proof-note prefix are excluded from every downstream
  // projection. The live reader supplies the note layer; a reader without it changes nothing.
  if (reader.batchGetNotes) {
    const notesByTab = await reader.batchGetNotes(options.spreadsheetId, titles);
    titles.forEach((title, tableIndex) => {
      const notes = notesByTab[title];
      if (!notes) return;
      const keep = (result.tables[tableIndex] ?? []).map(
        (_row, rowIndex) =>
          !(notes[rowIndex] ?? []).some(
            (note) => typeof note === "string" && note.startsWith(PROOF_NOTE_PREFIX),
          ),
      );
      result.tables[tableIndex] = (result.tables[tableIndex] ?? []).filter(
        (_row, rowIndex) => keep[rowIndex],
      );
      result.tableJoinIds[tableIndex] = (result.tableJoinIds[tableIndex] ?? []).filter(
        (_id, rowIndex) => keep[rowIndex],
      );
      result.tableRentvineSourceUrls[tableIndex] = (
        result.tableRentvineSourceUrls[tableIndex] ?? []
      ).filter((_url, rowIndex) => keep[rowIndex]);
    });
  }
  return { titles, ...result };
}
