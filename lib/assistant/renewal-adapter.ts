// S110 renewal adapters. Both read the same `DeskLeaseRow` projection the Renewals desk renders, so
// the assistant and the table can never disagree about which leases are blocked or which come up in a
// month. They filter and project; they read no source of their own and write nothing.

import type { AssistantItem } from "@/lib/assistant/envelope";
import { buildWorkspaceHref } from "@/lib/lease-renewal/desk-view-continuation";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";

export function selectBlockedRenewalRows(
  rows: readonly DeskLeaseRow[],
): readonly DeskLeaseRow[] {
  return rows.filter((row) => row.guidance.isBlocked);
}

/**
 * The rows whose renewal lands in one month: a fixed-term lease by its end date, and a
 * month-to-month lease by its S103 periodic-review anchor, which is the date the desk itself uses
 * for those rows.
 */
export function selectRenewalRowsInMonth(
  rows: readonly DeskLeaseRow[],
  month: string,
): readonly DeskLeaseRow[] {
  return rows.filter((row) => {
    const anchor = row.endDateIso ?? row.leaseTerm?.nextReviewIso ?? null;
    return typeof anchor === "string" && anchor.startsWith(month);
  });
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
