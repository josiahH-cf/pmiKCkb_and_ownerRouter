// Renewal needs-attention fold (console overhaul Slice C). Pure, deterministic projection over the
// actionable leases the desk already classified: one AttentionItem per lease answering "what do I do
// next?", ordered most-attention-first. It reads only fields already on DeskLeaseSummary (open
// conflicts, stage, end date) — no new data, no I/O — so the desk can lead with the work instead of a
// flat metric grid. Every item deep-links to that lease's workspace, where the real action happens.

import type { DeskLeaseSummary } from "@/lib/lease-renewal/sample-desk";

export type AttentionUrgency = "high" | "medium" | "low";

export interface AttentionItem {
  leaseId: string;
  addressLabel: string;
  /** One line: what needs the operator's attention on this lease. */
  headline: string;
  /** The concrete next-step button label. */
  actionLabel: string;
  href: string;
  urgency: AttentionUrgency;
}

const URGENCY_RANK: Record<AttentionUrgency, number> = { high: 0, medium: 1, low: 2 };

// Owner-decision is the earliest human decision in the flow (stage index 1 = "Owner decision"), so
// data-check / owner-decision stages read as medium urgency and later stages as low.
const EARLY_STAGE_MAX_INDEX = 1;

function itemFor(lease: DeskLeaseSummary): AttentionItem {
  const href = `/lease-renewal/lease/${lease.id}`;

  if (lease.openConflicts > 0) {
    const plural = lease.openConflicts === 1 ? "" : "s";
    return {
      leaseId: lease.id,
      addressLabel: lease.addressLabel,
      headline: `${lease.openConflicts} source conflict${plural} to resolve before you can continue`,
      actionLabel: "Resolve conflicts",
      href,
      urgency: "high",
    };
  }

  const urgency: AttentionUrgency =
    lease.stageIndex >= 0 && lease.stageIndex <= EARLY_STAGE_MAX_INDEX ? "medium" : "low";
  return {
    leaseId: lease.id,
    addressLabel: lease.addressLabel,
    headline: lease.nextAction ?? "Continue the renewal",
    actionLabel: "Open the renewal",
    href,
    urgency,
  };
}

// ISO dates sort lexicographically; a lease with no end date sorts last.
function compareEndDate(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * Fold the actionable leases into one attention-ordered list (pure). Order: open source conflicts
 * first, then earlier-stage work, then soonest end date, then address for a stable tiebreak.
 */
export function buildRenewalAttention(
  actionable: readonly DeskLeaseSummary[],
): AttentionItem[] {
  return [...actionable]
    .map((lease) => ({ lease, item: itemFor(lease) }))
    .sort(
      (a, b) =>
        URGENCY_RANK[a.item.urgency] - URGENCY_RANK[b.item.urgency] ||
        compareEndDate(a.lease.endDateIso, b.lease.endDateIso) ||
        a.item.addressLabel.localeCompare(b.item.addressLabel),
    )
    .map((entry) => entry.item);
}
