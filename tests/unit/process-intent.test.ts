import { describe, expect, it } from "vitest";

import { detectProcess } from "@/lib/processes/intent";

// Deterministic process intent-detection (R4 hybrid, free first pass). Matches name tokens + domain
// aliases against the question; null when nothing clearly fits. No model, no network.

const PROCESSES = [
  { id: "lease-renewal", name: "Lease Renewal" },
  { id: "maintenance-work-order-intake", name: "Maintenance Work Order Intake" },
];

describe("detectProcess", () => {
  it("matches a lease-renewal question via alias", () => {
    expect(
      detectProcess("When is the Johnson lease up for renewal?", PROCESSES)?.processId,
    ).toBe("lease-renewal");
  });

  it("matches a maintenance question via aliases (broken / work order)", () => {
    expect(
      detectProcess("There's a broken faucet — need a work order", PROCESSES)?.processId,
    ).toBe("maintenance-work-order-intake");
  });

  it("returns null when nothing matches", () => {
    expect(detectProcess("What's the weather today?", PROCESSES)).toBeNull();
  });

  it("matches on process name tokens for processes without an alias entry", () => {
    const match = detectProcess("walk me through onboarding for a new owner", [
      { id: "owner-onboarding", name: "Owner Onboarding" },
    ]);
    expect(match?.processId).toBe("owner-onboarding");
  });

  it("ignores stopwords so common phrasing does not false-match", () => {
    expect(detectProcess("what do i need to do", PROCESSES)).toBeNull();
  });

  it("returns the matched terms for transparency", () => {
    const match = detectProcess("renew the lease", PROCESSES);
    expect(match?.processId).toBe("lease-renewal");
    expect(match?.matchedTerms).toContain("renew");
    expect(match?.matchedTerms).toContain("lease");
  });
});
