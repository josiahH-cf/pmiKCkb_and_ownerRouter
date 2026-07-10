// S17 B2 — turn the two STANDING setup conditions (connections to set up, spaces that need coverage)
// into value-free attention signals so the hub is a true superset of the Console's deck cards. These are
// true-now state, not event records: there is no read_at, and they are "dismissed" by fixing the
// underlying state (setting up the connector / adding the process), not by reading a row. Pure and
// client-safe; the caller passes the already-resolved, already-scope-filtered gap items.

import { toAttentionSignal, type AttentionSignal } from "@/lib/attention/lanes";

/** One resolved setup-gap row (label + PII-free detail + its deep link). */
export interface StandingItem {
  label: string;
  detail?: string;
  href: string;
}

const NEEDS_SETUP = "Needs setup";

/** Build the standing signals for the connection + coverage lanes from the resolved gap items. */
export function buildStandingSignals(
  connections: readonly StandingItem[],
  coverage: readonly StandingItem[],
): AttentionSignal[] {
  const signals: AttentionSignal[] = [];

  for (const item of connections) {
    signals.push(
      toAttentionSignal({
        lane: "connection",
        severity: "medium",
        label: item.label,
        detail: item.detail ?? NEEDS_SETUP,
        href: item.href,
        signalKey: `connection:${item.href}`,
      }),
    );
  }

  for (const item of coverage) {
    signals.push(
      toAttentionSignal({
        lane: "coverage",
        severity: "medium",
        label: item.label,
        detail: item.detail ?? NEEDS_SETUP,
        href: item.href,
        signalKey: `coverage:${item.href}`,
      }),
    );
  }

  return signals;
}
