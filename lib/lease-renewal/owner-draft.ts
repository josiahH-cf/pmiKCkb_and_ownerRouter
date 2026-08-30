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
  /** Where the fact came from (e.g. "Rentvine (read-authoritative)" or "PMI rental analysis"). */
  source: string;
  confidence: FactConfidence;
}

/** One comp source behind an Admin-approved suggested number, snapshotted so the draft is transparent. */
export interface OwnerDraftApprovedCompSource {
  rent: number;
  source: string;
  label?: string;
}

/** S60: the inline market-trend rendering input (decided presentation: inline range + source link). */
export interface OwnerDraftTrendInput {
  zipCode: string;
  firstMonth: string;
  lastMonth: string;
  firstAverage?: number;
  lastAverage?: number;
  retrievedAt: string;
}

export interface OwnerDraftMarketInput {
  /** The specific number from the PMI/franchise rental-analysis tool (Dan's source-of-truth number). */
  specificNumber?: number;
  /** Comparable-rent range for justification. */
  rangeLow?: number;
  rangeHigh?: number;
  /** Server-resolved current S79 receipt identity. Browser file ids/URLs never reach this input. */
  compScreenshotAttachment?: {
    filename: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic";
    sizeBytes: number;
    sha256Checksum: string;
  };
  /**
   * S60: attribution for the comparable range. Set ONLY from where the numbers genuinely came:
   * the provider's own label when the provider basis supplied them, or the operator-entered label
   * for typed numbers. Never a provider name over typed numbers, never defaulted to a provider.
   */
  rangeSource?: string;
  /** ISO retrieval timestamp shown beside a provider-sourced range. */
  rangeRetrievedAt?: string;
  /** S60: month-keyed market trend, rendered inline with a source link (never an attachment). */
  trend?: OwnerDraftTrendInput;
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

/** S60: the label operator-typed comp numbers wear. A provider name never labels typed numbers. */
export const OPERATOR_ENTERED_SOURCE = "Operator-entered";

/** S60: the provider-free label an absent comp range wears (names no provider at all). */
export const MARKET_COMPS_PLACEHOLDER_SOURCE = "Market comps";

/** The vendor's real public site, used as the trend source link (no guessed deep-link pattern). */
export const RENTCAST_PUBLIC_URL = "https://www.rentcast.io";

export interface OwnerDraftInput {
  /** Property address label (in-boundary; never written to git). */
  addressLabel: string;
  /** Current base rent, from RentVine (read-authoritative). */
  currentRent: number;
  currentRentSource?: string;
  /**
   * Evidence that earns (or refuses) the current-rent confidence label. Missing evidence is
   * intentionally Needs Verification: a number never becomes Verified merely because it came from
   * a live-shaped object.
   */
  currentRentEvidence?: {
    agreement: "agree" | "resolved" | "conflict" | "single_source" | "missing";
    currencyState: "fresh" | "stale" | "expired";
    readAtIso: string;
    resolvedSource?: string;
  };
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
    "{{trend_line}}",
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
 * Map the recorded comp basis (RenewalMarketBasis) onto the owner-draft market input, copying only
 * fields that were actually captured. The app never fills a missing number — an absent field stays
 * absent so the draft renders a visible `Needs Verification:` marker instead of an invented value.
 *
 * S60 source truth: when the PROVIDER basis is present its numbers, its own source label, and its
 * retrieval date are used. Otherwise the operator-typed numbers are used and labeled
 * operator-entered. One basis's numbers are never combined with the other's label.
 */
export function ownerDraftMarketFromBasis(
  market: RenewalMarketBasis,
): OwnerDraftMarketInput {
  const out: OwnerDraftMarketInput = {};
  if (market.pmiNumber !== undefined) out.specificNumber = market.pmiNumber;

  const provider = market.provider;
  if (provider) {
    out.rangeLow = provider.rangeLow;
    out.rangeHigh = provider.rangeHigh;
    out.rangeSource = provider.source;
    out.rangeRetrievedAt = provider.retrievedAt;
    const trend = provider.trend;
    if (trend) {
      const months = Object.keys(trend.months).sort();
      if (months.length > 0) {
        const firstMonth = months[0];
        const lastMonth = months[months.length - 1];
        const firstAverage = trend.months[firstMonth]?.averageRent;
        const lastAverage = trend.months[lastMonth]?.averageRent;
        out.trend = {
          zipCode: trend.zipCode,
          firstMonth,
          lastMonth,
          ...(firstAverage !== undefined ? { firstAverage } : {}),
          ...(lastAverage !== undefined ? { lastAverage } : {}),
          retrievedAt: trend.retrievedAt,
        };
      }
    }
  } else {
    if (market.rangeLow !== undefined) out.rangeLow = market.rangeLow;
    if (market.rangeHigh !== undefined) out.rangeHigh = market.rangeHigh;
    if (market.rangeLow !== undefined || market.rangeHigh !== undefined) {
      out.rangeSource = OPERATOR_ENTERED_SOURCE;
    }
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
  const currentRentFact = deriveCurrentRentFact(input);
  facts.push(currentRentFact);
  if (currentRentFact.confidence === NEEDS_VERIFICATION) {
    missingInputs.push("current rent confirmation");
  }

  const market = input.market ?? {};
  // S60: the comparable-range fact wears the label of where its numbers GENUINELY came from — the
  // provider's own label, or operator-entered. An absent range renders a marker naming no provider.
  const rangeSource = market.rangeSource ?? OPERATOR_ENTERED_SOURCE;
  const hasRange = market.rangeLow !== undefined && market.rangeHigh !== undefined;
  if (hasRange) {
    facts.push({
      key: "market_range",
      label: "Comparable range",
      value: `${formatUsd(market.rangeLow!)}–${formatUsd(market.rangeHigh!)}`,
      source: market.rangeRetrievedAt
        ? `${rangeSource} (retrieved ${market.rangeRetrievedAt.slice(0, 10)})`
        : rangeSource,
      confidence: "Likely",
    });
  } else {
    missingInputs.push("market comp range");
    facts.push({
      key: "market_range",
      label: "Comparable range",
      value: `[${NEEDS_VERIFICATION}: market comp range]`,
      source: MARKET_COMPS_PLACEHOLDER_SOURCE,
      confidence: NEEDS_VERIFICATION,
    });
  }

  // S60: the market trend renders INLINE with a source link (the decided presentation; never an
  // attachment). Only the provider's own retrieved figures appear; an absent trend renders nothing.
  const trend = market.trend;
  let trendLine = "";
  if (trend && (trend.firstAverage !== undefined || trend.lastAverage !== undefined)) {
    const from =
      trend.firstAverage !== undefined
        ? `${formatUsd(trend.firstAverage)} in ${trend.firstMonth}`
        : trend.firstMonth;
    const to =
      trend.lastAverage !== undefined
        ? `${formatUsd(trend.lastAverage)} in ${trend.lastMonth}`
        : trend.lastMonth;
    trendLine = `Average area rent for ${trend.zipCode} moved from ${from} to ${to} (source: RentCast, ${RENTCAST_PUBLIC_URL}, retrieved ${trend.retrievedAt.slice(0, 10)}).`;
    facts.push({
      key: "market_trend",
      label: "Market trend",
      value: `${from} to ${to} (${trend.zipCode})`,
      source: `RentCast (retrieved ${trend.retrievedAt.slice(0, 10)})`,
      confidence: "Likely",
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

  const attachment = market.compScreenshotAttachment;
  const screenshot = attachment
    ? `Comparable rent screenshot attached: ${attachment.filename}.`
    : `[${NEEDS_VERIFICATION}: attach receipted comps screenshot]`;
  if (!attachment) {
    missingInputs.push("comps screenshot");
  } else {
    facts.push({
      key: "comps_screenshot",
      label: "Comparable screenshot",
      value: attachment.filename,
      source: "Stored screenshot receipt",
      confidence: "Verified",
    });
  }

  const rangeLine = hasRange
    ? `I'm seeing comparable rents ranging from ${formatUsd(market.rangeLow!)} to ${formatUsd(market.rangeHigh!)}.`
    : `I'm seeing comparable rents ranging from [${NEEDS_VERIFICATION}: market comp range].`;
  const suggestionLine =
    suggestedValue !== undefined
      ? `Based on ${approvedSuggestion ? "comparable rents" : "the analysis"}, a renewal around ${formatUsd(suggestedValue)} looks reasonable.`
      : `[${NEEDS_VERIFICATION}: specific market number from the rental-analysis tool]`;

  const replacements = {
    address: input.addressLabel,
    current_rent: formatUsd(input.currentRent),
    range_line: rangeLine,
    trend_line: trendLine,
    suggestion_line: suggestionLine,
    screenshot,
  };
  const subject = renderBaseCopy(OWNER_RENEWAL_V1_BASE_COPY.subject, replacements);
  const body = OWNER_RENEWAL_V1_BASE_COPY.body
    .map((line) => renderBaseCopy(line, replacements))
    // An absent trend drops its slot entirely rather than leaving a stray blank line.
    .filter((line, index) => {
      const template = OWNER_RENEWAL_V1_BASE_COPY.body[index];
      return !(template === "{{trend_line}}" && line === "");
    })
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

/** Derive the current-rent fact from reconciliation and currency; never assert confidence by origin. */
export function deriveCurrentRentFact(
  input: Pick<
    OwnerDraftInput,
    "currentRent" | "currentRentSource" | "currentRentEvidence"
  >,
): DraftFact {
  const evidence = input.currentRentEvidence;
  const earned =
    evidence?.currencyState === "fresh" &&
    (evidence.agreement === "agree" || evidence.agreement === "resolved");
  const baseSource =
    evidence?.resolvedSource ??
    input.currentRentSource ??
    "Rentvine (read-authoritative)";
  const source = evidence?.readAtIso
    ? `${baseSource} (read ${evidence.readAtIso.slice(0, 10)})`
    : baseSource;
  return {
    key: "current_rent",
    label: "Current rent",
    value: formatUsd(input.currentRent),
    source,
    confidence: earned ? "Verified" : NEEDS_VERIFICATION,
  };
}

function renderBaseCopy(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) => values[key] ?? "");
}
