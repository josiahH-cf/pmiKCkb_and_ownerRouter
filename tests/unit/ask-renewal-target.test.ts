import { describe, expect, it } from "vitest";

import { matchRenewalTarget } from "@/lib/ask/renewal-target";

const CANDIDATES = [
  { leaseId: "42", addressLabel: "1234 Oak St" },
  { leaseId: "43", addressLabel: "5678 Maple Ave, Unit 2" },
  { leaseId: "44", addressLabel: "9100 Oak Ct" },
];

describe("matchRenewalTarget (AC-S33-4)", () => {
  it("resolves the single lease whose street number + name the question contains", () => {
    expect(matchRenewalTarget("start the renewal for 1234 Oak St", CANDIDATES)).toEqual({
      leaseId: "42",
      addressLabel: "1234 Oak St",
    });
    expect(matchRenewalTarget("renew 5678 Maple please", CANDIDATES)).toEqual({
      leaseId: "43",
      addressLabel: "5678 Maple Ave, Unit 2",
    });
  });

  it("returns null when no candidate address is named (never a best-guess lease)", () => {
    expect(matchRenewalTarget("how do renewals work?", CANDIDATES)).toBeNull();
    // A street name without its number does not match (strict).
    expect(matchRenewalTarget("renew the Oak place", CANDIDATES)).toBeNull();
    // A number without the street word does not match.
    expect(matchRenewalTarget("renew unit 1234", CANDIDATES)).toBeNull();
  });

  it("returns null on an ambiguous match (more than one candidate)", () => {
    const ambiguous = [
      { leaseId: "1", addressLabel: "1234 Oak St" },
      { leaseId: "2", addressLabel: "1234 Oak Ct" },
    ];
    expect(matchRenewalTarget("renew 1234 Oak", ambiguous)).toBeNull();
  });

  it("returns null for an empty candidate set", () => {
    expect(matchRenewalTarget("renew 1234 Oak St", [])).toBeNull();
  });
});
