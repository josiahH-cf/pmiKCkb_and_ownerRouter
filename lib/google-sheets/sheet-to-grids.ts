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
