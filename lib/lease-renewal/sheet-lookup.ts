// S158: the operator-selected operating-Sheet lookup, read from the lease-bound working record.
// Staff can point the app at the actual tab and row for a lease, or at one cell for one existing
// recognized field, inside the configured workbook. The selection is application information:
// saving it reads and writes no provider, it is labelled as a selection (never as a match), and it
// never widens what a supported Sheet update may write. Pure; safe for the browser bundle.

import {
  SHEET_CELL_FIELDS,
  WorkingSheetCellSchema,
  WorkingSheetRowSchema,
  sheetCellFieldOf,
  workingEntry,
  type RenewalWorkingRecord,
  type WorkingSheetCell,
  type WorkingSheetRow,
} from "@/lib/lease-renewal/working-record";

export interface SheetLookupSelection<T> {
  readonly value: T;
  /** The staff account that chose this location, as the server recorded it. */
  readonly selectedBy: string;
  readonly selectedAtIso: string;
  readonly revision: number;
}

export interface OperatingSheetLookupBinding {
  /** The row staff chose for this lease, or null for the automatic lookup. */
  readonly row: SheetLookupSelection<WorkingSheetRow> | null;
  /** One selected cell per recognized field; a field without one follows the row. */
  readonly cells: Readonly<Record<string, SheetLookupSelection<WorkingSheetCell>>>;
}

export const NO_SHEET_LOOKUP_BINDING: OperatingSheetLookupBinding = Object.freeze({
  row: null,
  cells: Object.freeze({}),
});

/** The lease's saved selection. A cleared or malformed entry is simply no selection. */
export function sheetLookupBinding(
  record: RenewalWorkingRecord | null | undefined,
): OperatingSheetLookupBinding {
  if (!record) return NO_SHEET_LOOKUP_BINDING;
  const rowEntry = workingEntry(record, "sheet_row");
  const row = WorkingSheetRowSchema.safeParse(rowEntry?.value);
  const cells: Record<string, SheetLookupSelection<WorkingSheetCell>> = {};
  for (const field of SHEET_CELL_FIELDS) {
    const entry = workingEntry(record, `sheet_cell.${field}`);
    const cell = WorkingSheetCellSchema.safeParse(entry?.value);
    if (entry && cell.success)
      cells[field] = {
        value: cell.data,
        selectedBy: entry.recordedByLabel,
        selectedAtIso: entry.recordedAt,
        revision: entry.revision,
      };
  }
  return {
    row:
      rowEntry && row.success
        ? {
            value: row.data,
            selectedBy: rowEntry.recordedByLabel,
            selectedAtIso: rowEntry.recordedAt,
            revision: rowEntry.revision,
          }
        : null,
    cells,
  };
}

export function hasSheetLookupSelection(binding: OperatingSheetLookupBinding): boolean {
  return binding.row !== null || Object.keys(binding.cells).length > 0;
}

/** True for a working-record field that carries part of the Sheet lookup selection. */
export function isSheetLookupField(field: string): boolean {
  return field === "sheet_row" || sheetCellFieldOf(field) !== null;
}

// --- A1 helpers ------------------------------------------------------------------------------

export function columnLetters(index: number): string {
  let value = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return letters;
}

export function parseSheetCell(
  cell: string,
): { columnIndex: number; rowNumber: number } | null {
  const match = /^([A-Z]{1,3})([1-9][0-9]{0,5})$/.exec(cell.trim().toUpperCase());
  if (!match) return null;
  let columnIndex = 0;
  for (const letter of match[1])
    columnIndex = columnIndex * 26 + (letter.charCodeAt(0) - 64);
  return { columnIndex: columnIndex - 1, rowNumber: Number(match[2]) };
}

/** The quoted A1 tab prefix: `'Lease Renewal'`. */
export function quoteSheetTab(title: string): string {
  return `'${title.replaceAll("'", "''")}'`;
}

export function sheetCellA1(columnIndex: number, rowNumber: number): string {
  return `${columnLetters(columnIndex)}${rowNumber}`;
}

// --- The selection in the desk join ----------------------------------------------------------

/** Every lease's selected row, for the one bulk desk read. */
export function sheetRowBindingsFromWorkingRecords(
  records: Iterable<RenewalWorkingRecord> | ReadonlyMap<string, RenewalWorkingRecord>,
): Map<string, WorkingSheetRow> {
  const out = new Map<string, WorkingSheetRow>();
  // A Map yields its records through values(); so does an array or a set of records.
  const list = [...(records as { values(): Iterable<RenewalWorkingRecord> }).values()];
  for (const record of list) {
    const row = sheetLookupBinding(record).row;
    if (row) out.set(record.leaseId, row.value);
  }
  return out;
}

/**
 * A join id that joins nothing: it marks a row the operator retired from a lease, so the read
 * pipeline neither joins it by id nor falls back to a name match for that lease.
 */
export const OPERATOR_UNSELECTED_JOIN_PREFIX = "operator-unselected:";

export type OperatorRowBindingSkipReason =
  | "tab_not_read"
  | "row_outside_tab"
  | "row_links_another_lease"
  | "row_selected_twice";

/**
 * Apply the operators' row selections to the read pipeline's join layer. The selected physical
 * row joins its lease by exact id and any other row that joined that lease by id is retired. A row
 * that carries another lease's exact link is never taken from that lease, a tab that was not read
 * cannot be bound, and one row cannot serve two leases. Pure: the Sheet is never changed.
 */
export function applyOperatorRowBindings(input: {
  readonly titles: readonly string[];
  readonly tableJoinIds: readonly (readonly (string | null)[])[];
  readonly bindings: ReadonlyMap<string, WorkingSheetRow>;
}): {
  tableJoinIds: (string | null)[][];
  applied: Map<string, { tableIndex: number; rowIndex: number }>;
  skipped: Map<string, OperatorRowBindingSkipReason>;
} {
  const tableJoinIds = input.tableJoinIds.map((rows) => [...rows]);
  const applied = new Map<string, { tableIndex: number; rowIndex: number }>();
  const skipped = new Map<string, OperatorRowBindingSkipReason>();
  const taken = new Set<string>();
  const leaseIds = [...input.bindings.keys()].sort((a, b) => a.localeCompare(b));
  for (const leaseId of leaseIds) {
    const binding = input.bindings.get(leaseId)!;
    const tableIndex = input.titles.indexOf(binding.tabTitle);
    if (tableIndex === -1) {
      skipped.set(leaseId, "tab_not_read");
      continue;
    }
    const rowIndex = binding.rowNumber - 1;
    const rows = tableJoinIds[tableIndex] ?? [];
    if (rowIndex >= rows.length) {
      skipped.set(leaseId, "row_outside_tab");
      continue;
    }
    const key = `${tableIndex}:${rowIndex}`;
    if (taken.has(key)) {
      skipped.set(leaseId, "row_selected_twice");
      continue;
    }
    const existing = input.tableJoinIds[tableIndex]?.[rowIndex] ?? null;
    const own = `lease:${leaseId}`;
    if (existing !== null && existing.startsWith("lease:") && existing !== own) {
      skipped.set(leaseId, "row_links_another_lease");
      continue;
    }
    for (let table = 0; table < tableJoinIds.length; table += 1)
      for (let row = 0; row < tableJoinIds[table].length; row += 1)
        if (tableJoinIds[table][row] === own)
          tableJoinIds[table][row] = `${OPERATOR_UNSELECTED_JOIN_PREFIX}${own}`;
    tableJoinIds[tableIndex][rowIndex] = own;
    taken.add(key);
    applied.set(leaseId, { tableIndex, rowIndex });
  }
  return { tableJoinIds, applied, skipped };
}
