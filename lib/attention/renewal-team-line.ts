// S280 R-S280-2: the one line that points to the team's renewal list.
//
// Below the viewer's own renewal items, "Waiting on you" (and My Work's empty state) reads "12
// renewals have a next action for the team. Open the Renewal Desk." The count is the working
// batch's membership as the Renewals desk lists it (S246 R-S246-10): the leases the desk's working
// batch lists for the working month, carried over and this batch, each with its next action. My
// Work and the task question keep their task meaning; this line only points to the desk.
//
// Pure and client-safe: the count over desk rows, the words and the link. The server read is in
// `renewal-team-line-read.ts`.

import {
  RENEWAL_BATCH_LISTED_GROUPS,
  renewalBatchGroupFor,
  renewalBatchPlacement,
  type RenewalBatchSourceRow,
} from "@/lib/lease-renewal/renewal-batch";
import { RENEWAL_DESK_ROUTE } from "@/lib/lease-renewal/desk-view-continuation";

export interface RenewalTeamLine {
  /** The working batch's next-action count; null when the desk could not be read. */
  readonly count: number | null;
  /** The working month (`YYYY-MM`) the count is for; null when unknown. */
  readonly month: string | null;
  /** The working batch on the Renewals desk. */
  readonly href: string;
}

/** The working batch's address: the bare desk route opens it. */
export const RENEWAL_TEAM_LINE_HREF = RENEWAL_DESK_ROUTE;

export const RENEWAL_TEAM_LINE_WORDS = {
  link: "Open the Renewal Desk.",
  unknown: "The Renewal Desk lists the team's next actions.",
} as const;

const LISTED: ReadonlySet<string> = new Set(RENEWAL_BATCH_LISTED_GROUPS);

/**
 * AC-S280-2: the working batch's next-action count, from the same placement the desk's working
 * batch uses: the rows it lists for the month (carried over and this batch).
 */
export function renewalTeamNextActionCount(
  rows: readonly RenewalBatchSourceRow[],
  workingMonth: string,
): number {
  return rows.filter((row) =>
    LISTED.has(renewalBatchGroupFor(renewalBatchPlacement(row), workingMonth)),
  ).length;
}

/** "12 renewals have a next action for the team." / "1 renewal has ..." / the unknown line. */
export function renewalTeamLineSentence(count: number | null): string {
  if (count === null) return RENEWAL_TEAM_LINE_WORDS.unknown;
  return count === 1
    ? "1 renewal has a next action for the team."
    : `${count} renewals have a next action for the team.`;
}
