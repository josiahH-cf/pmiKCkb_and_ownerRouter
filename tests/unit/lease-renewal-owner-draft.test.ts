import { describe, expect, it } from "vitest";
import {
  buildOwnerRenewalDraft,
  formatUsd,
  ownerDraftMarketFromBasis,
} from "@/lib/lease-renewal/owner-draft";
import { TEST_OWNER_DRAFT_ATTACHMENT } from "@/tests/helpers/renewal-draft-attachment";

describe("formatUsd", () => {
  it("formats whole and fractional dollars with separators", () => {
    expect(formatUsd(1250)).toBe("$1,250");
    expect(formatUsd(1289.95)).toBe("$1,289.95");
    expect(formatUsd(950)).toBe("$950");
  });
});

describe("buildOwnerRenewalDraft", () => {
  it("composes a source-tagged draft with no send authority", () => {
    const draft = buildOwnerRenewalDraft({
      addressLabel: "104 NE Lindsay Ave",
      currentRent: 1100,
      currentRentEvidence: {
        agreement: "agree",
        currencyState: "fresh",
        readAtIso: "2026-08-26T12:00:00.000Z",
      },
      market: {
        rangeLow: 895,
        rangeHigh: 1450,
        specificNumber: 1210,
        compScreenshotAttachment: TEST_OWNER_DRAFT_ATTACHMENT,
      },
    });

    expect(draft.production_allowed).toBe(false);
    expect(draft.send_allowed).toBe(false);
    expect(draft.missingInputs).toEqual([]);
    expect(draft.body).toContain("104 NE Lindsay Ave");
    expect(draft.body).toContain("$1,100");
    expect(draft.body).toContain("$895");
    expect(draft.body).toContain("$1,450");
    expect(draft.body).not.toContain("Needs Verification");

    const rent = draft.facts.find((f) => f.key === "current_rent");
    expect(rent).toMatchObject({
      confidence: "Verified",
      source: "Rentvine (read-authoritative) (read 2026-08-26)",
    });
  });

  it("refuses Verified when current rent conflicts or the read is stale", () => {
    const base = {
      addressLabel: "104 NE Lindsay Ave",
      currentRent: 1100,
      market: {
        rangeLow: 1000,
        rangeHigh: 1200,
        specificNumber: 1100,
        compScreenshotAttachment: TEST_OWNER_DRAFT_ATTACHMENT,
      },
    } as const;
    const conflict = buildOwnerRenewalDraft({
      ...base,
      currentRentEvidence: {
        agreement: "conflict",
        currencyState: "fresh",
        readAtIso: "2026-08-26T12:00:00.000Z",
      },
    });
    const stale = buildOwnerRenewalDraft({
      ...base,
      currentRentEvidence: {
        agreement: "agree",
        currencyState: "stale",
        readAtIso: "2026-08-26T11:00:00.000Z",
      },
    });

    expect(conflict.facts.find((fact) => fact.key === "current_rent")?.confidence).toBe(
      "Needs Verification",
    );
    expect(stale.facts.find((fact) => fact.key === "current_rent")?.confidence).toBe(
      "Needs Verification",
    );
    expect(conflict.missingInputs).toContain("current rent confirmation");
    expect(stale.missingInputs).toContain("current rent confirmation");
  });

  it("renders Needs Verification markers and lists every missing market input", () => {
    const draft = buildOwnerRenewalDraft({
      addressLabel: "100 Birchwood Ln",
      currentRent: 1250,
    });

    expect(draft.body).toContain("Needs Verification");
    expect(draft.missingInputs).toEqual([
      "current rent confirmation",
      "market comp range",
      "specific market number (PMI rental-analysis tool)",
      "comps screenshot",
    ]);
    const range = draft.facts.find((f) => f.key === "market_range");
    expect(range?.confidence).toBe("Needs Verification");
    // The only dollar figure is the Verified current rent; no invented market number appears.
    expect(draft.body).toContain("$1,250");
    expect(draft.facts.some((f) => f.key === "market_number")).toBe(false);
  });

  it("renders an explicit marker when current rent is absent and never invents $0", () => {
    const draft = buildOwnerRenewalDraft({
      addressLabel: "100 Birchwood Ln",
      currentRent: null,
      currentRentEvidence: {
        agreement: "missing",
        currencyState: "fresh",
        readAtIso: "2026-08-26T12:00:00.000Z",
      },
    });

    expect(draft.body).toContain("[Needs Verification: current rent]");
    expect(draft.body).not.toContain("$0");
    expect(draft.facts.find((fact) => fact.key === "current_rent")).toMatchObject({
      value: "[Needs Verification: current rent]",
      confidence: "Needs Verification",
    });
    expect(draft.missingInputs).toContain("current rent confirmation");
  });

  it.each([
    ["zero", 0, "$0"],
    ["negative", -1250, "$-1,250"],
    ["NaN", Number.NaN, "$NaN"],
    ["infinite", Number.POSITIVE_INFINITY, "$Infinity"],
  ])(
    "treats a %s current-rent value as missing even when the source evidence agrees",
    (_label, currentRent, unsafeDisplay) => {
      const draft = buildOwnerRenewalDraft({
        addressLabel: "100 Birchwood Ln",
        currentRent,
        currentRentEvidence: {
          agreement: "agree",
          currencyState: "fresh",
          readAtIso: "2026-08-26T12:00:00.000Z",
        },
      });

      expect(draft.body).toContain("[Needs Verification: current rent]");
      expect(draft.body).not.toContain(unsafeDisplay);
      expect(draft.facts.find((fact) => fact.key === "current_rent")).toMatchObject({
        value: "[Needs Verification: current rent]",
        confidence: "Needs Verification",
      });
      expect(draft.missingInputs).toContain("current rent confirmation");
    },
  );

  it("handles a PARTIAL market input (range present, number + screenshot absent)", () => {
    const draft = buildOwnerRenewalDraft({
      addressLabel: "100 Birchwood Ln",
      currentRent: 1250,
      market: { rangeLow: 900, rangeHigh: 1200 },
    });
    expect(draft.missingInputs).toEqual([
      "current rent confirmation",
      "specific market number (PMI rental-analysis tool)",
      "comps screenshot",
    ]);
    const range = draft.facts.find((f) => f.key === "market_range");
    expect(range?.confidence).toBe("Likely");
    expect(draft.body).toContain("$900 to $1,200");
    // The absent specific number renders a marker, never an invented figure.
    expect(draft.body).toContain("Needs Verification");
    expect(draft.facts.some((f) => f.key === "market_number")).toBe(false);
  });

  it("is deterministic", () => {
    const input = { addressLabel: "X", currentRent: 1000 } as const;
    expect(buildOwnerRenewalDraft(input)).toEqual(buildOwnerRenewalDraft(input));
  });

  // AC-S29-2: no draft entry without approval; the number appears only for an Approved record.
  it("renders Needs Verification for a computed-but-unapproved suggestion (no approvedSuggestion supplied)", () => {
    const draft = buildOwnerRenewalDraft({
      addressLabel: "104 NE Lindsay Ave",
      currentRent: 2200,
      // The operator captured comps but NO Admin approval exists, so no approvedSuggestion is passed.
      market: { rangeLow: 2200, rangeHigh: 2500 },
    });
    // The suggested-number slot is a Needs Verification marker, and there is NO "Suggested market value" fact.
    expect(draft.facts.some((f) => f.key === "market_number")).toBe(false);
    expect(draft.body).toContain("Needs Verification");
    expect(draft.missingInputs).toContain(
      "specific market number (PMI rental-analysis tool)",
    );
    expect(draft.production_allowed).toBe(false);
    expect(draft.send_allowed).toBe(false);
  });

  it("carries the exact Admin-approved number with the distinct comp-derived source label", () => {
    const draft = buildOwnerRenewalDraft({
      addressLabel: "104 NE Lindsay Ave",
      currentRent: 2200,
      market: {
        rangeLow: 2200,
        rangeHigh: 2500,
        compScreenshotAttachment: TEST_OWNER_DRAFT_ATTACHMENT,
        approvedSuggestion: {
          value: 2350,
          comps: [
            { rent: 2200, source: "Manual comp low" },
            { rent: 2500, source: "Manual comp high" },
          ],
        },
      },
    });
    const marketNumber = draft.facts.find((f) => f.key === "market_number");
    expect(marketNumber).toMatchObject({
      value: "$2,350",
      source: "Comp-derived suggestion (Admin-approved)",
      confidence: "Likely",
    });
    expect(draft.body).toContain("$2,350");
    expect(draft.body).toContain("comparable rents");
    // Still draft-only in every case.
    expect(draft.production_allowed).toBe(false);
    expect(draft.send_allowed).toBe(false);
  });

  it("prefers the Admin-approved number over the operator's own PMI number", () => {
    const draft = buildOwnerRenewalDraft({
      addressLabel: "104 NE Lindsay Ave",
      currentRent: 2200,
      market: {
        specificNumber: 9999,
        approvedSuggestion: {
          value: 2350,
          comps: [{ rent: 2350, source: "RentCast median" }],
        },
      },
    });
    const marketNumber = draft.facts.find((f) => f.key === "market_number");
    expect(marketNumber?.value).toBe("$2,350");
    expect(marketNumber?.source).toBe("Comp-derived suggestion (Admin-approved)");
    expect(draft.body).not.toContain("$9,999");
  });
});

// S60: the draft tells the truth about its source or says nothing.
describe("S60 owner-draft source truth", () => {
  // AC-S60-3 (the exact pre-S60 defect): operator-typed numbers with compSource set to a provider
  // name must NEVER be attributed to that provider.
  it("never attributes operator-typed numbers to a provider label", () => {
    const market = ownerDraftMarketFromBasis({
      rangeLow: 1400,
      rangeHigh: 1600,
      compSource: "RentCast",
    });
    const draft = buildOwnerRenewalDraft({
      addressLabel: "104 NE Lindsay Ave",
      currentRent: 1250,
      market,
    });
    const range = draft.facts.find((fact) => fact.key === "market_range");
    expect(range?.value).toContain("$1,400");
    expect(range?.source).not.toBe("RentCast");
  });

  // AC-S60-4: with no basis, the marker names no provider.
  it("renders a provider-free Needs Verification marker", () => {
    const draft = buildOwnerRenewalDraft({
      addressLabel: "104 NE Lindsay Ave",
      currentRent: 1250,
    });
    expect(draft.facts.find((fact) => fact.key === "market_range")?.source).toBe(
      "Market comps",
    );
  });
});
