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
import {
  computeUnderMarketSignal,
  UNDER_MARKET_THRESHOLD_PCT,
} from "@/lib/lease-renewal/under-market";

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
      // S60: typed numbers always wear the honest operator-entered label.
      rangeSource: "Operator-entered",
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

  // S60 (AC-S60-3): compSource is display metadata about a lookup the operator ran; it NEVER
  // labels operator-typed numbers. Typed numbers wear the operator-entered label.
  it("labels typed numbers operator-entered even when compSource names a provider", () => {
    expect(
      ownerDraftMarketFromBasis({
        zillowLow: 1450,
        zillowHigh: 1600,
        compSource: "RentCast",
      }),
    ).toEqual({ rangeLow: 1450, rangeHigh: 1600, rangeSource: "Operator-entered" });
  });

  // S60 (AC-S60-2): a provider basis supplies its own numbers, label, and retrieval date.
  it("prefers the provider basis with the provider's own label and retrieval date", () => {
    const mapped = ownerDraftMarketFromBasis({
      zillowLow: 1400,
      zillowHigh: 1500,
      provider: {
        source: "RentCast",
        rangeLow: 1450,
        rangeHigh: 1650,
        pointEstimate: 1550,
        compCount: 12,
        retrievedAt: "2026-08-06T12:00:00.000Z",
        trend: {
          zipCode: "64118",
          retrievedAt: "2026-08-06T12:00:00.000Z",
          months: {
            "2024-08": { averageRent: 1400 },
            "2026-07": { averageRent: 1520 },
          },
        },
      },
    });
    expect(mapped.rangeLow).toBe(1450);
    expect(mapped.rangeHigh).toBe(1650);
    expect(mapped.rangeSource).toBe("RentCast");
    expect(mapped.rangeRetrievedAt).toBe("2026-08-06T12:00:00.000Z");
    expect(mapped.trend).toMatchObject({
      zipCode: "64118",
      firstMonth: "2024-08",
      lastMonth: "2026-07",
      firstAverage: 1400,
      lastAverage: 1520,
    });
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
    expect(draft.missingInputs).toContain("market comp range");
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

// S60: the internal under-market signal (AC-S60-7, AC-S60-9).
describe("computeUnderMarketSignal", () => {
  // AC-S60-7: pure over any threshold — confirming a different number is a constant change.
  it.each([
    { thresholdPct: 5, currentRent: 1400, estimate: 1500, expectSignal: true },
    { thresholdPct: 5, currentRent: 1450, estimate: 1500, expectSignal: false },
    { thresholdPct: 10, currentRent: 1350, estimate: 1500, expectSignal: true },
    { thresholdPct: 10, currentRent: 1360, estimate: 1500, expectSignal: false },
    { thresholdPct: 25, currentRent: 1100, estimate: 1500, expectSignal: true },
    { thresholdPct: 25, currentRent: 1200, estimate: 1500, expectSignal: false },
  ])(
    "threshold $thresholdPct%: rent $currentRent vs estimate $estimate → signal=$expectSignal",
    ({ thresholdPct, currentRent, estimate, expectSignal }) => {
      const signal = computeUnderMarketSignal({
        currentRent,
        providerPointEstimate: estimate,
        thresholdPct,
      });
      if (expectSignal) {
        expect(signal).not.toBeNull();
        // The ACTUAL percentage renders, so the reader judges rather than trusts the threshold.
        expect(signal?.message).toContain(`${signal?.percentBelow}%`);
        expect(signal?.percentBelow).toBeGreaterThanOrEqual(thresholdPct);
      } else {
        expect(signal).toBeNull();
      }
    },
  );

  it("defaults to the confirmed 10 percent policy constant", () => {
    expect(UNDER_MARKET_THRESHOLD_PCT).toBe(10);
    expect(
      computeUnderMarketSignal({ currentRent: 1349, providerPointEstimate: 1500 }),
    ).not.toBeNull();
    expect(
      computeUnderMarketSignal({ currentRent: 1360, providerPointEstimate: 1500 }),
    ).toBeNull();
  });

  // AC-S60-9: no provider estimate → no signal. An operator-only basis never produces one.
  it("produces no signal without a provider point estimate", () => {
    expect(computeUnderMarketSignal({ currentRent: 900 })).toBeNull();
    expect(
      computeUnderMarketSignal({ currentRent: 900, providerPointEstimate: 0 }),
    ).toBeNull();
  });

  // AC-S60-8 companion: the signal text never appears in a generated owner draft.
  it("never enters an owner draft, even with a provider basis present", () => {
    const draft = buildOwnerRenewalDraft({
      addressLabel: "104 NE Lindsay Ave",
      currentRent: 900,
      market: ownerDraftMarketFromBasis({
        provider: {
          source: "RentCast",
          rangeLow: 1450,
          rangeHigh: 1650,
          pointEstimate: 1550,
          compCount: 12,
          retrievedAt: "2026-08-06T12:00:00.000Z",
        },
      }),
    });
    expect(draft.body).not.toContain("below the market");
    expect(draft.body).not.toContain("Internal note");
    expect(JSON.stringify(draft.facts)).not.toContain("below the market");
  });
});
