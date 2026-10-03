// S158: the backend read of an operator-selected operating-Sheet location. It uses only the
// existing read-only workbook reader on the configured workbook: the tab list, the top rows that
// identify a credential tab exactly as ingestion does, and the one selected row or cell range.
// It returns what it observed with honest provenance (selected by whom, read when) and reports
// an unreadable, missing or invalid selection as that selection's problem, nothing more. No
// writer is constructed here and no value is ever guessed.

import type { SheetsValuesReader } from "@/lib/google-sheets/read-client";
import { batchGetToTables } from "@/lib/google-sheets/sheet-to-grids";
import {
  REDACTED_CREDENTIAL,
  carriesCredentialContent,
} from "@/lib/lease-renewal/credential-guard";
import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "@/lib/lease-renewal/headers";
import { isCredentialTabGrid } from "@/lib/lease-renewal/ingest";
import {
  columnLetters,
  parseSheetCell,
  quoteSheetTab,
  type OperatingSheetLookupBinding,
} from "@/lib/lease-renewal/sheet-lookup";
import { SHEET_FIELD_LABELS } from "@/lib/lease-renewal/sheet-writeback/field-intent";
import type { RawGrid } from "@/lib/lease-renewal/sheet-types";

/** Rows read from the top of each tab to recognize headers and credential tabs. */
const TAB_HEAD_ROWS = 12;
/** The widest row the app reads (matches the service's header read). */
const LAST_COLUMN = "AZ";

export interface SheetLookupCellValue {
  readonly cell: string;
  readonly header: string;
  /** The recognized field this column maps to, or null for any other column. */
  readonly field: string | null;
  readonly label: string;
  readonly value: string;
}

export interface SheetLookupRowRead {
  readonly tabTitle: string;
  readonly rowNumber: number;
  readonly provenance: "operator_selected";
  readonly selectedBy: string;
  readonly selectedAtIso: string;
  readonly state: "read" | "problem";
  readonly readAtIso?: string;
  /** True when the tab's header resolves to the recognized renewal columns. */
  readonly headerRecognized?: boolean;
  /** Non-blank cells of the selected row (and every recognized column, blank or not). */
  readonly cells?: readonly SheetLookupCellValue[];
  readonly problem?: string;
}

export interface SheetLookupCellRead {
  readonly field: string;
  readonly label: string;
  readonly tabTitle: string;
  readonly cell: string;
  readonly provenance: "operator_selected";
  readonly selectedBy: string;
  readonly selectedAtIso: string;
  readonly state: "read" | "problem";
  readonly readAtIso?: string;
  readonly value?: string;
  readonly problem?: string;
}

export interface OperatingSheetLookupView {
  readonly readAtIso: string;
  readonly tabs:
    | { readonly state: "available"; readonly titles: readonly string[] }
    | { readonly state: "unavailable"; readonly problem: string };
  readonly row: SheetLookupRowRead | null;
  readonly cells: readonly SheetLookupCellRead[];
}

function fieldLabel(field: string): string {
  if (field === "tenant_name") return "Lease or tenant name";
  if (field === "owner_emails") return "Owner emails";
  if (field === "tenant_emails") return "Tenant emails";
  return (SHEET_FIELD_LABELS as Record<string, string | undefined>)[field] ?? field;
}

function scrub(value: string): string {
  return carriesCredentialContent(value) ? REDACTED_CREDENTIAL : value;
}

/** Plain words for a failed Sheet read, from the status the provider answered with. */
export function describeSheetReadProblem(error: unknown, what: string): string {
  const status = /HTTP (\d{3})/.exec(error instanceof Error ? error.message : "")?.[1];
  if (status === "400")
    return `${what} could not be read. It is outside the rows and columns of that tab.`;
  if (status === "401" || status === "403")
    return `${what} could not be read. The app's Sheet connection does not have permission to read the configured workbook.`;
  if (status === "404")
    return `${what} could not be read. The configured workbook was not found.`;
  if (status === "429")
    return `${what} could not be read. The Sheet is answering too many requests; try again shortly.`;
  return `${what} could not be read just now. The Sheet did not answer; try again shortly.`;
}

function tabProblem(
  tabTitle: string,
  titles: readonly string[] | null,
  credential: ReadonlySet<string>,
  tabsProblem: string | null,
): string | null {
  // The tabs could not be listed and classified, so this tab is not known to be one the app
  // reads. Nothing is read from it: a credential tab must never be reached through a failed check.
  if (titles === null)
    return `${tabsProblem ?? "The workbook's tab list could not be read just now."} This selection was not read.`;
  if (credential.has(tabTitle))
    return `Tab "${tabTitle}" is not one the app reads. Choose a tab from the list.`;
  if (!titles.includes(tabTitle))
    return `Tab "${tabTitle}" is not in the configured workbook. Choose a tab from the list.`;
  return null;
}

/**
 * Read the lease's selected locations. One failed read never takes another selection with it,
 * and an unavailable workbook is reported for the lookup only.
 */
export async function readOperatingSheetLookup(input: {
  reader: SheetsValuesReader;
  spreadsheetId: string;
  binding: OperatingSheetLookupBinding;
  nowIso?: string;
}): Promise<OperatingSheetLookupView> {
  const readAtIso = input.nowIso ?? new Date().toISOString();
  const { reader, spreadsheetId, binding } = input;

  let titles: string[] | null = null;
  let heads = new Map<string, RawGrid>();
  const credential = new Set<string>();
  let tabsProblem: string | null = null;
  try {
    const listed = await reader.listTabTitles(spreadsheetId);
    const response = await reader.batchGet(
      spreadsheetId,
      listed.map((title) => `${quoteSheetTab(title)}!A1:${LAST_COLUMN}${TAB_HEAD_ROWS}`),
    );
    const grids = batchGetToTables(response);
    heads = new Map(listed.map((title, index) => [title, grids[index] ?? []]));
    for (const title of listed)
      if (isCredentialTabGrid(heads.get(title) ?? [])) credential.add(title);
    titles = listed.filter((title) => !credential.has(title));
  } catch (error) {
    tabsProblem = describeSheetReadProblem(error, "The workbook's tab list");
  }

  let row: SheetLookupRowRead | null = null;
  if (binding.row) {
    const { tabTitle, rowNumber } = binding.row.value;
    const base = {
      tabTitle,
      rowNumber,
      provenance: "operator_selected" as const,
      selectedBy: binding.row.selectedBy,
      selectedAtIso: binding.row.selectedAtIso,
    };
    const problem = tabProblem(tabTitle, titles, credential, tabsProblem);
    if (problem) row = { ...base, state: "problem", problem };
    else {
      try {
        const response = await reader.batchGet(spreadsheetId, [
          `${quoteSheetTab(tabTitle)}!A${rowNumber}:${LAST_COLUMN}${rowNumber}`,
        ]);
        const values = batchGetToTables(response)[0]?.[0] ?? [];
        const head = heads.get(tabTitle) ?? [];
        const resolution = resolveHeaders(head, RENEWAL_TAB_SCHEMAS.Renewals);
        const headerRecognized = resolution.headerRowIndex !== null;
        const headerRow = headerRecognized
          ? (head[resolution.headerRowIndex!] ?? [])
          : [];
        const fieldByColumn = new Map<number, string>();
        for (const [field, index] of Object.entries(resolution.resolvedFields))
          fieldByColumn.set(index, field);
        const width = Math.max(values.length, headerRow.length);
        const cells: SheetLookupCellValue[] = [];
        for (let index = 0; index < width; index += 1) {
          const field = fieldByColumn.get(index) ?? null;
          const header = headerRecognized ? (headerRow[index] ?? "").trim() : "";
          const value = scrub(values[index] ?? "");
          if (!field && value === "") continue;
          cells.push({
            cell: `${columnLetters(index)}${rowNumber}`,
            header,
            field,
            label: field ? fieldLabel(field) : header || `Column ${columnLetters(index)}`,
            value,
          });
        }
        row = { ...base, state: "read", readAtIso, headerRecognized, cells };
      } catch (error) {
        row = {
          ...base,
          state: "problem",
          problem: describeSheetReadProblem(
            error,
            `Row ${rowNumber} on tab "${tabTitle}"`,
          ),
        };
      }
    }
  }

  const cells: SheetLookupCellRead[] = [];
  for (const [field, selection] of Object.entries(binding.cells)) {
    const { tabTitle } = selection.value;
    const cell = selection.value.cell.toUpperCase();
    const base = {
      field,
      label: fieldLabel(field),
      tabTitle,
      cell,
      provenance: "operator_selected" as const,
      selectedBy: selection.selectedBy,
      selectedAtIso: selection.selectedAtIso,
    };
    const problem = tabProblem(tabTitle, titles, credential, tabsProblem);
    if (problem || !parseSheetCell(cell)) {
      cells.push({
        ...base,
        state: "problem",
        problem: problem ?? `Cell ${cell} is not one cell such as G42.`,
      });
      continue;
    }
    try {
      const response = await reader.batchGet(spreadsheetId, [
        `${quoteSheetTab(tabTitle)}!${cell}`,
      ]);
      const value = scrub(batchGetToTables(response)[0]?.[0]?.[0] ?? "");
      cells.push({ ...base, state: "read", readAtIso, value });
    } catch (error) {
      cells.push({
        ...base,
        state: "problem",
        problem: describeSheetReadProblem(error, `Cell ${cell} on tab "${tabTitle}"`),
      });
    }
  }

  return {
    readAtIso,
    tabs:
      titles !== null
        ? { state: "available", titles }
        : {
            state: "unavailable",
            problem: tabsProblem ?? "The workbook could not be read.",
          },
    row,
    cells,
  };
}
