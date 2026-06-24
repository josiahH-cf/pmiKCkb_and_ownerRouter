// Pure adapter: Google Sheets `values:batchGet` response -> RawGrid[] (Phase-1 live Sheet read).
//
// `ingestTables(tables: RawGrid[])` already does the credential-tab hard-exclusion, fingerprinting,
// header resolution, and normalization, so the live Sheet read only has to turn the Sheets values
// payload into RawGrid[] (one grid per requested tab range). Pure and deterministic: no I/O, no auth.
// Sheets returns jagged rows (trailing empty cells omitted) and typed scalars; this coerces every
// cell to a string so the grids match the synthetic SAMPLE_RENEWAL_TABLES shape.

import type { RawGrid } from "@/lib/lease-renewal/sheet-types";

export interface SheetsValueRange {
  range?: string;
  majorDimension?: string;
  values?: unknown[][];
}

export interface SheetsBatchGetResponse {
  spreadsheetId?: string;
  valueRanges?: SheetsValueRange[];
}

function coerceCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

/** Coerce a Sheets values matrix into a RawGrid (every cell a string; jagged rows preserved). */
export function valuesToGrid(values: unknown[][] | undefined): RawGrid {
  if (!values) return [];
  return values.map((row) => (Array.isArray(row) ? row.map(coerceCell) : []));
}

/** One grid per value range, keyed by the returned A1 range (carries the tab title). */
export function batchGetToGrids(
  response: SheetsBatchGetResponse,
): { range: string; grid: RawGrid }[] {
  return (response.valueRanges ?? []).map((valueRange) => ({
    range: valueRange.range ?? "",
    grid: valuesToGrid(valueRange.values),
  }));
}

/** The flattened RawGrid[] the pipeline consumes (order preserved from the batchGet request). */
export function batchGetToTables(response: SheetsBatchGetResponse): RawGrid[] {
  return batchGetToGrids(response).map((entry) => entry.grid);
}

// --- Hyperlink layer (Phase-1 read-only) ---------------------------------------------------------
// Read with valueRenderOption=FORMULA so a cell that hyperlinks back to RentVine surfaces as
// `=HYPERLINK("url","text")`. The display grid keeps the text; a parallel link grid keeps the url, so
// the pipeline can join a row to a lease by the RentVine ID inside the url (see lease-renewal/rentvine-link).

/** Parse a `=HYPERLINK("url"[,"text"])` formula cell into its url + display text, else null. */
export function parseHyperlinkFormula(
  cell: string,
): { url: string; text: string } | null {
  const match = cell
    .trim()
    .match(/^=HYPERLINK\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,\s*"((?:[^"\\]|\\.)*)")?\s*\)$/i);
  if (!match) return null;
  return { url: match[1], text: match[2] ?? match[1] };
}

export interface GridWithLinks {
  /** Display text per cell (HYPERLINK text when present), matching the values-mode grid shape. */
  grid: RawGrid;
  /** The url per cell when the cell is a HYPERLINK formula, else null. Same shape as `grid`. */
  links: (string | null)[][];
}

/** Coerce a FORMULA-rendered values matrix into a display grid plus a parallel hyperlink-url grid. */
export function valuesToGridWithLinks(values: unknown[][] | undefined): GridWithLinks {
  if (!values) return { grid: [], links: [] };
  const grid: string[][] = [];
  const links: (string | null)[][] = [];
  for (const row of values) {
    const cells = Array.isArray(row) ? row : [];
    const gridRow: string[] = [];
    const linkRow: (string | null)[] = [];
    for (const cell of cells) {
      const text = coerceCell(cell);
      const hyperlink = parseHyperlinkFormula(text);
      gridRow.push(hyperlink ? hyperlink.text : text);
      linkRow.push(hyperlink ? hyperlink.url : null);
    }
    grid.push(gridRow);
    links.push(linkRow);
  }
  return { grid, links };
}
