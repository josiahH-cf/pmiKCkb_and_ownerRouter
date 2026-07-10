// Value-free decision metrics (S13 Wave 3 H1). A pure projection over the existing decision records
// (flag resolutions + write-back approvals) into COUNTS ONLY: how often the team accepts a source,
// enters a correction, or dismisses a flag as a false positive, plus the reason-code distribution.
// This is the live false-positive signal the code already promises, made visible.
//
// GOVERNANCE: value-free BY CONSTRUCTION. The output carries only integers and one derived rate — no
// field value, no proposed value, no free-text reason, no lease/tenant identifier, no source name.
// A reason CODE is a category (H2), safe to count. A sentinel test pins the exact key set so a future
// edit cannot leak a value-bearing field onto this surface.

import {
  DECISION_REASON_CODES,
  isDecisionReasonCode,
  type DecisionReasonCode,
} from "@/lib/lease-renewal/reason-codes";

/** The minimal, value-free shape the projection reads from a resolution record. `severity` is the
 *  flag's risk band (a category, never a value), used only to threshold high-risk overrides for the
 *  S17 review digest. */
export interface DecisionMetricsResolutionInput {
  resolution_kind?: "pick_source" | "corrected_value" | "flag_incorrect";
  reason_code?: string;
  severity?: string;
}

/** The minimal, value-free shape the projection reads from a write-back approval record. */
export interface DecisionMetricsApprovalInput {
  state: "Approved" | "Returned for Revision";
  reason_code?: string;
}

export interface DecisionMetrics {
  total_decisions: number;
  resolutions: {
    total: number;
    /** pick_source: accepted one of the candidate sources. */
    accepted: number;
    /** corrected_value: entered a corrected value (an override). */
    corrected: number;
    /** flag_incorrect: dismissed the flag ("the sheet is already right") — the false-positive signal. */
    dismissed: number;
    /** dismissed / total, 0 when there are no resolutions. Rounded to 3 decimals. */
    dismiss_rate: number;
  };
  approvals: {
    total: number;
    approved: number;
    returned: number;
  };
  /** Count per reason code across BOTH decision paths. */
  reason_codes: Record<DecisionReasonCode, number>;
  /** Decisions that carried no reason code. */
  uncategorized: number;
  /**
   * S17 B5 — the value-free roll-up Dan's Admin-only review digest reads. `high_risk_overrides` counts
   * corrected_value resolutions at High severity (a reviewer overrode the source on a high-risk field);
   * `self_corrections` counts write-back authorizations later walked back (returned for revision). Both
   * are integers only — never a value, address, field, or reason. The exact self-correction definition +
   * the digest window are display defaults pending Dan's confirmation (Q-DAN-REVIEW-CADENCE).
   */
  review: {
    high_risk_overrides: number;
    self_corrections: number;
  };
}

function emptyReasonCodeCounts(): Record<DecisionReasonCode, number> {
  const counts = {} as Record<DecisionReasonCode, number>;
  for (const code of DECISION_REASON_CODES) counts[code] = 0;
  return counts;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Project decision records into value-free counts. Pure; no I/O. */
export function buildDecisionMetrics(input: {
  resolutions: readonly DecisionMetricsResolutionInput[];
  approvals: readonly DecisionMetricsApprovalInput[];
}): DecisionMetrics {
  const reasonCodes = emptyReasonCodeCounts();
  let uncategorized = 0;

  const tallyReasonCode = (code: string | undefined) => {
    if (isDecisionReasonCode(code)) reasonCodes[code] += 1;
    else uncategorized += 1;
  };

  let accepted = 0;
  let corrected = 0;
  let dismissed = 0;
  let highRiskOverrides = 0;
  for (const resolution of input.resolutions) {
    if (resolution.resolution_kind === "pick_source") accepted += 1;
    else if (resolution.resolution_kind === "corrected_value") {
      corrected += 1;
      if (resolution.severity === "High") highRiskOverrides += 1;
    } else if (resolution.resolution_kind === "flag_incorrect") dismissed += 1;
    tallyReasonCode(resolution.reason_code);
  }

  let approved = 0;
  let returned = 0;
  for (const approval of input.approvals) {
    if (approval.state === "Approved") approved += 1;
    else if (approval.state === "Returned for Revision") returned += 1;
    tallyReasonCode(approval.reason_code);
  }

  const resolutionTotal = input.resolutions.length;
  return {
    total_decisions: resolutionTotal + input.approvals.length,
    resolutions: {
      total: resolutionTotal,
      accepted,
      corrected,
      dismissed,
      dismiss_rate: resolutionTotal === 0 ? 0 : round3(dismissed / resolutionTotal),
    },
    approvals: {
      total: input.approvals.length,
      approved,
      returned,
    },
    reason_codes: reasonCodes,
    uncategorized,
    review: {
      high_risk_overrides: highRiskOverrides,
      // A returned write-back authorization is an approver walking a decision back — the observable
      // self-correction in the persisted records (stale-via-re-resolution needs the Activity cross-join,
      // a documented future refinement).
      self_corrections: returned,
    },
  };
}
