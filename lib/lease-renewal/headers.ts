// Position-independent header resolution for the renewal sheet connector (Phase-1, read-only).
//
// The map (docs/products/lease-renewal-spreadsheet-map.md §7) warns: do NOT trust headers
// blindly. Header rows are not always row 0 (Owner-Onboarding is off-by-one), some headers are
// blank or a leaked `FALSE` checkbox default, and some columns hold the wrong kind of data
// (Move-In `Move in date` holds emails). This module resolves each physical column to a semantic
// field by *content* — matching the detected header row against a per-tab schema — flags columns
// it cannot resolve as MURKY rather than guessing, and reports header/data shape mismatches. Pure
// and deterministic; no I/O, no external system.

import { normalizeHeaderText } from "@/lib/lease-renewal/fingerprint";
import type { RawGrid } from "@/lib/lease-renewal/sheet-types";

export type ColumnExpectedShape =
  | "date"
  | "currency"
  | "yes_no"
  | "boolean"
  | "email"
  | "text";

export interface ColumnSchemaField {
  key: string;
  /** Normalized header phrases that resolve to this field (position-independent). */
  headerPhrases: readonly string[];
  /** Coarse value shape expected in this column; used to flag header/data mismatches. */
  expectedShape?: ColumnExpectedShape;
}

export interface ResolvedColumn {
  index: number;
  rawHeader: string;
  field: string | null;
  status: "resolved" | "murky";
}

export interface HeaderDataMismatch {
  field: string;
  index: number;
  expectedShape: ColumnExpectedShape;
  observedShape: ColumnExpectedShape;
}

export interface HeaderResolution {
  /** Detected header row, or null when no row matches the schema. */
  headerRowIndex: number | null;
  /** Rows that appear before the header row (off-by-one artifacts); surfaced, never mapped. */
  preHeaderRowCount: number;
  columns: ResolvedColumn[];
  /** Resolved field key -> physical column index. */
  resolvedFields: Record<string, number>;
  murkyColumns: ResolvedColumn[];
  mismatches: HeaderDataMismatch[];
}

/** Rows scanned from the top when locating the header row. */
const MAX_HEADER_SCAN_ROWS = 6;

// Per-tab column schemas (subset of the map §2 columns most relevant to Phase-1 automation).
export const RENEWAL_TAB_SCHEMAS: Record<string, readonly ColumnSchemaField[]> = {
  Renewals: [
    { key: "owner_pricing_confirmed", headerPhrases: ["have we confirmed pricing with the owner"], expectedShape: "yes_no" },
    { key: "renewal_letter_sent", headerPhrases: ["have we sent the renewal letter"], expectedShape: "text" },
    { key: "tenant_name", headerPhrases: ["what is the lease tenant name"], expectedShape: "text" },
    { key: "renewal_date", headerPhrases: ["renewal date"], expectedShape: "date" },
    { key: "current_rent", headerPhrases: ["current rent"], expectedShape: "currency" },
    { key: "market_value", headerPhrases: ["market value"], expectedShape: "currency" },
    { key: "renewal_completed", headerPhrases: ["is this renewal completed"], expectedShape: "text" },
    { key: "tenant_responded", headerPhrases: ["have they responded if they are renewing or not"], expectedShape: "text" },
    { key: "info_form_sent", headerPhrases: ["have we sent the google form to gather info"], expectedShape: "yes_no" },
    { key: "form_returned", headerPhrases: ["have they filled out the form"], expectedShape: "yes_no" },
    { key: "lease_docs_sent", headerPhrases: ["have the lease docs been sent out"], expectedShape: "text" },
    { key: "rhino_renewed", headerPhrases: ["if they have a rhino policy is it renewed"], expectedShape: "text" },
    { key: "pet_registered", headerPhrases: ["have they registered their pet if needed"], expectedShape: "text" },
    { key: "esign_complete", headerPhrases: ["have all documents been signed electronically"], expectedShape: "yes_no" },
    { key: "additional_insured_verified", headerPhrases: ["have we verified that we are added as additional insured"], expectedShape: "text" },
    {
      key: "recurring_charge_added",
      headerPhrases: ["have we added the 11 95 charge to their ledger starting on the renewal date"],
      expectedShape: "yes_no",
    },
    { key: "added_to_inspection_sheet", headerPhrases: ["have we added them to the inspection sheet if needed"], expectedShape: "yes_no" },
    { key: "air_filter_setup", headerPhrases: ["did we set up their air filter delivery"], expectedShape: "text" },
    { key: "utility_proof", headerPhrases: ["did we get proof that utilities are set up if need be"], expectedShape: "text" },
  ],
  "Move-In Checklist": [
    { key: "move_in_date", headerPhrases: ["move in date"], expectedShape: "date" },
    { key: "tenant_name", headerPhrases: ["what is the lease tenant name"], expectedShape: "text" },
    { key: "processing_fee_collected", headerPhrases: ["have we collected the processing fee"], expectedShape: "yes_no" },
    { key: "esign_complete", headerPhrases: ["have all documents been signed electronically"], expectedShape: "yes_no" },
    { key: "certified_funds_received", headerPhrases: ["have we received certified funds"], expectedShape: "yes_no" },
  ],
  "Move-Out Checklist": [
    { key: "tenant_name", headerPhrases: ["name"], expectedShape: "text" },
    { key: "scheduled_move_out_date", headerPhrases: ["scheduled move out date"], expectedShape: "date" },
    { key: "notice_given", headerPhrases: ["have they put in their notice"], expectedShape: "text" },
    { key: "deposit_disposition_sent", headerPhrases: ["deposit disposition sent"], expectedShape: "yes_no" },
    { key: "everything_finalized", headerPhrases: ["everything finalized"], expectedShape: "yes_no" },
  ],
  "Inspection Tracker": [
    { key: "address", headerPhrases: ["address"], expectedShape: "text" },
    { key: "lease_start", headerPhrases: ["lease start"], expectedShape: "date" },
    { key: "inspections_cadence", headerPhrases: ["inspections"], expectedShape: "text" },
    { key: "inspections_2024", headerPhrases: ["2024 inspections"], expectedShape: "boolean" },
    { key: "last_inspection", headerPhrases: ["last inspection"], expectedShape: "date" },
    { key: "next_inspection", headerPhrases: ["next inspection"], expectedShape: "date" },
    {
      key: "owner_charge_130",
      headerPhrases: ["130 charge to owner for missed inspection added to the invoice sheet"],
      expectedShape: "yes_no",
    },
  ],
  "Property Attributes": [
    { key: "property", headerPhrases: ["property"], expectedShape: "text" },
    { key: "unit", headerPhrases: ["unit"], expectedShape: "text" },
    { key: "smart_locks", headerPhrases: ["updated to kwickset smart locks"], expectedShape: "yes_no" },
    { key: "utilities_needed", headerPhrases: ["utilities needed"], expectedShape: "text" },
    { key: "lawn_care", headerPhrases: ["lawn care"], expectedShape: "text" },
    { key: "inspections_cadence", headerPhrases: ["inspections"], expectedShape: "text" },
    { key: "appliances", headerPhrases: ["appliances provided"], expectedShape: "text" },
    { key: "notes", headerPhrases: ["notes"], expectedShape: "text" },
  ],
  "Owner Onboarding": [
    { key: "property", headerPhrases: ["property"], expectedShape: "text" },
    { key: "owner", headerPhrases: ["owner"], expectedShape: "text" },
    { key: "pma_sent", headerPhrases: ["pma sent"], expectedShape: "yes_no" },
    { key: "pma_signed", headerPhrases: ["pma signed"], expectedShape: "yes_no" },
  ],
};

const MONTH_NAMES =
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/;

/** Coarse value-shape classifier (a lightweight precursor to the full NormalizedValue typer). */
export function coarseShape(rawValue: string): ColumnExpectedShape {
  const value = rawValue.trim();
  if (value === "") return "text";
  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)) return "email";
  if (/^\$\s?\d[\d,]*(\.\d{2})?$/.test(value)) return "currency";
  if (/^(true|false)$/i.test(value)) return "boolean";
  if (/^(yes|no|n\/a|na|y)$/i.test(value)) return "yes_no";
  if (
    /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value) || // M/D/YY(YY) or MM-DD-YYYY
    /^\d{1,2}\/\d{4}$/.test(value) || // MM/YYYY
    MONTH_NAMES.test(value.toLowerCase())
  ) {
    return "date";
  }
  return "text";
}

function detectHeaderRow(
  grid: RawGrid,
  schema: readonly ColumnSchemaField[],
): number | null {
  const phrases = new Set(schema.flatMap((field) => field.headerPhrases));
  let bestRow: number | null = null;
  let bestCount = 0;
  const scanLimit = Math.min(grid.length, MAX_HEADER_SCAN_ROWS);

  for (let row = 0; row < scanLimit; row++) {
    let count = 0;
    for (const cell of grid[row]) {
      if (phrases.has(normalizeHeaderText(cell))) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestRow = row;
    }
  }

  return bestCount > 0 ? bestRow : null;
}

function mostFrequentShape(values: string[]): { shape: ColumnExpectedShape; count: number } {
  const tally = new Map<ColumnExpectedShape, number>();
  for (const value of values) {
    const shape = coarseShape(value);
    tally.set(shape, (tally.get(shape) ?? 0) + 1);
  }
  let best: ColumnExpectedShape = "text";
  let count = 0;
  for (const [shape, n] of tally) {
    if (n > count) {
      best = shape;
      count = n;
    }
  }
  return { shape: best, count };
}

/**
 * Resolve a tab's columns against its schema, position-independently. Detects the header row
 * (handling off-by-one), maps each column to a field by content, flags unresolved columns as
 * MURKY, and reports columns whose data shape contradicts the header's expected shape.
 */
export function resolveHeaders(
  grid: RawGrid,
  schema: readonly ColumnSchemaField[],
): HeaderResolution {
  const headerRowIndex = detectHeaderRow(grid, schema);
  if (headerRowIndex === null) {
    return {
      headerRowIndex: null,
      preHeaderRowCount: 0,
      columns: [],
      resolvedFields: {},
      murkyColumns: [],
      mismatches: [],
    };
  }

  const headerRow = grid[headerRowIndex];
  const dataRows = grid.slice(headerRowIndex + 1);
  const columns: ResolvedColumn[] = [];
  const resolvedFields: Record<string, number> = {};
  const mismatches: HeaderDataMismatch[] = [];

  headerRow.forEach((rawHeader, index) => {
    const normalized = normalizeHeaderText(rawHeader);
    const field =
      normalized === ""
        ? undefined
        : schema.find((candidate) => candidate.headerPhrases.includes(normalized));

    if (!field) {
      columns.push({ index, rawHeader, field: null, status: "murky" });
      return;
    }

    columns.push({ index, rawHeader, field: field.key, status: "resolved" });
    // First resolved column wins a field key if a header repeats.
    if (resolvedFields[field.key] === undefined) {
      resolvedFields[field.key] = index;
    }

    if (field.expectedShape && field.expectedShape !== "text") {
      const samples = dataRows
        .map((row) => (row[index] ?? "").trim())
        .filter((value) => value !== "");
      if (samples.length > 0) {
        const { shape, count } = mostFrequentShape(samples);
        if (
          shape !== "text" &&
          shape !== field.expectedShape &&
          count > samples.length / 2
        ) {
          mismatches.push({
            field: field.key,
            index,
            expectedShape: field.expectedShape,
            observedShape: shape,
          });
        }
      }
    }
  });

  return {
    headerRowIndex,
    preHeaderRowCount: headerRowIndex,
    columns,
    resolvedFields,
    murkyColumns: columns.filter((column) => column.status === "murky"),
    mismatches,
  };
}
