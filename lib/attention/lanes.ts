// S17 B3 — the ONE value-free attention contract (D2, owner 2026-07-10). The Console deck, the bell +
// the /notifications hub, and the Renewal Desk fold all derive their lane label + severity from THIS
// table, so the three projections speak one vocabulary and no surface can invent a fourth. It is pure
// and client-safe (no firebase-admin, no I/O): callers pass already-value-free fields and get back a
// stamped signal.
//
// VALUE-FREE BY CONSTRUCTION: `toAttentionSignal` is the ONLY constructor and it copies EXACTLY the six
// whitelisted keys (lane, severity, label, detail, href, signal_key). Even if a caller spreads a
// value-bearing record into the input, nothing outside the whitelist survives onto the surface — the
// real values, proposed values, reasons, deciders, addresses, and field keys stay behind each `href`
// (connector design §6.1). A sentinel test pins this key set (AC-S17-4).

import type { Severity } from "@/lib/lease-renewal/severity";

/** The closed set of attention lanes. A signal that is not one of these cannot be stamped. */
export const ATTENTION_LANES = [
  "decision",
  "connection",
  "coverage",
  "renewal",
  "review",
] as const;
export type AttentionLane = (typeof ATTENTION_LANES)[number];

/** A neutral, totally-ordered severity scale shared across every lane (low < medium < high). Kept
 *  separate from the lease-renewal `Severity` vocabulary so a connection or coverage gap never has to
 *  borrow a renewal-specific word like "Blocked". */
export const ATTENTION_SEVERITIES = ["low", "medium", "high"] as const;
export type AttentionSeverity = (typeof ATTENTION_SEVERITIES)[number];

const SEVERITY_RANK: Record<AttentionSeverity, number> = { low: 0, medium: 1, high: 2 };

/** Rank for thresholding/ordering. Higher = more urgent. */
export function attentionSeverityRank(severity: AttentionSeverity): number {
  return SEVERITY_RANK[severity];
}

/** `left` is at least as urgent as `right`. Used by the low-alarm threshold resolver (B4). */
export function meetsSeverityThreshold(
  severity: AttentionSeverity,
  threshold: AttentionSeverity,
): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}

/** Map a lease-renewal `Severity` (High/Blocked/Medium/Low) onto the neutral attention scale. High and
 *  Blocked are both top-urgency (a blocked flag needs unblocking now); Medium→medium; Low→low. */
export function attentionSeverityFromRenewal(severity: Severity): AttentionSeverity {
  switch (severity) {
    case "High":
    case "Blocked":
      return "high";
    case "Medium":
      return "medium";
    case "Low":
      return "low";
  }
}

/** Per-lane display metadata. `allClear` is the richer empty-state copy the hub + deck show when a lane
 *  has zero signals (B6), so an empty lane reads "done", not blank. */
export interface AttentionLaneMeta {
  lane: AttentionLane;
  label: string;
  allClear: string;
}

export const ATTENTION_LANE_META: Record<AttentionLane, AttentionLaneMeta> = {
  decision: {
    lane: "decision",
    label: "Needs your decision",
    allClear: "Nothing needs your decision right now.",
  },
  connection: {
    lane: "connection",
    label: "Connections to set up",
    allClear: "Every connection is set up.",
  },
  coverage: {
    lane: "coverage",
    label: "Space coverage",
    allClear: "Every space has its process and connections.",
  },
  renewal: {
    lane: "renewal",
    label: "Renewals to work",
    allClear: "No renewals need attention right now.",
  },
  review: {
    lane: "review",
    label: "Team review",
    allClear: "No high-risk overrides or self-corrections to review.",
  },
};

/**
 * The value-free attention signal. EXACTLY these six keys ever cross onto the deck, the hub, or the
 * renewal desk. No address, proposed value, free-text reason, decider, field_key, or reason_code.
 */
export interface AttentionSignal {
  lane: AttentionLane;
  severity: AttentionSeverity;
  /** A field label or PII-free action text — never a raw value. */
  label: string;
  /** PII-free context after the label (the run, or what awaits). */
  detail: string;
  /** Deep link to the authenticated surface where the real value + the control live. */
  href: string;
  /** Stable, value-free key for React lists + dedup (e.g. `renewal:{runId}:{fieldKey}`). */
  signal_key: string;
}

/** The ONLY constructor for a signal. Copies exactly the whitelisted keys, so a value-bearing field on
 *  the input can never leak onto a surface. `lane`/`severity` are compile-checked to the closed enums. */
export function toAttentionSignal(input: {
  lane: AttentionLane;
  severity: AttentionSeverity;
  label: string;
  detail: string;
  href: string;
  signalKey: string;
}): AttentionSignal {
  return {
    lane: input.lane,
    severity: input.severity,
    label: input.label,
    detail: input.detail,
    href: input.href,
    signal_key: input.signalKey,
  };
}

export function isAttentionLane(value: unknown): value is AttentionLane {
  return (
    typeof value === "string" && (ATTENTION_LANES as readonly string[]).includes(value)
  );
}

export function isAttentionSeverity(value: unknown): value is AttentionSeverity {
  return (
    typeof value === "string" &&
    (ATTENTION_SEVERITIES as readonly string[]).includes(value)
  );
}
