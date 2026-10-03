// S158 (ARCH-S158-3): the operator's lookup selection becomes a Sheet update target only through
// the recognized field contract. A selected row is the target row for the existing mapped
// columns; a selected cell is a target only as that same field's mapped column in a lease row.
// Everything else the operator selected stays readable and is refused as a write target, with
// the limit named on that one update. Pure; no I/O.

import {
  parseSheetCell,
  sheetCellA1,
  type OperatingSheetLookupBinding,
} from "@/lib/lease-renewal/sheet-lookup";
import {
  PROOF_NOTE_PREFIX,
  parseRowNote,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import type { FreshOperatingSheetLeaseContext } from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import {
  describeOperatingSheetAmbiguity,
  type OperatorSelectionLimit,
} from "@/lib/lease-renewal/sheet-writeback/row-association";
import { SHEET_FIELD_LABELS } from "@/lib/lease-renewal/sheet-writeback/field-intent";

export type { OperatorSelectionLimit } from "@/lib/lease-renewal/sheet-writeback/row-association";

export type OperatorSheetTarget =
  | { readonly kind: "automatic" }
  | {
      readonly kind: "selected";
      readonly via: "row" | "cell";
      readonly tabTitle: string;
      readonly rowNumber: number;
      readonly cell?: string;
      /** Null when the selection is an eligible target; otherwise why it is read-only. */
      readonly limit: OperatorSelectionLimit | null;
    };

export interface OperatorSheetTargetInput {
  readonly binding: OperatingSheetLookupBinding;
  /** The field being prepared for an update; omitted for a display read. */
  readonly inspectField?: string;
  readonly operatingTabTitle: string;
  readonly rawTable: readonly (readonly string[])[];
  readonly rawJoins: readonly (string | null)[];
  readonly rawNotes: readonly (readonly (string | null)[])[];
  readonly headerRowIndex: number;
  readonly columns: ReadonlyMap<string, number>;
  readonly tenantColumnIndex: number;
  readonly leaseId: string;
  readonly propertyId: string;
}

/** Why a physical row of the operating tab cannot be this lease's update row, or null. */
function rowLimit(
  input: OperatorSheetTargetInput,
  rowNumber: number,
): OperatorSelectionLimit | null {
  const rowIndex = rowNumber - 1;
  if (rowIndex <= input.headerRowIndex) return "header_row";
  if (rowIndex >= input.rawTable.length) return "outside_rows";
  const notes = input.rawNotes[rowIndex] ?? [];
  if (notes.some((note) => note?.startsWith(PROOF_NOTE_PREFIX))) return "proof_row";
  const cells = input.rawTable[rowIndex] ?? [];
  if (cells.every((cell) => cell.trim() === "")) return "blank_row";
  const join = input.rawJoins[rowIndex] ?? null;
  if (join !== null && join.startsWith("lease:") && join !== `lease:${input.leaseId}`)
    return "other_lease";
  const note = notes[input.tenantColumnIndex] ?? "";
  const parsed = note ? parseRowNote(note) : null;
  if (
    parsed &&
    !parsed.proof &&
    (parsed.leaseId !== input.leaseId || parsed.propertyId !== input.propertyId)
  )
    return "other_lease";
  return null;
}

/** Resolve which selection, if any, governs this read or this one field's update. */
export function resolveOperatorSheetTarget(
  input: OperatorSheetTargetInput,
): OperatorSheetTarget {
  const cellSelection = input.inspectField
    ? input.binding.cells[input.inspectField]
    : undefined;
  if (cellSelection) {
    const { tabTitle } = cellSelection.value;
    const cell = cellSelection.value.cell.toUpperCase();
    const parsed = parseSheetCell(cell);
    const rowNumber = parsed?.rowNumber ?? 0;
    const base = {
      kind: "selected" as const,
      via: "cell" as const,
      tabTitle,
      rowNumber,
      cell,
    };
    if (tabTitle !== input.operatingTabTitle || !parsed)
      return { ...base, limit: "other_tab" };
    if (parsed.columnIndex !== input.columns.get(input.inspectField!))
      return { ...base, limit: "other_column" };
    return { ...base, limit: rowLimit(input, rowNumber) };
  }
  const row = input.binding.row;
  if (!row) return { kind: "automatic" };
  const { tabTitle, rowNumber } = row.value;
  const base = { kind: "selected" as const, via: "row" as const, tabTitle, rowNumber };
  if (tabTitle !== input.operatingTabTitle) return { ...base, limit: "other_tab" };
  return { ...base, limit: rowLimit(input, rowNumber) };
}

/** Plain words for a selection that stays readable but is not a write target. */
export function describeOperatorSelectionLimit(target: OperatorSheetTarget): string {
  if (target.kind !== "selected" || target.limit === null) return "";
  const where =
    target.via === "cell"
      ? `Cell ${target.cell} on tab "${target.tabTitle}"`
      : `Row ${target.rowNumber} on tab "${target.tabTitle}"`;
  const limit = {
    other_tab:
      "it is on a different tab from the operating renewal tab the app updates. The app updates recognized columns on the operating tab only",
    header_row: "it is the header row or above it, not a lease row",
    outside_rows: "it is beyond the rows the operating tab holds",
    blank_row: "it is a blank row, so the app has no lease to anchor an update to",
    proof_row: "it is a sealed test row the app never changes",
    other_lease: "it carries another lease's RentVine link or note",
    other_column:
      "it is not this field's column. An update to this field changes only that field's recognized column in a lease row",
  }[target.limit];
  return `${where} stays readable, but the app does not update it: ${limit}. Your working values are unchanged.`;
}

export interface OperatingSheetLookupCurrent {
  /** What the lease workspace read found for its Sheet facts and updates. */
  readonly state: "row" | "no_row" | "unresolved";
  readonly tabTitle: string;
  readonly rowNumber: number | null;
  readonly how: "automatic_link" | "automatic_note" | "operator_selected" | null;
  /** Why no row was found, or why a selected row is read-only; plain words. */
  readonly explanation: string | null;
  readonly values: readonly { field: string; label: string; value: string }[];
}

/** The lookup the lease workspace currently uses, for lease information. */
export function operatingSheetLookupCurrent(
  context: Pick<FreshOperatingSheetLeaseContext, "association" | "row"> | null,
  tabTitle: string,
): OperatingSheetLookupCurrent | null {
  if (!context) return null;
  const { association } = context;
  const values = Object.entries(context.row?.fieldValues ?? {})
    .filter(([field]) => field in SHEET_FIELD_LABELS)
    .map(([field, value]) => ({
      field,
      label: SHEET_FIELD_LABELS[field as keyof typeof SHEET_FIELD_LABELS],
      value,
    }));
  if (association.kind === "exact_link" || association.kind === "app_note")
    return {
      state: "row",
      tabTitle,
      rowNumber: association.rowNumber,
      how: association.kind === "exact_link" ? "automatic_link" : "automatic_note",
      explanation: null,
      values,
    };
  if (association.kind === "operator_selected")
    return {
      state: context.row ? "row" : "unresolved",
      tabTitle: association.tabTitle,
      rowNumber: association.rowNumber,
      how: "operator_selected",
      explanation:
        association.limit === null
          ? null
          : describeOperatorSelectionLimit({ ...association, kind: "selected" }),
      values,
    };
  if (association.kind === "absent_confirmed")
    return {
      state: "no_row",
      tabTitle,
      rowNumber: null,
      how: null,
      explanation:
        "The current read found no row for this lease on the operating tab. A supported append can add one.",
      values: [],
    };
  return {
    state: "unresolved",
    tabTitle,
    rowNumber: null,
    how: null,
    explanation: describeOperatingSheetAmbiguity(association),
    values: [],
  };
}

/** The A1 cell each recognized field's update would target on the operating tab. */
export function sheetFieldCells(
  context: Pick<FreshOperatingSheetLeaseContext, "columns" | "row" | "fieldCells"> | null,
): Record<string, string> {
  if (!context?.row) return {};
  const cells: Record<string, string> = {};
  for (const [field, index] of context.columns)
    cells[field] = sheetCellA1(index, context.row.rowNumber);
  return { ...cells, ...(context.fieldCells ?? {}) };
}
