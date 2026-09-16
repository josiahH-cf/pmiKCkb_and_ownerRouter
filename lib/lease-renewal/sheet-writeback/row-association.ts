// S116: one fresh, server-owned association between a RentVine lease and its operating Sheet row.
//
// The association governs presentation, update and absence-before-append (ARCH-S116-2). Only a
// complete one-to-one check that finds no row for this exact lease is a confirmed absence; every
// other outcome short of an exact row is ambiguous and blocks both append and update for this
// lease. Names are inspection evidence only: a plausible unlinked row is reported so a person can
// add the lease link in the Sheet, and it is never promoted into a durable join. Pure; no I/O.

import { proposeJoin } from "@/lib/lease-renewal/join";
import {
  PROOF_NOTE_PREFIX,
  parseRowNote,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";

export type OperatingSheetAmbiguityReason =
  | "multiple_rows"
  | "conflicting_identity"
  | "unit_link_only"
  | "plausible_unlinked_row"
  | "metadata_incomplete";

export type OperatingSheetRowAssociation =
  | { kind: "exact_link"; rowNumber: number }
  | { kind: "app_note"; rowNumber: number }
  | { kind: "absent_confirmed" }
  | {
      kind: "ambiguous";
      reason: OperatingSheetAmbiguityReason;
      /** 1-based physical Sheet rows a person should look at; absent for a read-level reason. */
      rowNumbers?: number[];
    };

export interface OperatingSheetRowAssociationInput {
  /** The raw operating tab as read (evaluated values), including pre-header and divider rows. */
  rawTable: readonly (readonly string[])[];
  /** Per raw row: the merged exact RentVine join id (`lease:<id>` or `unit:<id>`) or null. */
  rawJoins: readonly (string | null)[];
  /** Per raw row and cell: the cell note or null. */
  rawNotes: readonly (readonly (string | null)[])[];
  headerRowIndex: number;
  tenantColumnIndex: number;
  leaseId: string;
  propertyId: string;
  unitId: string | null;
  /** The lease's source-backed tenant label, compared the way the read pipeline compares names. */
  tenantName: string;
  /** Which read layers the source actually supplied; a missing layer cannot confirm absence. */
  layers: { notes: boolean; cellLinks: boolean };
}

/** Rows below the header that are neither blank nor sealed proof rows. */
function candidateRowIndexes(input: OperatingSheetRowAssociationInput): number[] {
  const out: number[] = [];
  for (
    let rowIndex = input.headerRowIndex + 1;
    rowIndex < input.rawTable.length;
    rowIndex += 1
  ) {
    const cells = input.rawTable[rowIndex] ?? [];
    if (cells.every((cell) => cell.trim() === "")) continue;
    const notes = input.rawNotes[rowIndex] ?? [];
    if (notes.some((note) => note?.startsWith(PROOF_NOTE_PREFIX))) continue;
    out.push(rowIndex);
  }
  return out;
}

/**
 * Classify the lease's row association from one complete raw read. Exact evidence (a lease link
 * or the app's own normal note) wins; two exact rows, a link and note that disagree, a unit-only
 * link, an unlinked row carrying the tenant's name and an incomplete read are each reported as
 * ambiguous with their reason. Absence is confirmed only when every layer was read and none of
 * those signals exists.
 */
export function associateOperatingSheetRow(
  input: OperatingSheetRowAssociationInput,
): OperatingSheetRowAssociation {
  const expectedJoin = `lease:${input.leaseId}`;
  const unitJoin = input.unitId ? `unit:${input.unitId}` : null;
  const rows = candidateRowIndexes(input);

  const exact: { rowIndex: number; kind: "exact_link" | "app_note" }[] = [];
  const conflicting: number[] = [];
  const unitOnly: number[] = [];
  const unlinked: number[] = [];
  for (const rowIndex of rows) {
    const join = input.rawJoins[rowIndex] ?? null;
    const note = input.rawNotes[rowIndex]?.[input.tenantColumnIndex] ?? "";
    const parsedNote = note ? parseRowNote(note) : null;
    const noteForLease =
      parsedNote !== null && !parsedNote.proof && parsedNote.leaseId === input.leaseId;
    if (
      parsedNote &&
      !parsedNote.proof &&
      ((join !== null &&
        join !== `lease:${parsedNote.leaseId}` &&
        (noteForLease || join === expectedJoin)) ||
        (noteForLease && parsedNote.propertyId !== input.propertyId))
    ) {
      conflicting.push(rowIndex);
      continue;
    }
    if (join === expectedJoin) {
      exact.push({ rowIndex, kind: "exact_link" });
      continue;
    }
    if (noteForLease) {
      exact.push({ rowIndex, kind: "app_note" });
      continue;
    }
    if (unitJoin && join === unitJoin) {
      unitOnly.push(rowIndex);
      continue;
    }
    if (join === null && parsedNote === null) unlinked.push(rowIndex);
  }

  const rowNumbers = (indexes: number[]): number[] => indexes.map((index) => index + 1);
  if (conflicting.length > 0) {
    return {
      kind: "ambiguous",
      reason: "conflicting_identity",
      rowNumbers: rowNumbers(conflicting),
    };
  }
  if (exact.length > 1) {
    return {
      kind: "ambiguous",
      reason: "multiple_rows",
      rowNumbers: rowNumbers(exact.map((entry) => entry.rowIndex)),
    };
  }
  if (!input.layers.notes) {
    // Without the note layer a sealed proof row or an app-appended row is indistinguishable
    // from an ordinary row, so neither an exact row nor an absence can be asserted.
    return { kind: "ambiguous", reason: "metadata_incomplete" };
  }
  if (exact.length === 1) {
    return { kind: exact[0].kind, rowNumber: exact[0].rowIndex + 1 };
  }
  if (!input.layers.cellLinks) {
    return { kind: "ambiguous", reason: "metadata_incomplete" };
  }
  if (unitOnly.length > 0) {
    return {
      kind: "ambiguous",
      reason: "unit_link_only",
      rowNumbers: rowNumbers(unitOnly),
    };
  }
  const tenantName = input.tenantName.trim();
  const plausible = tenantName
    ? unlinked.filter((rowIndex) => {
        const cell = (input.rawTable[rowIndex]?.[input.tenantColumnIndex] ?? "").trim();
        return cell !== "" && proposeJoin(cell, tenantName, "name").status !== "no_match";
      })
    : [];
  if (plausible.length > 0) {
    return {
      kind: "ambiguous",
      reason: "plausible_unlinked_row",
      rowNumbers: rowNumbers(plausible),
    };
  }
  return { kind: "absent_confirmed" };
}

/** Why an append preview is refused for this association, or null when the append may proceed. */
export function appendIntentRefusal(
  association: OperatingSheetRowAssociation,
): "row_state_mismatch" | "row_join_ambiguous" | null {
  if (association.kind === "absent_confirmed") return null;
  if (association.kind === "ambiguous") return "row_join_ambiguous";
  return "row_state_mismatch";
}

/** Plain-English explanation of an ambiguous association and the correction a person makes. */
export function describeOperatingSheetAmbiguity(
  association: Extract<OperatingSheetRowAssociation, { kind: "ambiguous" }>,
): string {
  const rows = association.rowNumbers ?? [];
  const where =
    rows.length === 0
      ? ""
      : rows.length === 1
        ? ` Look at row ${rows[0]}.`
        : ` Look at rows ${rows.slice(0, -1).join(", ")} and ${rows[rows.length - 1]}.`;
  switch (association.reason) {
    case "multiple_rows":
      return `More than one Sheet row links to this lease. The app does not add or update a row until one row is this lease's current row. Keep the current row's RentVine lease link and remove or relink the others in the Sheet, then refresh.${where}`;
    case "conflicting_identity":
      return `A Sheet row's RentVine link and its app note name different leases or properties. Correct that row in the Sheet, then refresh.${where}`;
    case "unit_link_only":
      return `A Sheet row links to this lease's unit rather than the lease. Replace that link with this lease's RentVine link in the Sheet, then refresh.${where}`;
    case "plausible_unlinked_row":
      return `A Sheet row carries this tenant's name but no RentVine lease link the app can read. Add this lease's RentVine link to that row in the Sheet, then refresh. The app does not add a second row.${where}`;
    case "metadata_incomplete":
      return "The Sheet read did not include the row notes and links the app needs to confirm whether this lease has a row. Refresh; if this continues, the Sheet connection needs attention before any row is added or updated in the Sheet.";
  }
}
