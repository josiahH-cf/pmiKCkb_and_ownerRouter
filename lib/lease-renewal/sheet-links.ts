// Bridge the live Sheet hyperlink layer to the pipeline's RentVine-id join (Phase-1 read-only).
//
// The tracking sheet hyperlinks each row back to its RentVine dashboard. Read with FORMULA rendering,
// each such cell surfaces as `=HYPERLINK("url","text")`; this module turns one FORMULA `batchGet`
// response into the pipeline's two parallel inputs — `tables` (display grids) and `tableJoinIds`
// (per-row RentVine ids) — so the id-join runs on real data. Pure composition; the only I/O is the
// injected reader's FORMULA read.

import {
  valuesToGridWithLinks,
  type SheetsBatchGetResponse,
} from "@/lib/google-sheets/sheet-to-grids";
import { rentvineJoinIdsForGrid } from "@/lib/lease-renewal/rentvine-link";
import type { RawGrid } from "@/lib/lease-renewal/sheet-types";
import type {
  ReadRenewalSheetOptions,
  SheetsValuesReader,
} from "@/lib/google-sheets/read-client";

export interface TablesWithJoinIds {
  tables: RawGrid[];
  /** Parallel to `tables`: the RentVine join id per row (or null). Pass straight to the pipeline. */
  tableJoinIds: (string | null)[][];
}

/** Pure: a FORMULA `values:batchGet` response → display grids + per-row RentVine join ids. */
export function formulaResponseToTablesWithJoinIds(
  response: SheetsBatchGetResponse,
): TablesWithJoinIds {
  const tables: RawGrid[] = [];
  const tableJoinIds: (string | null)[][] = [];
  for (const valueRange of response.valueRanges ?? []) {
    const { grid, links } = valuesToGridWithLinks(valueRange.values);
    tables.push(grid);
    tableJoinIds.push(rentvineJoinIdsForGrid(grid, links));
  }
  return { tables, tableJoinIds };
}

export interface RenewalSheetReadWithLinks extends TablesWithJoinIds {
  titles: string[];
}

/**
 * Read the in-scope tabs with their hyperlink layer (read-only, one FORMULA batchGet) → titles +
 * display grids + per-row RentVine join ids. Throws if the injected reader has no FORMULA read.
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
  const response = await reader.batchGetFormulas(options.spreadsheetId, titles);
  return { titles, ...formulaResponseToTablesWithJoinIds(response) };
}
