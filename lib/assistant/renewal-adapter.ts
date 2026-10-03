// S110 renewal adapters. Both read the same `DeskLeaseRow` projection the Renewals desk renders and
// apply the desk's OWN predicates (exported by `desk-query-v2`), so the assistant and the table can
// never disagree about which leases are blocked or which come up in a month: the same default scope
// hides the same out-of-window rows, and "next month" means the desk's Renewal-month filter (lease
// end month). A month-to-month lease's periodic review is not a renewal and is not listed here; the
// desk shows it under its periodic-review scope. They filter and project; they read no source of
// their own and write nothing.
//
// S166: each projected lease links its own workspace by its real lease id and names the tenants the
// row already carries, so a result can be told apart and opened. A row with no resolved lease id is
// never given a lease link; it says so and opens the Renewals desk instead.

import type { AssistantItem } from "@/lib/assistant/envelope";
import {
  renewalDeskItemInScope,
  renewalDeskItemIsBlocked,
  renewalDeskItemMatchesMonth,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  EXPLICIT_DEFAULT_DESK_VIEW,
  RENEWAL_DESK_ROUTE,
  leaseWorkspaceHrefOrNull,
} from "@/lib/lease-renewal/desk-view-continuation";
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

/** The Renewals desk's explicit default view, used when a row has no lease of its own to open. */
const RENEWALS_DESK_HREF = `${RENEWAL_DESK_ROUTE}?${EXPLICIT_DEFAULT_DESK_VIEW}`;
const MAX_TENANTS_NAMED = 3;

export function projectRenewalItems(rows: readonly DeskLeaseRow[]): AssistantItem[] {
  return rows.map((row) => {
    const href = leaseHref(row);
    return {
      id: row.id,
      title: row.addressLabel,
      detail: renewalDetail(row, href !== null),
      blockers: row.guidance.blockers.map((blocker) => blocker.label),
      href: href ?? RENEWALS_DESK_HREF,
    };
  });
}

/** The tenants this row already carries, so two leases at similar addresses can be told apart. */
function tenantIdentity(row: DeskLeaseRow): string | null {
  const names = (row.tenantNameLabels ?? []).filter((name) => name.trim() !== "");
  if (names.length === 0) return null;
  const shown = names.slice(0, MAX_TENANTS_NAMED).join(", ");
  const more = names.length - MAX_TENANTS_NAMED;
  return `${names.length === 1 ? "Tenant" : "Tenants"}: ${shown}${more > 0 ? ` and ${more} more` : ""}`;
}

function renewalDetail(row: DeskLeaseRow, leaseResolved: boolean): string {
  const when =
    row.endDateIso ??
    (typeof row.leaseTerm?.nextReviewIso === "string"
      ? row.leaseTerm.nextReviewIso
      : null);
  const date = when ? `ends ${when}` : "no end date recorded";
  return [
    tenantIdentity(row),
    row.reasonLabel,
    date,
    leaseResolved ? null : "Lease record not resolved, so this opens the Renewals desk",
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/**
 * The exact owning link for one row: the lease workspace at the phase the desk would open, or the
 * workspace itself when the guidance names no phase. Null when the row carries no resolved lease
 * id. The assistant builds no provider URL and never derives a link from a name.
 */
function leaseHref(row: DeskLeaseRow): string | null {
  const action = row.guidance.action;
  const destination = "destination" in action ? action.destination : null;
  const stepId = destination?.kind === "workspace_phase" ? destination.stepId : undefined;
  return leaseWorkspaceHrefOrNull(row.id, stepId);
}
