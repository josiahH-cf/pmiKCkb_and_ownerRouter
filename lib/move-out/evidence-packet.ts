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
}

export interface EvidencePacket {
  kind: "move_out_evidence_packet";
  /** Every line, each carrying its source — the total never renders without them. */
  lines: readonly EvidenceLine[];
  suggestedDeductionCents: number;
  suggestedDeductionLabel: string;
  suggestedDeductionFormatted: string;
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
    statutoryDeadline,
    legalWordingNote,
    production_allowed: false,
    send_allowed: false,
  };
}
