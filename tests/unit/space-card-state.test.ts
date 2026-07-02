import { describe, expect, it } from "vitest";
import { SPACE_CARD_STATE_LABEL, computeSpaceCardState } from "@/lib/space-card-state";
import type { LaunchSpace } from "@/lib/spaces";

// Presence covering RentVine + the renewal sheet + Drive so mapped Spaces are "connected".
// The DWD pair is part of the Sheets/Drive truth since S13 D2 (the runtime reads via DWD).
const ALL_PRESENT: Record<string, boolean> = {
  RENTVINE_API_BASE_URL: true,
  RENTVINE_API_KEY: true,
  RENTVINE_API_SECRET: true,
  RENEWAL_SHEET_ID: true,
  SHEETS_IMPERSONATE_SA: true,
  SHEETS_DWD_SUBJECT: true,
  SPACE_DRIVE_FOLDER_IDS: true,
};
const NONE_PRESENT: Record<string, boolean> = {};

const leaseRenewals: LaunchSpace = {
  id: "lease-renewals",
  name: "Lease Renewals",
  processCategory: "Renewals",
  processDefinitionId: "lease-renewal",
};
const moveIn: LaunchSpace = {
  id: "move-in",
  name: "Move-In",
  processCategory: "Move-In",
  processDefinitionId: "move-in",
};
const moveOut: LaunchSpace = {
  id: "move-out-deposit-disposition",
  name: "Move-Out + Deposit Disposition",
  processCategory: "Move-Out",
  processDefinitionId: "move-out-deposit-disposition",
};
// A genuinely unmapped scaffold Space (no connector dependency, no seeded process).
const ownerOnboarding: LaunchSpace = {
  id: "owner-onboarding",
  name: "Owner Onboarding",
  processCategory: "Onboarding",
};
const ownerEmail: LaunchSpace = {
  id: "owner-email",
  name: "Owner Email",
  processCategory: "Owner Email",
  readOnly: true,
};

describe("computeSpaceCardState", () => {
  it("returns has-a-process when the Space's definition is seeded and connections are present", () => {
    expect(
      computeSpaceCardState(leaseRenewals, new Set(["lease-renewal"]), ALL_PRESENT),
    ).toBe("has-a-process");
  });

  it("surfaces connections-needed first, even when the process is seeded", () => {
    // Blocking gap wins over process presence.
    expect(
      computeSpaceCardState(leaseRenewals, new Set(["lease-renewal"]), NONE_PRESENT),
    ).toBe("connections-needed");
  });

  it("returns needs-a-process for a mapped Space whose definition is not seeded", () => {
    expect(computeSpaceCardState(leaseRenewals, new Set(), ALL_PRESENT)).toBe(
      "needs-a-process",
    );
  });

  it("returns needs-a-process for an unmapped scaffold Space (never mislabeled connections-needed)", () => {
    expect(computeSpaceCardState(ownerOnboarding, new Set(), NONE_PRESENT)).toBe(
      "needs-a-process",
    );
  });

  it("flips Move-In and Move-Out to has-a-process once their definitions are seeded and connections are present", () => {
    const seeded = new Set(["move-in", "move-out-deposit-disposition"]);
    expect(computeSpaceCardState(moveIn, seeded, ALL_PRESENT)).toBe("has-a-process");
    expect(computeSpaceCardState(moveOut, seeded, ALL_PRESENT)).toBe("has-a-process");
  });

  it("still surfaces connections-needed for Move-In/Move-Out when RentVine/Sheets presence is missing", () => {
    const seeded = new Set(["move-in", "move-out-deposit-disposition"]);
    expect(computeSpaceCardState(moveIn, seeded, NONE_PRESENT)).toBe(
      "connections-needed",
    );
    expect(computeSpaceCardState(moveOut, seeded, NONE_PRESENT)).toBe(
      "connections-needed",
    );
  });

  it("short-circuits read-only reference Spaces", () => {
    expect(computeSpaceCardState(ownerEmail, new Set(), NONE_PRESENT)).toBe("reference");
  });

  it("has a label for every state", () => {
    for (const state of [
      "connections-needed",
      "needs-a-process",
      "has-a-process",
      "reference",
    ] as const) {
      expect(SPACE_CARD_STATE_LABEL[state]).toBeTruthy();
    }
  });
});
