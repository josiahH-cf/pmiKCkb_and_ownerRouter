// Vendor-assignment SUGGESTION for Maintenance Work Order Intake (M-5, owner 2026-07-01: build the
// vendor-assignment stage as a non-executable SUGGESTION).
//
// What we CAN do deterministically: infer the TRADE a work order needs from the issue text. What we
// CANNOT do: name a specific vendor — no vendor roster exists in-repo yet (client-owned), so the
// specific vendor stays a `Needs Verification:` marker until the client provides the roster. This is a
// SUGGESTION a human confirms; it never assigns, never writes to a system of record, never sends.
// Pure + deterministic: no I/O, no Date.now().

import {
  MAINTENANCE_TRADES,
  MAINTENANCE_TRADE_KEYWORDS,
  type MaintenanceTrade,
} from "@/lib/maintenance/constants";

/** The specific-vendor marker: there is no roster yet, so a vendor is never named or invented. */
export const VENDOR_ROSTER_UNVERIFIED = "Needs Verification: client vendor roster";

export interface VendorAssignmentSuggestion {
  kind: "maintenance_vendor_assignment";
  /** Inferred trade/category — a SUGGESTION a human can override; "General" when nothing specific hits. */
  trade: MaintenanceTrade;
  /** The keywords that drove the trade suggestion (empty for the General fallback). */
  matchedKeywords: string[];
  /** Always null — no vendor roster exists; the specific vendor is client-owned + Needs-Verification. */
  suggestedVendor: null;
  vendorRoster: typeof VENDOR_ROSTER_UNVERIFIED;
  rationale: string;
  /** Binding guardrails, surfaced so the UI cannot misrepresent them. */
  requiresApproval: true;
  production_allowed: false;
}

interface TradeHit {
  trade: MaintenanceTrade;
  matchedKeywords: string[];
}

function bestTrade(description: string): TradeHit {
  const text = description.toLowerCase();
  let best: TradeHit = { trade: "General", matchedKeywords: [] };

  // Iterate in MAINTENANCE_TRADES order so ties resolve deterministically to the earlier trade.
  for (const trade of MAINTENANCE_TRADES) {
    if (trade === "General") continue;
    const keywords = MAINTENANCE_TRADE_KEYWORDS[trade];
    const matched = keywords.filter((keyword) => text.includes(keyword));
    if (matched.length > best.matchedKeywords.length) {
      best = { trade, matchedKeywords: [...matched] };
    }
  }

  return best;
}

/**
 * Suggest the vendor trade for a work order from its description. Deterministic: the trade with the
 * most keyword hits wins (ties → MAINTENANCE_TRADES order); no hits → "General". The specific vendor is
 * NEVER named — it stays a Needs-Verification marker until the client roster lands.
 */
export function suggestVendorAssignment(description: string): VendorAssignmentSuggestion {
  const { trade, matchedKeywords } = bestTrade(description);

  const rationale =
    trade === "General"
      ? "No specific trade keyword matched — suggesting a General handyman. Confirm the trade, then assign a vendor from the (client-owned) roster."
      : `Matched ${trade} keyword(s): ${matchedKeywords.join(", ")}. Suggesting a ${trade} vendor. The specific vendor needs the client roster before it can be named or assigned.`;

  return {
    kind: "maintenance_vendor_assignment",
    trade,
    matchedKeywords,
    suggestedVendor: null,
    vendorRoster: VENDOR_ROSTER_UNVERIFIED,
    rationale,
    requiresApproval: true,
    production_allowed: false,
  };
}
