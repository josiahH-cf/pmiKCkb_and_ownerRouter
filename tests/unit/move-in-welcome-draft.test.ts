import { describe, expect, it } from "vitest";

import { buildWelcomeDraft } from "@/lib/move-in/welcome-draft";

// Move-In welcome draft (space-teeth E2e): draft-only, fees are a "see RentVine" pointer (never a
// hard-coded amount), deposit posture cites the 2× policy as text, and missing inputs stay visible.

describe("buildWelcomeDraft", () => {
  const full = buildWelcomeDraft({
    tenantName: "Jordan Rivers",
    propertyLabel: "123 Main St, Unit B",
    moveInDate: "2026-08-01",
    depositPosture: "cash",
  });

  it("is draft-only (production_allowed / send_allowed are literal false)", () => {
    expect(full.production_allowed).toBe(false);
    expect(full.send_allowed).toBe(false);
    expect(full.kind).toBe("move_in_welcome");
  });

  it("renders fees as a 'see RentVine' pointer and NEVER a dollar figure", () => {
    expect(full.feesNote).toContain("see RentVine");
    const feesFact = full.facts.find((fact) => fact.key === "fees");
    expect(feesFact?.value).toBe("see RentVine");
    // No composed surface may contain a hard-coded dollar amount.
    for (const surface of [
      full.emailSubject,
      full.emailBody,
      full.portalChatMessage,
      full.feesNote,
      full.depositPostureNote,
    ]) {
      expect(surface).not.toContain("$");
    }
  });

  it("cites the deposit posture as text (2× policy), never a computed amount", () => {
    expect(full.depositPostureNote).toContain("2×");
    expect(full.depositPostureNote).not.toContain("$");
    const replacement = buildWelcomeDraft({
      tenantName: "A",
      propertyLabel: "B",
      moveInDate: "2026-08-01",
      depositPosture: "replacement",
    });
    expect(replacement.depositPostureNote.toLowerCase()).toContain("deposit-replacement");
  });

  it("emits Needs-Verification markers for missing inputs (never invents them)", () => {
    const bare = buildWelcomeDraft({});
    expect(bare.missingInputs).toEqual(
      expect.arrayContaining([
        "tenant name",
        "property/unit",
        "move-in date",
        "deposit posture",
      ]),
    );
    expect(bare.depositPostureNote).toContain("Needs Verification:");
    expect(bare.emailBody).toContain("Needs Verification: tenant name");
  });

  it("has no missing inputs when everything is supplied", () => {
    expect(full.missingInputs).toEqual([]);
    expect(full.emailBody).toContain("Jordan Rivers");
    expect(full.portalChatMessage).toContain("123 Main St, Unit B");
  });
});
