// Owner renewal-email draft composer (Phase-1, draft-only; design "Owner communication draft").
//
// This is the lowest-complexity, highest-value automation Dan named on the 2026-06-19 show-and-tell
// (~01:11:07): draft the owner email — address, current rent, a market comp range + the specific
// market number, a screenshot placeholder — in his template's voice, every fact source-tagged.
//
// GOVERNANCE: draft ONLY. `production_allowed` and `send_allowed` are literal `false`; a human (Dan)
// approves and sends. Any market input we don't have renders a visible `Needs Verification:` marker —
// never an invented number — so only Verified, approved facts reach the owner without a warning
// (product doc confidence rules). Pure and deterministic: no I/O, no Date.now().

import type { NormalizedConfidence } from "@/lib/lease-renewal/normalized-value";

export type FactConfidence = NormalizedConfidence | "Needs Verification";

export interface DraftFact {
  key: string;
  label: string;
  value: string;
  /** Where the fact came from (e.g. "Rentvine (read-authoritative)", "Zillow", "PMI rental analysis"). */
  source: string;
  confidence: FactConfidence;
}

export interface OwnerDraftMarketInput {
  /** The specific number from the PMI/franchise rental-analysis tool (Dan's source-of-truth number). */
  specificNumber?: number;
  /** Zillow comp range for justification. */
  rangeLow?: number;
  rangeHigh?: number;
  /** A link/placeholder for the comps screenshot Dan pastes into the email. */
  compsScreenshotRef?: string;
}

export interface OwnerDraftInput {
  /** Property address label (in-boundary; never written to git). */
  addressLabel: string;
  /** Current base rent, from RentVine (read-authoritative). */
  currentRent: number;
  currentRentSource?: string;
  market?: OwnerDraftMarketInput;
}

export interface OwnerRenewalDraft {
  kind: "owner_renewal_email";
  subject: string;
  body: string;
  facts: DraftFact[];
  /** Market inputs that were absent and rendered as `Needs Verification:` markers. */
  missingInputs: string[];
  production_allowed: false;
  send_allowed: false;
}

const NEEDS_VERIFICATION = "Needs Verification";

export function formatUsd(amount: number): string {
  const fixed = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return "$" + fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Compose a source-tagged owner renewal-email draft. No send; missing market inputs stay visible. */
export function buildOwnerRenewalDraft(input: OwnerDraftInput): OwnerRenewalDraft {
  const facts: DraftFact[] = [];
  const missingInputs: string[] = [];

  facts.push({
    key: "address",
    label: "Property",
    value: input.addressLabel,
    source: "Rentvine (read-authoritative)",
    confidence: "Verified",
  });
  facts.push({
    key: "current_rent",
    label: "Current rent",
    value: formatUsd(input.currentRent),
    source: input.currentRentSource ?? "Rentvine (read-authoritative)",
    confidence: "Verified",
  });

  const market = input.market ?? {};
  const hasRange = market.rangeLow !== undefined && market.rangeHigh !== undefined;
  if (hasRange) {
    facts.push({
      key: "market_range",
      label: "Comparable range",
      value: `${formatUsd(market.rangeLow!)}–${formatUsd(market.rangeHigh!)}`,
      source: "Zillow",
      confidence: "Likely",
    });
  } else {
    missingInputs.push("market comp range (Zillow)");
    facts.push({
      key: "market_range",
      label: "Comparable range",
      value: `[${NEEDS_VERIFICATION}: market comp range from Zillow]`,
      source: "Zillow",
      confidence: NEEDS_VERIFICATION,
    });
  }

  if (market.specificNumber !== undefined) {
    facts.push({
      key: "market_number",
      label: "Suggested market value",
      value: formatUsd(market.specificNumber),
      source: "PMI rental analysis",
      confidence: "Likely",
    });
  } else {
    missingInputs.push("specific market number (PMI rental-analysis tool)");
  }

  const screenshot =
    market.compsScreenshotRef ?? `[${NEEDS_VERIFICATION}: paste comps screenshot]`;
  if (!market.compsScreenshotRef) missingInputs.push("comps screenshot");

  const rangeLine = hasRange
    ? `I'm seeing comparable rents ranging from ${formatUsd(market.rangeLow!)} to ${formatUsd(market.rangeHigh!)}.`
    : `I'm seeing comparable rents ranging from [${NEEDS_VERIFICATION}: market comp range from Zillow].`;
  const suggestionLine =
    market.specificNumber !== undefined
      ? `Based on the analysis, a renewal around ${formatUsd(market.specificNumber)} looks reasonable.`
      : `[${NEEDS_VERIFICATION}: specific market number from the rental-analysis tool]`;

  const subject = `Renewal coming up for ${input.addressLabel}`;
  const body = [
    `Hello,`,
    ``,
    `We have a renewal coming up for ${input.addressLabel}. We are currently charging ${formatUsd(input.currentRent)}.`,
    ``,
    rangeLine,
    suggestionLine,
    screenshot,
    ``,
    `Please let me know your thoughts on offering them a renewal. When considering an increase it's important to find a balance, so let me know what works for you and we'll proceed from there.`,
    ``,
    `Thanks,`,
    `PMI KC Metro`,
  ].join("\n");

  return {
    kind: "owner_renewal_email",
    subject,
    body,
    facts,
    missingInputs,
    production_allowed: false,
    send_allowed: false,
  };
}
