// S283 R-S283-2: what "Prepare {month} leases" covers, stated before the click. Pure and
// client-safe: it reads only the server-resolved batch rows the page already holds and the
// read-only allowance count. It reserves nothing, looks nothing up and decides no membership; the
// server still resolves month membership, eligibility and the current cycle for every target it
// is sent, and refuses one outside the selected month. A filter narrows the run and never widens
// it.

import type { PreparationAllowanceCount } from "@/lib/lease-renewal/kickoff-facts";

/** One lease the click would send: the server-resolved row's lease and cycle. */
export interface PreparationTarget {
  readonly leaseId: string;
  readonly address: string;
  readonly cycleDateIso: string | null;
  /**
   * True when no comparison is stored for this cycle, so preparing it would look one up; false
   * when it already has one or needs none; absent when the row was projected without it.
   */
  readonly needsComparison?: boolean;
}

/** The fields of a batch row the target list and the search read. */
export interface PreparationRow {
  readonly leaseId: string;
  readonly canOpen: boolean;
  readonly address: string;
  readonly unit: string | null;
  readonly tenants?: readonly string[];
  readonly placement:
    | { readonly kind: "dated"; readonly dateIso: string }
    | { readonly kind: string };
  readonly kickoff?: { readonly needsComparison: boolean } | null;
  /** False when a server-projected row has a current preparation hold. */
  readonly preparationEligible?: boolean;
  /**
   * Whether preparing the lease would look a comparison up, whatever its stage (a row whose owner
   * step is underway has no kickoff yet is still sent and looked up); null when unknown. Read before
   * `kickoff` when the row carries it.
   */
  readonly comparisonNeeded?: boolean | null;
}

/** Whether preparing this row would look a comparison up; undefined when it is not known. */
function comparisonNeededFor(row: PreparationRow): boolean | undefined {
  if (row.comparisonNeeded !== undefined) return row.comparisonNeeded ?? undefined;
  return row.kickoff ? row.kickoff.needsComparison : undefined;
}

/**
 * The month's eligible targets: this batch's dated rows staff can open, in table order, each with
 * its lease and cycle. The caller passes the month's This batch rows (unfiltered for the total, the
 * shown ones for the run).
 */
export function preparationTargets(
  thisBatchRows: readonly PreparationRow[],
): PreparationTarget[] {
  return thisBatchRows.flatMap((row) => {
    const placement = row.placement;
    if (
      !row.canOpen ||
      row.preparationEligible === false ||
      placement.kind !== "dated" ||
      !("dateIso" in placement)
    )
      return [];
    const needsComparison = comparisonNeededFor(row);
    return [
      {
        leaseId: row.leaseId,
        address: row.unit ? `${row.address}, ${row.unit}` : row.address,
        cycleDateIso: placement.dateIso,
        ...(needsComparison === undefined ? {} : { needsComparison }),
      },
    ];
  });
}

/** Lower-case words with runs of space collapsed, so a search matches what the table shows. */
function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The working batch's search box: a row matches when every word typed appears in its address,
 * unit or a tenant name. An empty search matches every row.
 */
export function matchesBatchSearch(
  row: Pick<PreparationRow, "address" | "unit" | "tenants">,
  search: string,
): boolean {
  const words = normalized(search).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const text = normalized(
    [row.address, row.unit ?? "", ...(row.tenants ?? [])].join(" "),
  );
  return words.every((word) => text.includes(word));
}

/** The counts the button and its line state; no lease value. */
export interface PreparationScope {
  /** Eligible leases the table shows under the active filters and search. */
  readonly shown: number;
  /** Eligible leases of the selected month with nothing filtered. */
  readonly total: number;
  /** Shown leases that would look a comparison up; null when a row was projected without it. */
  readonly needComparison: number | null;
  /** Shown leases that already have a comparison or need none; null with needComparison. */
  readonly haveComparison: number | null;
  /** The monthly allowance as counts; null when it could not be read; undefined when not given. */
  readonly allowance: PreparationAllowanceCount | null | undefined;
  /** How many of the needed comparisons the allowance covers; null when unknown. */
  readonly covered: number | null;
}

export function preparationScope(input: {
  readonly shownTargets: readonly PreparationTarget[];
  readonly monthTotal?: number;
  readonly allowance?: PreparationAllowanceCount | null;
}): PreparationScope {
  const shown = input.shownTargets.length;
  const total = Math.max(shown, input.monthTotal ?? shown);
  const known = input.shownTargets.every(
    (target) => typeof target.needsComparison === "boolean",
  );
  const needComparison = known
    ? input.shownTargets.filter((target) => target.needsComparison === true).length
    : null;
  const haveComparison = needComparison === null ? null : shown - needComparison;
  const covered =
    needComparison === null || !input.allowance
      ? null
      : Math.min(needComparison, input.allowance.remaining);
  return {
    shown,
    total,
    needComparison,
    haveComparison,
    allowance: input.allowance,
    covered,
  };
}

function leases(count: number): string {
  return count === 1 ? "lease" : "leases";
}

/**
 * The button's words: "Prepare 9 December 2026 leases", or with a filter on "Prepare 4 of 9
 * December 2026 leases".
 */
export function prepareButtonLabel(monthName: string, scope: PreparationScope): string {
  return scope.shown === scope.total
    ? `Prepare ${scope.shown} ${monthName} ${leases(scope.shown)}`
    : `Prepare ${scope.shown} of ${scope.total} ${monthName} ${leases(scope.total)}`;
}

/**
 * The one line beside the button, for example "4 leases shown. 3 need a comparison; 1 already has
 * one. Monthly allowance: 41 of 50 left." When the allowance cannot cover the comparisons needed,
 * it says how many it covers.
 */
export function preparationScopeLine(scope: PreparationScope): string {
  const parts = [`${scope.shown} ${leases(scope.shown)} shown.`];
  if (scope.needComparison !== null && scope.haveComparison !== null)
    parts.push(
      `${scope.needComparison} ${scope.needComparison === 1 ? "needs" : "need"} a comparison; ${scope.haveComparison} already ${scope.haveComparison === 1 ? "has" : "have"} one.`,
    );
  if (scope.allowance)
    parts.push(
      `Monthly allowance: ${scope.allowance.remaining} of ${scope.allowance.total} left.`,
    );
  else if (scope.allowance === null) parts.push("Monthly allowance: not read.");
  if (
    scope.allowance &&
    scope.needComparison !== null &&
    scope.covered !== null &&
    scope.covered < scope.needComparison
  )
    parts.push(
      `It covers ${scope.covered} of the ${scope.needComparison} ${scope.needComparison === 1 ? "comparison" : "comparisons"} needed.`,
    );
  return parts.join(" ");
}

/** The outcome of a lease the run did not post after the server answered the allowance is reached. */
export const PREPARATION_NOT_RUN = {
  status: "not_run",
  message: "Not run: the monthly allowance is reached.",
} as const;

/** A preparation answer after which the lease needs nothing more from this run. */
export function preparationSettled(status: string): boolean {
  return [
    "prepared",
    "reused",
    "no_usable",
    "already_claimed",
    "held_back",
    "covered",
    "refused",
  ].includes(status);
}
