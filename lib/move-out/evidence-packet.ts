// Move-Out deposit-disposition evidence packet (S13 Wave 2 / space-teeth E2f).
//
// Assembles operator-entered evidence lines (inspection charges, vendor bids, RentVine ledger refs,
// lock-change / 4265 charges) and computes a clearly-labeled SUGGESTED deposit deduction (owner Q3
// override). Pure + deterministic: no I/O, no Date.now().
//
// GOVERNANCE (binding guardrails):
// - The suggested total is a SUGGESTION ONLY — owner approval is required before any use; it is NEVER
//   final and is NEVER posted to a ledger / bank / QuickBooks (no system-of-record write).
// - The arithmetic is transparent: every line shows its source, and the total sums INTEGER CENTS
//   (formatted only at the end) so a fixed-input total is exact — no floating-point drift.
// - The statutory deadline and legal deposit wording are NEVER invented/computed (Move-Out Q2) — they
//   render as literal `Needs Verification:` placeholders unless a human supplies a legally-reviewed
//   value. `production_allowed` / `send_allowed` are literal `false`.

import { formatUsd } from "@/lib/lease-renewal/owner-draft";

const NEEDS_VERIFICATION = "Needs Verification";

/** The literal label that always accompanies the suggested deduction total. */
export const SUGGESTED_DEDUCTION_LABEL =
  "Suggested deduction — SUGGESTION ONLY, owner approval required";

/** Provisional repair/bid owner-sign-off threshold (unblock note #5; Josiah 2026-07-03 chose the
 *  note's $500 starting point). PROVISIONAL + UNVERIFIED — it is Dan's business rule; overridable via
 *  `input.repairSignoffThresholdCents` once he confirms a number. Any deduction line at or above it
 *  needs Dan's explicit sign-off before it is treated as final. */
export const PROVISIONAL_REPAIR_SIGNOFF_THRESHOLD_CENTS = 50_000;
export const REPAIR_SIGNOFF_THRESHOLD_LABEL = `${NEEDS_VERIFICATION}: repair/bid owner-sign-off threshold (provisional $500 — Dan to confirm)`;

export interface EvidenceLine {
  key: string;
  label: string;
  /** Integer cents (never a float dollar amount) — so the total sums exactly. */
  amountCents: number;
  /** Where the amount came from (operator-entered): inspection, vendor bid, ledger ref, 4265, etc. */
  source: string;
}

export interface EvidencePacketInput {
  lines: readonly EvidenceLine[];
  /** A legally-reviewed statutory-deadline note, if a human supplied one; else a placeholder is used. */
  statutoryDeadlineNote?: string;
  /** Legally-reviewed deposit-disposition wording, if supplied; else a placeholder is used. */
  legalWordingNote?: string;
  /** Repair/bid owner-sign-off threshold in integer cents; defaults to the provisional $500 (note #5). */
  repairSignoffThresholdCents?: number;
  /** True once Dan confirms the threshold; false leaves it flagged Needs Verification. */
  repairSignoffThresholdVerified?: boolean;
}

export interface EvidencePacket {
  kind: "move_out_evidence_packet";
  /** Every line, each carrying its source — the total never renders without them. */
  lines: readonly EvidenceLine[];
  suggestedDeductionCents: number;
  suggestedDeductionLabel: string;
  suggestedDeductionFormatted: string;
  /** The applied repair/bid sign-off threshold (cents) + its formatted + verification state. */
  repairSignoffThresholdCents: number;
  repairSignoffThresholdFormatted: string;
  repairSignoffThresholdVerified: boolean;
  /** `Needs Verification:` label while the threshold is the provisional default; empty once confirmed. */
  repairSignoffThresholdLabel: string;
  /** Lines at or above the threshold — each needs Dan's explicit sign-off before it is treated as final. */
  linesNeedingSignoff: readonly EvidenceLine[];
  /** True when any line needs owner sign-off. */
  signoffRequired: boolean;
  /** Literal `Needs Verification:` placeholder unless a legally-reviewed value was supplied. */
  statutoryDeadline: string;
  /** Literal `Needs Verification:` placeholder unless legally-reviewed wording was supplied. */
  legalWordingNote: string;
  production_allowed: false;
  send_allowed: false;
}

/** Assemble the evidence packet + a transparent, integer-cents SUGGESTED deduction. */
export function buildEvidencePacket(input: EvidencePacketInput): EvidencePacket {
  // Integer-cents summation — no float dollars enter the arithmetic, so the total is exact.
  const suggestedDeductionCents = input.lines.reduce(
    (sum, line) => sum + Math.round(line.amountCents),
    0,
  );

  // Repair/bid sign-off guardrail (note #5): any single line at or above the threshold needs Dan's
  // explicit sign-off. The threshold is the provisional $500 default until Dan confirms a real number.
  const repairSignoffThresholdCents =
    input.repairSignoffThresholdCents ?? PROVISIONAL_REPAIR_SIGNOFF_THRESHOLD_CENTS;
  const repairSignoffThresholdVerified = input.repairSignoffThresholdVerified ?? false;
  const linesNeedingSignoff = input.lines.filter(
    (line) => Math.round(line.amountCents) >= repairSignoffThresholdCents,
  );

  const statutoryDeadline = input.statutoryDeadlineNote?.trim()
    ? input.statutoryDeadlineNote.trim()
    : `${NEEDS_VERIFICATION}: deposit-disposition statutory deadline (legal/owner — route to Dan; never computed)`;
  const legalWordingNote = input.legalWordingNote?.trim()
    ? input.legalWordingNote.trim()
    : `${NEEDS_VERIFICATION}: statutory deposit-disposition legal language (legal/owner; never generated)`;

  return {
    kind: "move_out_evidence_packet",
    lines: input.lines,
    suggestedDeductionCents,
    suggestedDeductionLabel: SUGGESTED_DEDUCTION_LABEL,
    // Single, final format step (cents → dollars) using the shared USD formatter.
    suggestedDeductionFormatted: formatUsd(suggestedDeductionCents / 100),
    repairSignoffThresholdCents,
    repairSignoffThresholdFormatted: formatUsd(repairSignoffThresholdCents / 100),
    repairSignoffThresholdVerified,
    repairSignoffThresholdLabel: repairSignoffThresholdVerified
      ? ""
      : REPAIR_SIGNOFF_THRESHOLD_LABEL,
    linesNeedingSignoff,
    signoffRequired: linesNeedingSignoff.length > 0,
    statutoryDeadline,
    legalWordingNote,
    production_allowed: false,
    send_allowed: false,
  };
}
