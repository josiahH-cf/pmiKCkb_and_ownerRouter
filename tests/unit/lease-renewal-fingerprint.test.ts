import { describe, expect, it } from "vitest";
import {
  FINGERPRINT_MATCH_THRESHOLD,
  fingerprintTab,
  normalizeHeaderText,
  UNRECOGNIZED_TAB,
} from "@/lib/lease-renewal/fingerprint";
import {
  SYNTHETIC_CREDENTIAL_TAB_4,
  SYNTHETIC_CREDENTIAL_TAB_7,
  SYNTHETIC_INSPECTION_TRACKER_TAB,
  SYNTHETIC_MOVE_IN_TAB,
  SYNTHETIC_MOVE_OUT_TAB,
  SYNTHETIC_PROPERTY_ATTRIBUTES_TAB,
  SYNTHETIC_RENEWALS_6COL_FRAGMENT,
  SYNTHETIC_RENEWALS_TAB,
  SYNTHETIC_UNRECOGNIZED_TAB,
} from "../fixtures/lease-renewal/synthetic-renewal-sheet";

describe("fingerprintTab", () => {
  it("identifies each known tab by content, above the threshold", () => {
    const cases: Array<[{ grid: typeof SYNTHETIC_RENEWALS_TAB.grid }, string, number]> = [
      [SYNTHETIC_RENEWALS_TAB, "Renewals", 3],
      [SYNTHETIC_MOVE_IN_TAB, "Move-In Checklist", 1],
      [SYNTHETIC_MOVE_OUT_TAB, "Move-Out Checklist", 2],
      [SYNTHETIC_INSPECTION_TRACKER_TAB, "Inspection Tracker", 17],
      [SYNTHETIC_PROPERTY_ATTRIBUTES_TAB, "Property Attributes", 18],
    ];

    for (const [fixture, expectedTab, expectedNumber] of cases) {
      const result = fingerprintTab(fixture.grid);
      expect(result.tab, expectedTab).toBe(expectedTab);
      expect(result.tabNumber).toBe(expectedNumber);
      expect(result.credentialBearing).toBe(false);
      expect(result.score).toBeGreaterThanOrEqual(FINGERPRINT_MATCH_THRESHOLD);
    }
  });

  it("identifies credential-bearing tabs 4 and 7 and flags them", () => {
    const tab4 = fingerprintTab(SYNTHETIC_CREDENTIAL_TAB_4.grid);
    expect(tab4.tab).toBe("PadSplit WiFi");
    expect(tab4.tabNumber).toBe(4);
    expect(tab4.credentialBearing).toBe(true);

    const tab7 = fingerprintTab(SYNTHETIC_CREDENTIAL_TAB_7.grid);
    expect(tab7.tab).toBe("Platform Logins");
    expect(tab7.tabNumber).toBe(7);
    expect(tab7.credentialBearing).toBe(true);
  });

  it("returns UNRECOGNIZED for the headerless 6-col fragment", () => {
    const result = fingerprintTab(SYNTHETIC_RENEWALS_6COL_FRAGMENT.grid);
    expect(result.tab).toBe(UNRECOGNIZED_TAB);
    expect(result.tabNumber).toBeNull();
    expect(result.score).toBe(0);
  });

  it("returns UNRECOGNIZED for a non-matching grid and an empty grid", () => {
    expect(fingerprintTab(SYNTHETIC_UNRECOGNIZED_TAB.grid).tab).toBe(UNRECOGNIZED_TAB);
    expect(fingerprintTab([]).tab).toBe(UNRECOGNIZED_TAB);
    expect(fingerprintTab([["", "", ""]]).tab).toBe(UNRECOGNIZED_TAB);
  });

  it("still matches when some signature headers are missing but stays above threshold", () => {
    // Only 3 of the 5 Renewals signature phrases present (0.6 >= 0.5).
    const partial = fingerprintTab([
      ["Renewal Date", "Have we confirmed pricing with the owner?", "Current Rent"],
      ["8/31/2026", "yes", "$1,250"],
    ]);
    expect(partial.tab).toBe("Renewals");
    expect(partial.score).toBeCloseTo(0.6, 5);
  });

  it("returns UNRECOGNIZED when too few signature headers are present", () => {
    // Only 1 of the 5 Renewals signature phrases (0.2 < 0.5).
    const tooFew = fingerprintTab([
      ["Renewal Date", "some other column", "misc"],
      ["8/31/2026", "x", "y"],
    ]);
    expect(tooFew.tab).toBe(UNRECOGNIZED_TAB);
  });

  it("is order-independent and deterministic", () => {
    const forward = fingerprintTab(SYNTHETIC_RENEWALS_TAB.grid);
    const reversed = fingerprintTab([...SYNTHETIC_RENEWALS_TAB.grid].reverse());
    expect(reversed).toEqual(forward);
  });

  it("normalizes header text predictably", () => {
    expect(normalizeHeaderText("  Have we confirmed pricing with the owner?  ")).toBe(
      "have we confirmed pricing with the owner",
    );
    expect(normalizeHeaderText("What is the Lease/Tenant name?")).toBe(
      "what is the lease tenant name",
    );
  });
});
