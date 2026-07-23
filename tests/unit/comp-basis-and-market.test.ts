import { describe, expect, it } from "vitest";

import { zillowSearchUrl } from "@/lib/lease-renewal/market-links";
import {
  buildOwnerRenewalDraft,
  ownerDraftMarketFromBasis,
} from "@/lib/lease-renewal/owner-draft";
import {
  COMP_BASIS_FIELD_KEY,
  COMP_BASIS_FIELD_LABEL,
  buildCompBasisProposal,
} from "@/lib/lease-renewal/writeback-proposal";

describe("zillowSearchUrl", () => {
  it("builds an address-seeded Zillow search URL and encodes the address", () => {
    expect(zillowSearchUrl("104 NE Lindsay Ave")).toBe(
      "https://www.zillow.com/homes/104%20NE%20Lindsay%20Ave_rb/",
    );
  });

  it("returns null for a blank or missing address (no dead link, no PII)", () => {
    expect(zillowSearchUrl("")).toBeNull();
    expect(zillowSearchUrl("   ")).toBeNull();
    expect(zillowSearchUrl(null)).toBeNull();
    expect(zillowSearchUrl(undefined)).toBeNull();
  });
});

describe("ownerDraftMarketFromBasis", () => {
  it("maps the recorded comp basis onto the owner-draft market input (present fields only)", () => {
    expect(
      ownerDraftMarketFromBasis({
        zillowLow: 1450,
        zillowHigh: 1600,
        pmiNumber: 1550,
        compsUrl: "https://www.zillow.com/homes/x_rb/",
      }),
    ).toEqual({
      rangeLow: 1450,
      rangeHigh: 1600,
      specificNumber: 1550,
      compsScreenshotRef: "https://www.zillow.com/homes/x_rb/",
    });
  });

  it("omits fields the operator did not enter (never invents a number)", () => {
    expect(ownerDraftMarketFromBasis({ pmiNumber: 1550 })).toEqual({
      specificNumber: 1550,
    });
    expect(ownerDraftMarketFromBasis({})).toEqual({});
    // A blank comps URL is dropped, not passed through.
    expect(ownerDraftMarketFromBasis({ compsUrl: "   " })).toEqual({});
  });

  it("prefers the stored Drive screenshot ref over the pasted URL (S28a)", () => {
    expect(
      ownerDraftMarketFromBasis({
        compScreenshotRef: "drive:abc123",
        compsUrl: "https://www.zillow.com/homes/x_rb/",
      }),
    ).toEqual({ compsScreenshotRef: "drive:abc123" });
  });

  it("carries the provider source as the range attribution (S28a)", () => {
    expect(
      ownerDraftMarketFromBasis({
        zillowLow: 1450,
        zillowHigh: 1600,
        compSource: "RentCast",
      }),
    ).toEqual({ rangeLow: 1450, rangeHigh: 1600, rangeSource: "RentCast" });
  });
});

describe("buildOwnerRenewalDraft market attribution + Needs Verification (AC-S28-3)", () => {
  const base = { addressLabel: "104 NE Lindsay Ave", currentRent: 1500 };

  it("labels the comparable-range fact with the provider source when present", () => {
    const draft = buildOwnerRenewalDraft({
      ...base,
      market: { rangeLow: 1450, rangeHigh: 1600, rangeSource: "RentCast" },
    });
    const rangeFact = draft.facts.find((fact) => fact.key === "market_range");
    expect(rangeFact?.source).toBe("RentCast");
    expect(rangeFact?.value).toBe("$1,450–$1,600");
  });

  it("renders a Needs Verification marker (never a fabricated range) when comp data is absent", () => {
    const draft = buildOwnerRenewalDraft({ ...base, market: {} });
    const rangeFact = draft.facts.find((fact) => fact.key === "market_range");
    expect(rangeFact?.confidence).toBe("Needs Verification");
    expect(rangeFact?.value).toContain("Needs Verification");
    expect(draft.missingInputs).toContain("market comp range (Zillow)");
    // No fabricated numeric range appears in the composed body.
    expect(draft.body).not.toMatch(/\$\d[\d,]*–\$\d/);
  });

  it("resolves the screenshot fact to a stored Drive ref, not a pasted string (AC-S28-4)", () => {
    const draft = buildOwnerRenewalDraft({
      ...base,
      market: ownerDraftMarketFromBasis({ compScreenshotRef: "drive:abc123" }),
    });
    expect(draft.body).toContain("drive:abc123");
    expect(draft.missingInputs).not.toContain("comps screenshot");
  });
});

describe("buildCompBasisProposal", () => {
  it("proposes a formatted comp-basis value behind the append-only gate", () => {
    const proposal = buildCompBasisProposal({
      zillowLow: 1450,
      zillowHigh: 1600,
      pmiNumber: 1550,
      compsUrl: "https://www.zillow.com/homes/x_rb/",
    });
    expect(proposal.fieldKey).toBe(COMP_BASIS_FIELD_KEY);
    expect(proposal.fieldLabel).toBe(COMP_BASIS_FIELD_LABEL);
    expect(proposal.proposedColumnHeader).toBe("KB Proposed — Comp basis");
    expect(proposal.proposedValue).toBe("Zillow $1,450–$1,600; PMI $1,550");
    expect(proposal.status).toBe("Proposed");
    expect(proposal.valueReady).toBe(true);
    // Rides the same gate: suggestion only, needs approval, never auto-applied.
    expect(proposal.requiresApproval).toBe(true);
    expect(proposal.autoApplyAllowed).toBe(false);
    expect(proposal.suggestionOnly).toBe(true);
    expect(proposal.rationale).toContain("https://www.zillow.com/homes/x_rb/");
  });

  it("proposes just the part the operator entered (Zillow range only)", () => {
    const proposal = buildCompBasisProposal({ zillowLow: 1450, zillowHigh: 1600 });
    expect(proposal.proposedValue).toBe("Zillow $1,450–$1,600");
    expect(proposal.status).toBe("Proposed");
  });

  it("returns a value-less Blocked proposal when no comp numbers were entered (never invents)", () => {
    for (const market of [null, undefined, {}, { compsUrl: "https://x.example" }]) {
      const proposal = buildCompBasisProposal(market);
      expect(proposal.proposedValue).toBeNull();
      expect(proposal.status).toBe("Blocked");
      expect(proposal.valueReady).toBe(false);
    }
  });
});
