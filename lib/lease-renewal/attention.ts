// Renewal needs-attention fold (console overhaul Slice C; refined after adversarial review). Pure,
// deterministic projection that surfaces ONLY the actionable leases that genuinely need a human now
// — an open source conflict, or an awaited data-check / owner decision — so the desk leads with what
// needs attention instead of re-listing every lease (the full list stays in "Your queue" below). It
// reads only fields already on DeskLeaseSummary; no new data, no I/O.

import type { AttentionLane, AttentionSeverity } from "@/lib/attention/lanes";
import type { DeskLeaseSummary } from "@/lib/lease-renewal/sample-desk";

export type AttentionUrgency = "high" | "medium";

// The renewal fold speaks the shared attention contract (S17 B3): every item carries the `renewal` lane
// and a neutral severity, so the desk uses the same vocabulary as the hub + the Console deck. The
// value-bearing display fields (addressLabel, headline) stay on THIS desk's own type — the shared,
// cross-surface AttentionSignal is built value-free via `toAttentionSignal` and never carries them.
export const RENEWAL_LANE: AttentionLane = "renewal";

export interface AttentionItem {
  leaseId: string;
  addressLabel: string;
  /** One line: what needs the operator's attention on this lease. */
  headline: string;
  /** The concrete next-step button label. */
  actionLabel: string;
  href: string;
  urgency: AttentionUrgency;
  /** Shared attention lane (always `renewal`) so the fold speaks the hub/deck vocabulary. */
  lane: AttentionLane;
  /** Neutral attention severity derived from urgency. */
  severity: AttentionSeverity;
}

const URGENCY_RANK: Record<AttentionUrgency, number> = { high: 0, medium: 1 };

// Stage indices into RENEWAL_STEPS: 0 = Data check, 1 = Owner decision. A lease at or before the owner
// decision is awaiting a human input; later stages are progressing and belong in the full queue.
const OWNER_DECISION_STAGE_INDEX = 1;

// A lease needs attention now when a source conflict blocks it, or it is still awaiting the data check
// or owner decision. Progressing leases (tenant offer / build docs, in agreement) are not shown here.
function needsAttention(lease: DeskLeaseSummary): boolean {
  return (
    lease.openConflicts > 0 ||
    (lease.stageIndex >= 0 && lease.stageIndex <= OWNER_DECISION_STAGE_INDEX)
  );
}

function actionLabelForStage(stageIndex: number): string {
  if (stageIndex === 0) return "Check the data";
  if (stageIndex === 1) return "Get the owner decision";
  return "Open the renewal";
}

/** Default per-lease link target (the sample workspace). The live desk passes its own builder. */
export function sampleLeaseHref(id: string): string {
  return `/lease-renewal/lease/${id}`;
}

function itemFor(
  lease: DeskLeaseSummary,
  leaseHref: (id: string) => string,
): AttentionItem {
  const href = leaseHref(lease.id);

  if (lease.openConflicts > 0) {
    const plural = lease.openConflicts === 1 ? "" : "s";
    return {
      leaseId: lease.id,
      addressLabel: lease.addressLabel,
      headline: `${lease.openConflicts} source conflict${plural} to resolve before you can continue`,
      actionLabel: "Resolve conflicts",
      href,
      urgency: "high",
      lane: RENEWAL_LANE,
      severity: "high",
    };
  }

  return {
    leaseId: lease.id,
    addressLabel: lease.addressLabel,
    headline: lease.nextAction ?? "Continue the renewal",
    actionLabel: actionLabelForStage(lease.stageIndex),
    href,
    urgency: "medium",
    lane: RENEWAL_LANE,
    severity: "medium",
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
 * Fold the actionable leases into the needs-attention list (pure). Includes ONLY leases with an open
 * conflict or an awaited data-check / owner decision — progressing leases live in the full queue, not
 * here, so the fold never duplicates the queue. Order: conflicts first, then soonest end date
 * (deadline-driven, so a lease due sooner never sorts below one due later within a band), then address.
 */
export function buildRenewalAttention(
  actionable: readonly DeskLeaseSummary[],
  leaseHref: (id: string) => string = sampleLeaseHref,
): AttentionItem[] {
  return [...actionable]
    .filter(needsAttention)
    .map((lease) => ({ lease, item: itemFor(lease, leaseHref) }))
    .sort(
      (a, b) =>
        URGENCY_RANK[a.item.urgency] - URGENCY_RANK[b.item.urgency] ||
        compareEndDate(a.lease.endDateIso, b.lease.endDateIso) ||
        a.item.addressLabel.localeCompare(b.item.addressLabel),
    )
    .map((entry) => entry.item);
}
