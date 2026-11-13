// S278 R-S278-3 / R-S278-4 / R-S278-5: the order, the limit and the words of a lease row's listed
// Sheet cells reviewed together. Pure and client-safe, shared by the Finish up list, the Sheet
// preview and the server so each names the same cells in the same order.

import {
  SHEET_FIELD_LABELS,
  type SheetEditableField,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";

/** R-S278-4: one confirmation applies at most this many cells of one lease row. */
export const SHEET_SET_MAX_CELLS = 10;

const FIELD_ORDER = Object.keys(SHEET_FIELD_LABELS) as SheetEditableField[];

/** The list order of a Sheet field: the order of the recognized fields. */
export function sheetFieldListOrder(field: string): number {
  const index = FIELD_ORDER.indexOf(field as SheetEditableField);
  return index < 0 ? FIELD_ORDER.length : index;
}

/** The entries in list order, each field once (the first entry for a field wins). */
export function orderSheetSetEntries<T extends { readonly field: string }>(
  entries: readonly T[],
): T[] {
  const seen = new Set<string>();
  return [...entries]
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        sheetFieldListOrder(a.entry.field) - sheetFieldListOrder(b.entry.field) ||
        a.index - b.index,
    )
    .map(({ entry }) => entry)
    .filter((entry) => {
      if (seen.has(entry.field)) return false;
      seen.add(entry.field);
      return true;
    });
}

/** R-S278-4: the first ten in list order, and what remains for the next review. */
export function takeSheetSet<T extends { readonly field: string }>(
  entries: readonly T[],
): { readonly taken: T[]; readonly remaining: T[] } {
  const ordered = orderSheetSetEntries(entries);
  return {
    taken: ordered.slice(0, SHEET_SET_MAX_CELLS),
    remaining: ordered.slice(SHEET_SET_MAX_CELLS),
  };
}

export function sheetFieldLabel(field: string): string {
  return (SHEET_FIELD_LABELS as Record<string, string | undefined>)[field] ?? field;
}

function list(labels: readonly string[]): string {
  return labels.join(", ");
}

/** The exact words of the combined review, its confirmation and its outcome. */
export const SHEET_SET_WORDS = {
  review: (count: number) => `Review all ${count} Sheet updates`,
  apply: (count: number) => `Apply ${count} Sheet updates`,
  heading: (count: number) => `Review ${count} Sheet updates together`,
  intro:
    "One confirmation applies these cells of this lease's one row, in this order. Each cell still has its own one-attempt claim, read-back and receipt.",
  remaining: (count: number) =>
    count === 1
      ? "1 more Sheet update remains for the next review."
      : `${count} more Sheet updates remain for the next review.`,
  changed: (labels: readonly string[]) =>
    `The Sheet changed since this preview: ${list(labels)}. Review the updates again.`,
  rowChanged: "the lease's row",
  headerChanged: "the column headings",
  recordChanged: "the recorded values",
  written: (labels: readonly string[]) => `Written: ${list(labels)}.`,
  stopped: (label: string, reason: string) => `Not applied: ${label}. ${reason}`,
  unattempted: (labels: readonly string[]) => `Not attempted: ${list(labels)}.`,
  stopNote:
    "The run stopped at the first cell that did not apply. Nothing retries on its own; prepare a fresh preview to try the rest.",
  allWritten: (count: number) =>
    count === 1
      ? "The Sheet update was applied, read back and receipted."
      : `All ${count} Sheet updates were applied, read back and receipted.`,
  alreadyRun:
    "These Sheet updates were already confirmed once. Their results show below; prepare a fresh preview for anything not applied.",
  cellSelected:
    "This field uses a selected Sheet cell, so its update is reviewed on its own.",
  needsTwo:
    "Review all needs two or more pending Sheet updates. Prepare this update on its own.",
  openFirst: "Finish or discard the open update first",
} as const;
