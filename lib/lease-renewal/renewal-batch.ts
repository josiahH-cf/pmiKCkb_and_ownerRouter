// S246: the working batch. A presentation over the desk rows the one orchestration already loaded
// (ARCH-S246-2): every loaded lease lands in exactly one group, so the group counts always sum to
// the total loaded (R-S246-11). Membership comes from the one target projection
// (`renewal-target.ts`); nothing here reads a source, and no group, count or row derives a draft,
// send, schedule, reminder, lookup or provider write.
//
// Pure and client-safe. The working month and today's date are inputs.

import { formatCalendarMonth } from "@/lib/date-display";
import type { RenewalTargetProjection } from "@/lib/lease-renewal/renewal-target";

export const RENEWAL_BATCH_GROUPS = [
  "carried_over",
  "this_batch",
  "renewed_in_rentvine",
  "month_to_month_reviews",
  "non_renewals",
  "coming_up_later",
  "not_targets",
  "completed",
  "retired",
] as const;
export type RenewalBatchGroup = (typeof RENEWAL_BATCH_GROUPS)[number];

/** The exact group labels staff read. */
export const RENEWAL_BATCH_GROUP_LABELS: Record<RenewalBatchGroup, string> = {
  carried_over: "Carried over",
  this_batch: "This batch",
  renewed_in_rentvine: "Renewed in RentVine, confirm and close",
  month_to_month_reviews: "Month-to-month reviews due",
  non_renewals: "Non-renewals to hand off",
  coming_up_later: "Coming up later",
  not_targets: "Not renewal targets",
  completed: "Completed",
  retired: "Retired",
};

/** The groups always listed in full; every other group is a count that opens its rows. */
export const RENEWAL_BATCH_LISTED_GROUPS = ["carried_over", "this_batch"] as const;
export const RENEWAL_BATCH_COUNT_GROUPS = [
  "renewed_in_rentvine",
  "month_to_month_reviews",
  "non_renewals",
  "coming_up_later",
  "not_targets",
  "completed",
  "retired",
] as const satisfies readonly RenewalBatchGroup[];
export type RenewalBatchCountGroup = (typeof RENEWAL_BATCH_COUNT_GROUPS)[number];

/** What each count group holds, in one plain sentence shown when it is opened. */
export const RENEWAL_BATCH_GROUP_HELP: Record<RenewalBatchCountGroup, string> = {
  renewed_in_rentvine:
    "RentVine reports a later lease end than the cycle staff recorded. Record staff completion with that RentVine date as the evidence, or keep working the recorded cycle.",
  month_to_month_reviews:
    "Month-to-month leases whose annual review is due, or whose review date still needs to be recorded.",
  non_renewals:
    "Leases with a move-out notice in RentVine or a non-renewal recorded by staff, waiting for the non-renewal handoff.",
  coming_up_later:
    "Active leases that end after the working month, and month-to-month reviews scheduled later.",
  not_targets:
    "Leases outside renewal work, each with its reason. Every lease here still opens and saves work.",
  completed: "Leases whose current cycle staff or the app recorded as complete.",
  retired:
    "Leases staff retired for the current cycle. Open the lease to see the reason or restore it.",
};

/**
 * Where one lease sits before a working month is chosen. A renewal target is dated by its cycle
 * date, so its group follows the working month; every other lease has one fixed group and reason.
 */
export type RenewalBatchPlacement =
  | { readonly kind: "dated"; readonly dateIso: string }
  | {
      readonly kind: "fixed";
      readonly group: RenewalBatchCountGroup;
      /** The plain reason the lease is counted there; null when the group label says it all. */
      readonly reason: string | null;
    };

export interface RenewalBatchSourceRow {
  readonly renewalTarget?: RenewalTargetProjection;
  readonly endDateIso: string | null;
  readonly retention: { readonly state: string };
}

/** S103: a month-to-month review is due inside the desk window, unanchored, or already worked. */
function monthToMonthReviewDue(row: RenewalBatchSourceRow): boolean {
  return (
    row.retention.state === "periodic_review" ||
    row.retention.state === "needs_verification" ||
    row.retention.state === "tracked_incomplete"
  );
}

/** One lease's placement from the one target projection. */
export function renewalBatchPlacement(row: RenewalBatchSourceRow): RenewalBatchPlacement {
  const target = row.renewalTarget;
  // A row the orchestration did not project is listed by its date: nothing is excluded on a guess.
  if (!target)
    return row.endDateIso
      ? { kind: "dated", dateIso: row.endDateIso }
      : { kind: "fixed", group: "not_targets", reason: "No end date on file" };
  if (target.kind === "target") return { kind: "dated", dateIso: target.cycleDateIso };
  switch (target.reason) {
    case "rentvine_closed":
    case "rentvine_pending":
    case "owner_hold":
    case "program":
    case "no_end_date":
      return { kind: "fixed", group: "not_targets", reason: target.label };
    case "move_out_initiated":
    case "staff_non_renewal":
      return { kind: "fixed", group: "non_renewals", reason: target.label };
    case "completed":
      return { kind: "fixed", group: "completed", reason: target.label };
    case "retired":
      return { kind: "fixed", group: "retired", reason: target.label };
    case "renewed_in_rentvine":
      return { kind: "fixed", group: "renewed_in_rentvine", reason: target.label };
    case "month_to_month":
      return monthToMonthReviewDue(row)
        ? { kind: "fixed", group: "month_to_month_reviews", reason: null }
        : {
            kind: "fixed",
            group: "coming_up_later",
            reason: "Month-to-month review scheduled later",
          };
  }
}

/** The one group a placement belongs to for a `YYYY-MM` working month. */
export function renewalBatchGroupFor(
  placement: RenewalBatchPlacement,
  workingMonth: string,
): RenewalBatchGroup {
  if (placement.kind === "fixed") return placement.group;
  const month = placement.dateIso.slice(0, 7);
  if (month < workingMonth) return "carried_over";
  return month === workingMonth ? "this_batch" : "coming_up_later";
}

export interface RenewalBatchItem {
  readonly key: string;
  readonly placement: RenewalBatchPlacement;
  /** The date a group orders by: the cycle date, the review date or the lease end. */
  readonly sortDateIso: string | null;
  readonly sortLabel: string;
  /** Priority derived from the shared renewal stage, then the step and its known due date. */
  readonly attention?: {
    readonly rank: number;
    readonly step: number;
    readonly due: string | null;
  };
  readonly currentBaseRent?: number | null;
  readonly recommendedRent?: { readonly value: number } | null;
  /**
   * S249 R-S249-13: where the lease sorts inside "This batch" by its kickoff: ready for review,
   * missing an input, or waiting and finished. Absent rows sort with the waiting and finished.
   */
  readonly kickoffGroup?: "ready" | "missing" | "other";
}

const KICKOFF_RANK = { ready: 0, missing: 1, other: 2 } as const;

function byDateThenLabel(left: RenewalBatchItem, right: RenewalBatchItem): number {
  if (left.sortDateIso !== right.sortDateIso) {
    if (left.sortDateIso === null) return 1;
    if (right.sortDateIso === null) return -1;
    return left.sortDateIso < right.sortDateIso ? -1 : 1;
  }
  return (
    left.sortLabel.localeCompare(right.sortLabel, "en-US") ||
    left.key.localeCompare(right.key, "en-US")
  );
}

/**
 * S246: staff attention leads the selected month. Older callers without the stage projection
 * retain their kickoff ordering.
 */
export function orderThisBatch<T extends RenewalBatchItem>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (left, right) =>
      compareRenewalBatchAttention(left, right) || byDateThenLabel(left, right),
  );
}

function compareRenewalBatchAttention(
  left: RenewalBatchItem,
  right: RenewalBatchItem,
): number {
  const rank = (row: RenewalBatchItem) =>
    row.attention?.rank ?? KICKOFF_RANK[row.kickoffGroup ?? "other"];
  return (
    rank(left) - rank(right) ||
    (left.attention?.step ?? 0) - (right.attention?.step ?? 0) ||
    (left.attention?.due ?? "9999").localeCompare(right.attention?.due ?? "9999")
  );
}

export const RENEWAL_BATCH_SORT_COLUMNS = [
  "stage",
  "date",
  "base",
  "recommended",
] as const;
export type RenewalBatchSortColumn = (typeof RENEWAL_BATCH_SORT_COLUMNS)[number];
export type RenewalBatchSort = {
  readonly column: RenewalBatchSortColumn;
  readonly direction: "asc" | "desc";
};

/** Sort inside the displayed cohort. Absent numeric values and dates stay last in both directions. */
export function sortRenewalBatchCohort<T extends RenewalBatchItem>(
  rows: readonly T[],
  sort: RenewalBatchSort | null,
): readonly T[] {
  if (!sort) return rows;
  const value = (row: T) => {
    switch (sort.column) {
      case "stage":
        return row.attention?.rank ?? KICKOFF_RANK[row.kickoffGroup ?? "other"];
      case "date":
        return row.sortDateIso;
      case "base":
        return row.currentBaseRent ?? null;
      case "recommended":
        return row.recommendedRent?.value ?? null;
    }
  };
  return [...rows].sort((left, right) => {
    const a = value(left);
    const b = value(right);
    if (a === null || b === null)
      return Number(a === null) - Number(b === null) || byDateThenLabel(left, right);
    const order = a < b ? -1 : a > b ? 1 : 0;
    return order * (sort.direction === "asc" ? 1 : -1) || byDateThenLabel(left, right);
  });
}

/** R-S249-13: the three parts of "This batch", in order, each with its own count. */
export function thisBatchParts<T extends RenewalBatchItem>(
  rows: readonly T[],
): { readonly ready: T[]; readonly missing: T[]; readonly other: T[] } {
  const ordered = orderThisBatch(rows);
  return {
    ready: ordered.filter((row) => row.kickoffGroup === "ready"),
    missing: ordered.filter((row) => row.kickoffGroup === "missing"),
    other: ordered.filter(
      (row) => row.kickoffGroup !== "ready" && row.kickoffGroup !== "missing",
    ),
  };
}

function byReasonThenDate(left: RenewalBatchItem, right: RenewalBatchItem): number {
  const reason = (item: RenewalBatchItem) =>
    item.placement.kind === "fixed" ? (item.placement.reason ?? "") : "";
  return (
    reason(left).localeCompare(reason(right), "en-US") || byDateThenLabel(left, right)
  );
}

export interface RenewalBatchPartition<T extends RenewalBatchItem> {
  readonly month: string;
  /** Every loaded lease; always the sum of the group counts. */
  readonly total: number;
  readonly groups: Readonly<Record<RenewalBatchGroup, readonly T[]>>;
  readonly counts: Readonly<Record<RenewalBatchGroup, number>>;
  /** "Not renewal targets" by reason, largest first, so each exclusion is counted in words. */
  readonly notTargetReasons: readonly {
    readonly label: string;
    readonly count: number;
  }[];
}

/** Partition the loaded leases for one working month. Each lease lands in exactly one group. */
export function partitionRenewalBatch<T extends RenewalBatchItem>(
  rows: readonly T[],
  workingMonth: string,
): RenewalBatchPartition<T> {
  const groups = Object.fromEntries(
    RENEWAL_BATCH_GROUPS.map((group) => [group, [] as T[]]),
  ) as Record<RenewalBatchGroup, T[]>;
  for (const row of rows)
    groups[renewalBatchGroupFor(row.placement, workingMonth)].push(row);
  // R-S246-3: carried over shows oldest end date first.
  groups.carried_over.sort(byDateThenLabel);
  groups.this_batch = orderThisBatch(groups.this_batch);
  groups.not_targets.sort(byReasonThenDate);
  for (const group of RENEWAL_BATCH_COUNT_GROUPS)
    if (group !== "not_targets") groups[group].sort(byDateThenLabel);
  const reasons = new Map<string, number>();
  for (const row of groups.not_targets) {
    const label =
      row.placement.kind === "fixed" && row.placement.reason
        ? row.placement.reason
        : "Reason not recorded";
    reasons.set(label, (reasons.get(label) ?? 0) + 1);
  }
  return {
    month: workingMonth,
    total: rows.length,
    groups,
    counts: Object.fromEntries(
      RENEWAL_BATCH_GROUPS.map((group) => [group, groups[group].length]),
    ) as Record<RenewalBatchGroup, number>,
    notTargetReasons: [...reasons]
      .map(([label, count]) => ({ label, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.label.localeCompare(right.label, "en-US"),
      ),
  };
}

/**
 * R-S246-10: everything outside "This batch" for the partition's month, in the desk's own labels
 * and counts, so an answer that lists the batch can state the rest. The first sentence names
 * each other group that holds a lease; the second names each "Not renewal targets" reason.
 */
export function renewalBatchExcludedNotes(
  partition: RenewalBatchPartition<RenewalBatchItem>,
): string[] {
  const groups = RENEWAL_BATCH_GROUPS.filter(
    (group) => group !== "this_batch" && partition.counts[group] > 0,
  ).map((group) => `${RENEWAL_BATCH_GROUP_LABELS[group]} (${partition.counts[group]})`);
  const notes: string[] = [];
  if (groups.length > 0)
    notes.push(
      `Also on the Renewals desk for ${renewalBatchMonthInWords(partition.month)}: ${groups.join("; ")}.`,
    );
  if (partition.notTargetReasons.length > 0)
    notes.push(
      `Not renewal targets by reason: ${partition.notTargetReasons
        .map((entry) => `${entry.label} (${entry.count})`)
        .join("; ")}.`,
    );
  return notes;
}

// ---- Working month ---------------------------------------------------------------------------

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isRenewalBatchMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

/** Move a `YYYY-MM` month by whole months. */
export function shiftRenewalBatchMonth(month: string, delta: number): string {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new Error("A working month must be YYYY-MM.");
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** D-OP-4: the working month is the next calendar month on the Central business date. */
export function defaultRenewalBatchMonth(todayIso: string): string {
  return shiftRenewalBatchMonth(todayIso.slice(0, 7), 1);
}

/** "December 2026" for a working month. */
export function renewalBatchMonthInWords(month: string): string {
  return formatCalendarMonth(month);
}

const NUMBER_WORDS = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
  "Twenty",
];

/** A count in words up to twenty, then in digits. */
export function renewalBatchCountInWords(count: number): string {
  return Number.isInteger(count) && count >= 0 && count < NUMBER_WORDS.length
    ? NUMBER_WORDS[count]
    : String(count);
}

/** R-S246-2: the working month and its count, stated in words above the list. */
export function renewalBatchSummary(month: string, count: number): string {
  const words = renewalBatchCountInWords(count);
  const named = renewalBatchMonthInWords(month);
  if (count === 0) return `No leases ending in ${named} need renewal work.`;
  return count === 1
    ? `${words} lease ending in ${named} needs renewal work.`
    : `${words} leases ending in ${named} need renewal work.`;
}

// ---- Batch address ---------------------------------------------------------------------------

/** The batch's own URL keys. They name no table view, so a URL with only these opens the batch. */
export const RENEWAL_BATCH_MONTH_PARAM = "batch";
export const RENEWAL_BATCH_GROUP_PARAM = "group";
/**
 * S251 R-S251-11: an additive key that narrows the batch to rows carrying one tag. Every earlier
 * key keeps its meaning, and a URL without it reads exactly as before.
 */
export const RENEWAL_BATCH_TAG_PARAM = "tag";
const RENEWAL_BATCH_SORT_PARAM = "batchSort";
export const RENEWAL_BATCH_TAG_FILTERS = [
  "standing_agreement",
  "housing_assistance",
  "needs_check",
] as const;
export type RenewalBatchTagFilter = (typeof RENEWAL_BATCH_TAG_FILTERS)[number];

export interface RenewalBatchQuery {
  /** Null means the default working month for today. */
  readonly month: string | null;
  /** The count group whose rows are open; null when none is. */
  readonly group: RenewalBatchCountGroup | null;
  /** S251: the tag the rows are narrowed to; absent or null shows every row. */
  readonly tag?: RenewalBatchTagFilter | null;
  readonly sort?: RenewalBatchSort | null;
}

type SearchParamRecord = Record<string, string | string[] | undefined>;

function firstValue(
  input: URLSearchParams | SearchParamRecord,
  key: string,
): string | undefined {
  if (input instanceof URLSearchParams) return input.getAll(key)[0];
  const value = input[key];
  return Array.isArray(value) ? value[0] : value;
}

function countGroup(value: string | undefined): RenewalBatchCountGroup | null {
  return (RENEWAL_BATCH_COUNT_GROUPS as readonly string[]).includes(value ?? "")
    ? (value as RenewalBatchCountGroup)
    : null;
}

/** Read the batch keys from untrusted URL state; anything invalid falls back per key. */
export function parseRenewalBatchQuery(
  input: URLSearchParams | SearchParamRecord = {},
): RenewalBatchQuery {
  const month = firstValue(input, RENEWAL_BATCH_MONTH_PARAM);
  const tag = firstValue(input, RENEWAL_BATCH_TAG_PARAM);
  const [column, direction, extra] = (
    firstValue(input, RENEWAL_BATCH_SORT_PARAM) ?? ""
  ).split("-");
  const sort: RenewalBatchSort | null =
    extra === undefined &&
    (RENEWAL_BATCH_SORT_COLUMNS as readonly string[]).includes(column) &&
    (direction === "asc" || direction === "desc")
      ? { column: column as RenewalBatchSortColumn, direction }
      : null;
  return {
    month: isRenewalBatchMonth(month) ? month : null,
    group: countGroup(firstValue(input, RENEWAL_BATCH_GROUP_PARAM)),
    ...(sort ? { sort } : {}),
    ...((RENEWAL_BATCH_TAG_FILTERS as readonly string[]).includes(tag ?? "")
      ? { tag: tag as RenewalBatchTagFilter }
      : {}),
  };
}

/** Canonical batch query: the month first, then the open group, then a tag; "" for the plain batch. */
export function serializeRenewalBatchQuery(query: RenewalBatchQuery): string {
  const params = new URLSearchParams();
  if (query.month) params.set(RENEWAL_BATCH_MONTH_PARAM, query.month);
  if (query.group) params.set(RENEWAL_BATCH_GROUP_PARAM, query.group);
  if (query.tag) params.set(RENEWAL_BATCH_TAG_PARAM, query.tag);
  if (query.sort)
    params.set(RENEWAL_BATCH_SORT_PARAM, `${query.sort.column}-${query.sort.direction}`);
  return params.toString();
}

/**
 * A lease link's return value for the batch it was opened from: the canonical batch query, or
 * null when the value is anything else. It can only ever rebuild the internal desk route.
 */
export function validateRenewalBatchContinuation(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string" || value === "" || value.length > 100) return null;
  if (value.startsWith("?") || value.includes("#")) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(value);
  } catch {
    return null;
  }
  const keys = [...params.keys()];
  if (
    keys.length === 0 ||
    new Set(keys).size !== keys.length ||
    keys.some(
      (key) =>
        key !== RENEWAL_BATCH_MONTH_PARAM &&
        key !== RENEWAL_BATCH_GROUP_PARAM &&
        key !== RENEWAL_BATCH_TAG_PARAM &&
        key !== RENEWAL_BATCH_SORT_PARAM,
    )
  )
    return null;
  const canonical = serializeRenewalBatchQuery(parseRenewalBatchQuery(params));
  return canonical === value ? canonical : null;
}
