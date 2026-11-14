// S278 R-S278-3 (ARCH-S278-2): Finish up's one list of the source updates the renewal still needs.
// It is a read projection over what the lease already holds: the recorded staff facts and their
// statuses (`sourceUpdates`), the reviewed Market value (R-S278-1), the app's own confirmed send,
// the Finish up previews from the working terms (RentVine and the Sheet renewal date), the page's
// Sheet read and the lease's open Sheet proposal. Showing it creates no proposal and no write.
// Each row leads to the existing exact preview and confirmation; when two or more recorded Sheet
// cells wait, the list also offers one review of the lease row's listed cells (R-S278-4).
//
// Pure and client-safe.

import { formatCalendarDate } from "@/lib/date-display";
import type { FinishUpPreparation } from "./finish-up-preparation";
import {
  marketValueBasis,
  type MarketValueSource,
  type ReviewedRecommendation,
} from "./market-value-source";
import { formatRentAmount } from "./rent-basis";
import {
  SHEET_FIELD_LABELS,
  type SheetEditableField,
} from "./sheet-writeback/field-intent";
import {
  SHEET_SET_MAX_CELLS,
  SHEET_SET_WORDS,
  sheetFieldListOrder,
} from "./sheet-writeback/set-words";
import type { RenewalWorkspaceState } from "./workspace-state";

/** The basis the Finish up previews name (the words of `FINISH_UP_TERMS_SOURCE`, server-side). */
const WORKING_TERMS_BASIS = "Working renewal terms";

/** The lease's open Sheet proposal as the page read it. */
export interface OpenSheetProposalView {
  readonly previewHash: string;
  readonly fields: readonly string[];
  /**
   * True once no cell can still run: every cell has a final outcome, or a combined run stopped
   * (R-S278-5) with nothing still running or uncertain.
   */
  readonly settled: boolean;
  /** The fields whose attempt was declined without change; each keeps its recovery on its row. */
  readonly failed?: readonly string[];
}

/** What the lease page read for the list, beyond the staff records. */
export interface SourceUpdatesPageInput {
  /** The Sheet row's current values by field; null when the page did not read the row. */
  readonly sheetValues: Readonly<Record<string, string>> | null;
  /** The lease's open Sheet proposal; null when none; undefined when the page did not read it. */
  readonly openSheetProposal?: OpenSheetProposalView | null;
  /** Finish up's previews from the final working terms. */
  readonly finishUp?: FinishUpPreparation | null;
}

export type SourceUpdateAction =
  | {
      readonly kind: "prepare_source";
      readonly field: SheetEditableField;
      readonly eventId: string;
    }
  | { readonly kind: "prepare_market_value" }
  | { readonly kind: "prepare_derived" }
  | { readonly kind: "open_form"; readonly previewKey: string };

export type SourceUpdateRowState = "pending" | "prepared" | "done" | "unavailable";

export interface SourceUpdateRow {
  /** "sheet:market_value", "sheet-terms:renewal_date", "rentvine:rentvine-dates". */
  readonly key: string;
  readonly source: "sheet" | "rentvine";
  readonly field: string;
  readonly label: string;
  /** The source's value now, in words; null when the page did not read it. */
  readonly current: string | null;
  readonly next: string;
  readonly basis: string;
  readonly state: SourceUpdateRowState;
  /** When the confirmed update's receipt was created, once read back. */
  readonly receiptAt: string | null;
  /** The recorded refusal or recovery for this row, when one is recorded. */
  readonly reason: string | null;
  readonly action: SourceUpdateAction | null;
  /** Another update is open: "Finish or discard the open update first". */
  readonly waitsForOpen: boolean;
  /** A recorded Sheet cell the combined review of the lease row can take. */
  readonly combinable: boolean;
}

export interface SourceUpdatesList {
  readonly rows: readonly SourceUpdateRow[];
  readonly pendingCount: number;
  /** "Source updates (5 pending)" */
  readonly heading: string;
  /** R-S278-4: the combined review offered when two or more recorded Sheet cells wait. */
  readonly combined: {
    readonly count: number;
    readonly label: string;
    readonly remaining: number;
    readonly entries: readonly {
      readonly field: SheetEditableField;
      readonly eventId: string;
    }[];
    readonly marketValue: boolean;
  } | null;
}

export const SOURCE_UPDATES_WORDS = {
  heading: "Source updates",
  headingPending: (count: number) => `Source updates (${count} pending)`,
  prepare: "Prepare and review",
  openFirst: SHEET_SET_WORDS.openFirst,
  prepared: "Prepared. Review it under Review Sheet updates and confirm it there.",
  preparedSet:
    "Prepared with the other listed Sheet updates. Review them together under Review Sheet updates.",
  done: (time: string) => `Done. Receipt ${time}.`,
  doneUntimed: "Done. Read back after the confirmed update.",
  notRead: "Not read",
  blank: "Blank",
  sheetNow: "In the Sheet now",
  rentvineNow: "In RentVine now",
  basis: "Basis",
  none: "No source update is recorded for this lease.",
  declined:
    "Not applied: the Sheet declined this update without a change. Read its recovery under Review Sheet updates, then prepare a fresh preview.",
  paused: "Sheet updates are paused. Saved in the app.",
} as const;

function labelOf(field: string): string {
  return (SHEET_FIELD_LABELS as Record<string, string | undefined>)[field] ?? field;
}

/** A recorded Sheet value in words. */
export function sheetValueWords(value: string | number | boolean): string {
  if (typeof value === "number") return formatRentAmount(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      return formatCalendarDate(value);
    } catch {
      return value;
    }
  }
  return value;
}

function currentWords(values: SourceUpdatesPageInput["sheetValues"], field: string) {
  if (!values) return null;
  const value = values[field];
  if (value === undefined) return null;
  return value.trim() === "" ? SOURCE_UPDATES_WORDS.blank : value;
}

function boundToRecommendation(
  entry: RenewalWorkspaceState["sourceUpdates"][string] | undefined,
  recommendation: ReviewedRecommendation,
): boolean {
  const binding = entry?.fromRecommendation;
  return Boolean(
    binding &&
    binding.field === recommendation.field &&
    binding.revision === recommendation.revision &&
    binding.eventId === recommendation.eventId &&
    typeof entry?.intent.value === "number" &&
    Math.abs(entry.intent.value - recommendation.value) < 0.005,
  );
}

/**
 * ARCH-S278-2: the list of the lease's source updates, in order: the operating Sheet cells in the
 * order of the recognized fields, then RentVine. Reading writes nothing.
 */
export function projectSourceUpdates(input: {
  readonly state: RenewalWorkspaceState | null;
  readonly marketValue: MarketValueSource;
  /** S248 R-S248-11: the app's confirmed tenant offer with no Sheet value recorded yet. */
  readonly derived?: {
    readonly field: SheetEditableField;
    readonly value: string | number | boolean;
    readonly source: string;
  } | null;
  readonly page?: SourceUpdatesPageInput | null;
}): SourceUpdatesList {
  const state = input.state;
  const page = input.page ?? null;
  const values = page?.sheetValues ?? null;
  const sheetRows: SourceUpdateRow[] = [];
  const recorded = Object.entries(state?.sourceUpdates ?? {});
  // The open proposal: the page's read when it has one; otherwise the recorded "prepared" facts.
  const open: { fields: readonly string[]; settled: boolean } | null =
    page?.openSheetProposal !== undefined
      ? page.openSheetProposal
        ? {
            fields: page.openSheetProposal.fields,
            settled: page.openSheetProposal.settled,
          }
        : null
      : recorded.some(([, entry]) => entry.state === "prepared")
        ? {
            fields: recorded
              .filter(([, entry]) => entry.state === "prepared")
              .map(([field]) => field),
            settled: false,
          }
        : null;
  const openActive = open !== null && !open.settled;
  const failedFields = page?.openSheetProposal?.failed ?? null;

  const recommendation =
    input.marketValue.kind === "reviewed" ? input.marketValue.recommendation : null;
  for (const [field, entry] of recorded) {
    // R-S278-1: the retired comparison figure never feeds the Sheet; a Market value bound to an
    // earlier recommendation is replaced by the current reviewed one below.
    if (field === "market_value" && entry.state !== "verified") {
      if (!entry.fromRecommendation) continue;
      if (recommendation && !boundToRecommendation(entry, recommendation)) continue;
    }
    const done = entry.state === "verified";
    const inOpen = openActive && open.fields.includes(field);
    // R-S278-5: a cell whose attempt was declined keeps its recovery on its row.
    const declined = !done && !inOpen && Boolean(failedFields?.includes(field));
    const rowState: SourceUpdateRowState = done
      ? "done"
      : inOpen
        ? "prepared"
        : entry.state === "unavailable" || declined
          ? "unavailable"
          : "pending";
    sheetRows.push({
      key: `sheet:${field}`,
      source: "sheet",
      field,
      label: labelOf(field),
      current: currentWords(values, field),
      next: sheetValueWords(entry.intent.value),
      basis: entry.intent.source,
      state: rowState,
      receiptAt: done ? (entry.receiptAt ?? null) : null,
      reason: declined
        ? SOURCE_UPDATES_WORDS.declined
        : entry.state === "unavailable" && entry.reason
          ? entry.reason
          : null,
      action:
        done || inOpen
          ? null
          : {
              kind: "prepare_source",
              field: field as SheetEditableField,
              eventId: entry.eventId,
            },
      waitsForOpen: !done && !inOpen && openActive,
      combinable: !done && !inOpen,
    });
  }
  // R-S278-1: the reviewed recommendation not yet recorded as the Market value.
  const recordedMarket = state?.sourceUpdates.market_value;
  if (
    recommendation &&
    !boundToRecommendation(recordedMarket, recommendation) &&
    !(
      recordedMarket?.state === "verified" &&
      typeof recordedMarket.intent.value === "number" &&
      Math.abs(recordedMarket.intent.value - recommendation.value) < 0.005
    )
  ) {
    const index = sheetRows.findIndex((row) => row.field === "market_value");
    if (index >= 0) sheetRows.splice(index, 1);
    sheetRows.push({
      key: "sheet:market_value",
      source: "sheet",
      field: "market_value",
      label: labelOf("market_value"),
      current: currentWords(values, "market_value"),
      next: formatRentAmount(recommendation.value),
      basis: marketValueBasis(recommendation),
      state: "pending",
      receiptAt: null,
      reason: null,
      action: { kind: "prepare_market_value" },
      waitsForOpen: openActive,
      combinable: true,
    });
  }
  // S248 R-S248-11: the app's confirmed tenant offer prepares the same value a staff record does.
  if (input.derived && !state?.sourceUpdates[input.derived.field]) {
    sheetRows.push({
      key: `sheet:${input.derived.field}`,
      source: "sheet",
      field: input.derived.field,
      label: labelOf(input.derived.field),
      current: currentWords(values, input.derived.field),
      next: sheetValueWords(input.derived.value),
      basis: input.derived.source,
      state: "pending",
      receiptAt: null,
      reason: null,
      action: { kind: "prepare_derived" },
      waitsForOpen: openActive,
      combinable: false,
    });
  }
  // Finish up's Sheet renewal date from the working terms, when no staff fact holds that cell.
  const finishUp = page?.finishUp ?? null;
  if (finishUp?.sheet?.state === "ready" && finishUp.terms) {
    for (const preview of finishUp.sheet.previews) {
      const field = preview.key.replace(/^sheet-/, "");
      if (sheetRows.some((row) => row.field === field)) continue;
      sheetRows.push({
        key: `sheet-terms:${field}`,
        source: "sheet",
        field,
        label: labelOf(field),
        current: currentWords(values, field) ?? preview.facts.current,
        next:
          field === "renewal_date"
            ? sheetValueWords(finishUp.terms.endDate)
            : preview.facts.proposed,
        basis: WORKING_TERMS_BASIS,
        state: "pending",
        receiptAt: null,
        reason: null,
        action: { kind: "open_form", previewKey: preview.key },
        waitsForOpen: openActive,
        combinable: false,
      });
    }
  }
  sheetRows.sort((a, b) => sheetFieldListOrder(a.field) - sheetFieldListOrder(b.field));
  const rentvineRows: SourceUpdateRow[] =
    finishUp?.rentvine?.state === "ready"
      ? finishUp.rentvine.previews.map((preview) => ({
          key: `rentvine:${preview.key}`,
          source: "rentvine" as const,
          field: preview.key,
          label: preview.title,
          current: preview.facts.current,
          next: preview.facts.proposed,
          basis: WORKING_TERMS_BASIS,
          state: "pending" as const,
          receiptAt: null,
          reason: null,
          action: { kind: "open_form" as const, previewKey: preview.key },
          waitsForOpen: false,
          combinable: false,
        }))
      : [];
  const rows = [...sheetRows, ...rentvineRows];
  const pendingCount = rows.filter((row) => row.state !== "done").length;
  // R-S278-4: the combined review of the recorded Sheet cells still waiting.
  const combinable = sheetRows.filter((row) => row.combinable);
  const combined =
    combinable.length >= 2 && !openActive
      ? {
          count: Math.min(combinable.length, SHEET_SET_MAX_CELLS),
          label: SHEET_SET_WORDS.review(Math.min(combinable.length, SHEET_SET_MAX_CELLS)),
          remaining: Math.max(0, combinable.length - SHEET_SET_MAX_CELLS),
          entries: combinable.flatMap((row) =>
            row.action?.kind === "prepare_source"
              ? [{ field: row.action.field, eventId: row.action.eventId }]
              : [],
          ),
          marketValue: combinable.some(
            (row) => row.action?.kind === "prepare_market_value",
          ),
        }
      : null;
  return {
    rows,
    pendingCount,
    heading:
      pendingCount > 0
        ? SOURCE_UPDATES_WORDS.headingPending(pendingCount)
        : SOURCE_UPDATES_WORDS.heading,
    combined,
  };
}

/** R-S278-3: the row whose action takes focus after a row is done: the next one still waiting. */
export function nextPendingRowKey(
  rows: readonly SourceUpdateRow[],
  doneKey: string,
): string | null {
  const index = rows.findIndex((row) => row.key === doneKey);
  const waiting = (row: SourceUpdateRow) => row.state !== "done" && row.action !== null;
  const after = rows.slice(index + 1).find(waiting);
  return (after ?? rows.find(waiting))?.key ?? null;
}

/** A preview already open in the list keeps its words: prepared alone or with the others. */
export function preparedWords(
  row: SourceUpdateRow,
  open: OpenSheetProposalView | null | undefined,
) {
  return open && open.fields.length > 1 && open.fields.includes(row.field)
    ? SOURCE_UPDATES_WORDS.preparedSet
    : SOURCE_UPDATES_WORDS.prepared;
}
