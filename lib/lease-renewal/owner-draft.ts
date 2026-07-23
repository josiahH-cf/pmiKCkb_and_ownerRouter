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
import type { RenewalMarketBasis } from "@/lib/lease-renewal/renewal-progress";

export type FactConfidence = NormalizedConfidence | "Needs Verification";

export interface DraftFact {
  key: string;
  label: string;
  value: string;
  /** Where the fact came from (e.g. "Rentvine (read-authoritative)", "Zillow", "PMI rental analysis"). */
  source: string;
  confidence: FactConfidence;
}

/** One comp source behind an Admin-approved suggested number, snapshotted so the draft is transparent. */
export interface OwnerDraftApprovedCompSource {
  rent: number;
  source: string;
  label?: string;
}

export interface OwnerDraftMarketInput {
  /** The specific number from the PMI/franchise rental-analysis tool (Dan's source-of-truth number). */
  specificNumber?: number;
  /** Zillow comp range for justification. */
  rangeLow?: number;
  rangeHigh?: number;
  /** A link/placeholder for the comps screenshot Dan pastes into the email (S28a: a stored drive:<id> ref). */
  compsScreenshotRef?: string;
  /** Attribution for the comparable range (S28a: e.g. "RentCast" or "Manual entry"); defaults to "Zillow". */
  rangeSource?: string;
  /**
   * S29: an Admin-APPROVED comp-derived suggested rent number, resolved server-side from the rent-suggestion
   * control plane (never the raw computed value, never client-trusted). When present it fills the
   * "Suggested market value" fact and the suggestion line with the distinct
   * "Comp-derived suggestion (Admin-approved)" source label, taking precedence over the operator's own PMI
   * number. Absent → the draft is unchanged (operator PMI number, or the Needs Verification marker).
   */
  approvedSuggestion?: {
    value: number;
    comps: OwnerDraftApprovedCompSource[];
  };
}

/** The distinct source label an Admin-approved comp-derived number wears in the draft (S29). */
export const APPROVED_SUGGESTION_SOURCE = "Comp-derived suggestion (Admin-approved)";

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

export const OWNER_RENEWAL_V1_BASE_COPY = Object.freeze({
  subject: "Renewal coming up for {{address}}",
  body: Object.freeze([
    "Hello,",
    "",
    "We have a renewal coming up for {{address}}. We are currently charging {{current_rent}}.",
    "",
    "{{range_line}}",
    "{{suggestion_line}}",
    "{{screenshot}}",
    "",
    "Please let me know your thoughts on offering them a renewal. When considering an increase it's important to find a balance, so let me know what works for you and we'll proceed from there.",
    "",
    "Thanks,",
    "PMI KC Metro",
  ]),
});

export function formatUsd(amount: number): string {
  const fixed = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return "$" + fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Map the operator's recorded comp basis (RenewalMarketBasis) onto the owner-draft market input, copying
 * only the fields that were actually entered. The app never fills a missing number — an absent field stays
 * absent so the draft renders a visible `Needs Verification:` marker instead of an invented value.
 */
export function ownerDraftMarketFromBasis(
  market: RenewalMarketBasis,
): OwnerDraftMarketInput {
  const out: OwnerDraftMarketInput = {};
  if (market.pmiNumber !== undefined) out.specificNumber = market.pmiNumber;
  if (market.zillowLow !== undefined) out.rangeLow = market.zillowLow;
  if (market.zillowHigh !== undefined) out.rangeHigh = market.zillowHigh;
  // Prefer the stored Drive screenshot ref (S28a); fall back to the pasted URL for back-compat.
  const screenshotRef = market.compScreenshotRef?.trim() || market.compsUrl?.trim();
  if (screenshotRef) out.compsScreenshotRef = screenshotRef;
  // Carry the provider attribution onto the comparable-range fact (defaults to "Zillow" when absent).
  if (market.compSource && market.compSource.trim() !== "") {
    out.rangeSource = market.compSource.trim();
  }
  return out;
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
  // S28a: the comparable-range fact wears the provider's attribution ("Manual entry" / "RentCast" / …),
  // defaulting to "Zillow" to preserve prior behavior when no provider source was recorded.
  const rangeSource = market.rangeSource ?? "Zillow";
  const hasRange = market.rangeLow !== undefined && market.rangeHigh !== undefined;
  if (hasRange) {
    facts.push({
      key: "market_range",
      label: "Comparable range",
      value: `${formatUsd(market.rangeLow!)}–${formatUsd(market.rangeHigh!)}`,
      source: rangeSource,
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

  // S29: an Admin-approved comp-derived number (server-resolved) takes precedence over the operator's own
  // PMI number and wears a distinct source label. The raw COMPUTED suggestion never reaches this input —
  // only an Approved record does — so an unapproved suggestion still renders the Needs Verification marker.
  const approvedSuggestion = market.approvedSuggestion;
  const suggestedValue = approvedSuggestion?.value ?? market.specificNumber;
  const suggestedSource = approvedSuggestion
    ? APPROVED_SUGGESTION_SOURCE
    : "PMI rental analysis";
  if (suggestedValue !== undefined) {
    facts.push({
      key: "market_number",
      label: "Suggested market value",
      value: formatUsd(suggestedValue),
      source: suggestedSource,
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
    suggestedValue !== undefined
      ? `Based on ${approvedSuggestion ? "comparable rents" : "the analysis"}, a renewal around ${formatUsd(suggestedValue)} looks reasonable.`
      : `[${NEEDS_VERIFICATION}: specific market number from the rental-analysis tool]`;

  const replacements = {
    address: input.addressLabel,
    current_rent: formatUsd(input.currentRent),
    range_line: rangeLine,
    suggestion_line: suggestionLine,
    screenshot,
  };
  const subject = renderBaseCopy(OWNER_RENEWAL_V1_BASE_COPY.subject, replacements);
  const body = OWNER_RENEWAL_V1_BASE_COPY.body
    .map((line) => renderBaseCopy(line, replacements))
    .join("\n");

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

function renderBaseCopy(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) => values[key] ?? "");
}
