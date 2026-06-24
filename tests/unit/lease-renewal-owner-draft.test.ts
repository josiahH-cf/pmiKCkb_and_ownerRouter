import { describe, expect, it } from "vitest";
import { buildOwnerRenewalDraft, formatUsd } from "@/lib/lease-renewal/owner-draft";

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
      market: {
        rangeLow: 895,
        rangeHigh: 1450,
        specificNumber: 1210,
        compsScreenshotRef: "comps.png",
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
      source: "Rentvine (read-authoritative)",
    });
  });

  it("renders Needs Verification markers and lists every missing market input", () => {
    const draft = buildOwnerRenewalDraft({
      addressLabel: "100 Birchwood Ln",
      currentRent: 1250,
    });

    expect(draft.body).toContain("Needs Verification");
    expect(draft.missingInputs).toEqual([
      "market comp range (Zillow)",
      "specific market number (PMI rental-analysis tool)",
      "comps screenshot",
    ]);
    const range = draft.facts.find((f) => f.key === "market_range");
    expect(range?.confidence).toBe("Needs Verification");
    // The only dollar figure is the Verified current rent; no invented market number appears.
    expect(draft.body).toContain("$1,250");
    expect(draft.facts.some((f) => f.key === "market_number")).toBe(false);
  });

  it("handles a PARTIAL market input (range present, number + screenshot absent)", () => {
    const draft = buildOwnerRenewalDraft({
      addressLabel: "100 Birchwood Ln",
      currentRent: 1250,
      market: { rangeLow: 900, rangeHigh: 1200 },
    });
    expect(draft.missingInputs).toEqual([
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
});
