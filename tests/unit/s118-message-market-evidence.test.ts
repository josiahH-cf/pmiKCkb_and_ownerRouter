import { describe, expect, it } from "vitest";

import {
  STARTING_RANGE_MESSAGE_REQUIREMENT,
  projectMessageMarketEvidence,
} from "@/lib/lease-renewal/message-market-evidence";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";

function preparation(
  market: NonNullable<RenewalWorkspaceState["preparation"]>["market"],
  source = "Reviewed listings on 2026-09-16",
): RenewalWorkspaceState["preparation"] {
  return {
    market,
    source,
    recordedAt: "2026-09-16T12:00:00.000Z",
    recordedByUid: "operator",
    revision: 3,
  };
}

const PROVIDER = {
  source: "RentCast",
  rangeLow: 1450,
  rangeHigh: 1650,
  pointEstimate: 1550,
  compCount: 3,
  retrievedAt: "2026-09-16T11:00:00.000Z",
};

describe("S118 owner-message market evidence (R118.3, R118.4)", () => {
  it("AC-S118-4: a saved starting range is not comparable-rent evidence, by marker or by matching the fresh base rent", () => {
    const marked = projectMessageMarketEvidence({
      preparation: preparation({
        rangeLow: 800,
        rangeHigh: 1200,
        rangeBasis: "starting_rule",
      }),
      currentBaseRent: null,
      approvedSuggestionValue: null,
    });
    expect(marked.range).toBeNull();
    expect(marked.rangeRequirement).toBe(STARTING_RANGE_MESSAGE_REQUIREMENT);

    // $750 yields exactly $600 to $900 under the accepted rule; an unmarked saved pair that
    // equals the fresh band is still the starting range.
    const matching = projectMessageMarketEvidence({
      preparation: preparation({ rangeLow: 600, rangeHigh: 900 }),
      currentBaseRent: 750,
      approvedSuggestionValue: null,
    });
    expect(matching.range).toBeNull();
    expect(matching.rangeRequirement).toBe(STARTING_RANGE_MESSAGE_REQUIREMENT);

    const reviewed = projectMessageMarketEvidence({
      preparation: preparation({
        rangeLow: 850,
        rangeHigh: 1200,
        rangeBasis: "reviewed",
      }),
      currentBaseRent: 1000,
      approvedSuggestionValue: null,
    });
    expect(reviewed.range).toEqual({
      low: 850,
      high: 1200,
      source: "Reviewed listings on 2026-09-16",
    });
    expect(reviewed.rangeRequirement).toBeNull();
  });

  it("AC-S118-3: a provider basis supplies the range with its own attribution even when the typed figures match the starting rule", () => {
    const evidence = projectMessageMarketEvidence({
      preparation: preparation({
        rangeLow: 800,
        rangeHigh: 1200,
        rangeBasis: "provider",
        provider: PROVIDER,
      }),
      currentBaseRent: 1000,
      approvedSuggestionValue: null,
    });
    expect(evidence.range).toEqual({
      low: 1450,
      high: 1650,
      source: "RentCast",
    });
    expect(evidence.rangeRequirement).toBeNull();
  });

  it("S183/S195 supersedes the separate number approval while preserving reference versus staff-selected meaning", () => {
    const current = preparation({
      pmiNumber: 1550,
      recommendationBasis: "provider",
      provider: PROVIDER,
    });
    const reference = projectMessageMarketEvidence({
      preparation: current,
      currentBaseRent: 1000,
      approvedSuggestionValue: null,
    });
    expect(reference.suggestedRent).toEqual({
      value: 1550,
      source: "RentCast point estimate (reference only)",
      kind: "provider_reference",
    });
    expect(reference.notices).toEqual([]);
    const selected = projectMessageMarketEvidence({
      preparation: current,
      currentBaseRent: 1000,
      approvedSuggestionValue: null,
      selectedWorkingOffer: { value: 1525, source: "Working renewal terms" },
    });
    expect(selected.suggestedRent).toEqual({
      value: 1525,
      source: "Working renewal terms",
      kind: "working_offer",
    });
    // A historical approval neither changes the provider observation nor overwrites today's offer.
    expect(
      projectMessageMarketEvidence({
        preparation: current,
        currentBaseRent: 1000,
        approvedSuggestionValue: 1500,
      }).suggestedRent,
    ).toEqual(reference.suggestedRent);
    const reviewed = projectMessageMarketEvidence({
      preparation: preparation({ pmiNumber: 1525, recommendationBasis: "reviewed" }),
      currentBaseRent: 1000,
      approvedSuggestionValue: null,
    });
    expect(reviewed.suggestedRent).toEqual({
      value: 1525,
      source: "Reviewed listings on 2026-09-16",
      kind: "reviewed",
    });
    expect(
      projectMessageMarketEvidence({
        preparation: null,
        currentBaseRent: 1000,
        approvedSuggestionValue: 1550,
      }),
    ).toEqual({ range: null, suggestedRent: null, rangeRequirement: null, notices: [] });
  });
});
