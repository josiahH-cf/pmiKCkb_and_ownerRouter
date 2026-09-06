// S110 renewal adapters. Both read the same `DeskLeaseRow` projection the Renewals desk renders and
// apply the desk's OWN predicates (exported by `desk-query-v2`), so the assistant and the table can
// never disagree about which leases are blocked or which come up in a month: the same default scope
// hides the same out-of-window rows, and "next month" means the desk's Renewal-month filter (lease
// end month). A month-to-month lease's periodic review is not a renewal and is not listed here; the
// desk shows it under its periodic-review scope. They filter and project; they read no source of
// their own and write nothing.

import type { AssistantItem } from "@/lib/assistant/envelope";
import {
  renewalDeskItemInScope,
  renewalDeskItemIsBlocked,
  renewalDeskItemMatchesMonth,
} from "@/lib/lease-renewal/desk-query-v2";
import { buildWorkspaceHref } from "@/lib/lease-renewal/desk-view-continuation";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";

export function selectBlockedRenewalRows(
  rows: readonly DeskLeaseRow[],
): readonly DeskLeaseRow[] {
  return rows.filter(
    (row) => renewalDeskItemInScope(row) && renewalDeskItemIsBlocked(row),
  );
}

/** The rows the desk's default worklist lists for one Renewal month. */
export function selectRenewalRowsInMonth(
  rows: readonly DeskLeaseRow[],
  month: string,
): readonly DeskLeaseRow[] {
  return rows.filter(
    (row) => renewalDeskItemInScope(row) && renewalDeskItemMatchesMonth(row, month),
  );
}

export function projectRenewalItems(rows: readonly DeskLeaseRow[]): AssistantItem[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.addressLabel,
    detail: renewalDetail(row),
    blockers: row.guidance.blockers.map((blocker) => blocker.label),
    href: leaseHref(row),
  }));
}

function renewalDetail(row: DeskLeaseRow): string {
  const when =
    row.endDateIso ??
    (typeof row.leaseTerm?.nextReviewIso === "string"
      ? row.leaseTerm.nextReviewIso
      : null);
  const date = when ? `ends ${when}` : "no end date recorded";
  return `${row.reasonLabel} · ${date}`;
}

/**
 * The exact owning link for one row: the lease workspace at the phase the desk would open, or the
 * workspace itself when the guidance names no phase. The assistant builds no provider URL.
 */
function leaseHref(row: DeskLeaseRow): string {
  const action = row.guidance.action;
  const destination = "destination" in action ? action.destination : null;
  const stepId = destination?.kind === "workspace_phase" ? destination.stepId : undefined;
  try {
    return buildWorkspaceHref({ leaseId: row.id, step: stepId, deskView: null });
  } catch {
    return "/lease-renewal/live/desk?v=2";
  }
}
