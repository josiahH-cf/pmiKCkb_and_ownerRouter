import { describe, expect, it } from "vitest";

import { WELCOME_V1_BASE_COPY, buildWelcomeDraft } from "@/lib/move-in/welcome-draft";

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

// F-TMPL-6: the email body renders from the frozen base copy by default, but an Admin-approved store
// body can be injected. Default output MUST equal explicitly injecting the base copy (proves the
// tokenized refactor did not change the shipped wording); an edited body flows through with the same
// governed facts, and the subject/Portal Chat always use the base wording.
describe("buildWelcomeDraft editable copy (F-TMPL-6)", () => {
  const input = {
    tenantName: "Jordan Rivers",
    propertyLabel: "123 Main St, Unit B",
    moveInDate: "2026-08-01",
    depositPosture: "cash" as const,
  };

  it("default output is byte-identical to injecting the frozen base copy", () => {
    const fallback = buildWelcomeDraft(input);
    const injected = buildWelcomeDraft(input, {
      emailBodyTemplate: WELCOME_V1_BASE_COPY.emailBody,
    });
    expect(injected.emailBody).toBe(fallback.emailBody);
    expect(injected.emailSubject).toBe(fallback.emailSubject);
  });

  it("renders an Admin-edited body with the same source-tagged facts", () => {
    const edited = buildWelcomeDraft(input, {
      emailBodyTemplate:
        "Hi {{tenant}} — your home at {{property}} is ready ({{fees_pointer}}).",
    });
    expect(edited.emailBody).toBe(
      "Hi Jordan Rivers — your home at 123 Main St, Unit B is ready (see RentVine).",
    );
    // Subject and Portal Chat still use the base wording, not the injected body.
    expect(edited.emailSubject).toBe("Welcome to 123 Main St, Unit B");
    expect(edited.portalChatMessage).toContain("123 Main St, Unit B");
  });

  it("keeps Needs-Verification markers when an injected body references a missing fact", () => {
    const bare = buildWelcomeDraft(
      {},
      { emailBodyTemplate: "Hello {{tenant}}, welcome to {{property}}." },
    );
    expect(bare.emailBody).toContain("Needs Verification: tenant name");
    expect(bare.emailBody).toContain("Needs Verification: property/unit");
  });
});
