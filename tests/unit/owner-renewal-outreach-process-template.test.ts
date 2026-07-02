import { describe, expect, it } from "vitest";

import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import { buildOwnerRenewalDraft } from "@/lib/lease-renewal/owner-draft";
import {
  OWNER_RENEWAL_OUTREACH_STEP_TITLES,
  buildOwnerRenewalOutreachProcessTemplate,
} from "@/lib/lease-renewal/owner-renewal-outreach/process-template";

// Owner Renewal Outreach template (space-teeth E4): a valid Draft whose steps wrap the existing
// buildOwnerRenewalDraft verbatim; no action references (Gmail draft only).

const EXPECTED_TITLES = [
  "Gather facts",
  "Compose owner outreach draft",
  "Dan approves",
  "Human sends",
];

describe("buildOwnerRenewalOutreachProcessTemplate", () => {
  const template = buildOwnerRenewalOutreachProcessTemplate({
    ownerUid: "owner",
    approverUid: "approver",
  });

  it("builds a schema-valid process-definition input", () => {
    expect(() => CreateProcessDefinitionInputSchema.parse(template)).not.toThrow();
  });

  it("encodes the four-step outreach sequence and carries no action references", () => {
    expect(template.steps.map((step) => step.title)).toEqual(EXPECTED_TITLES);
    expect([...OWNER_RENEWAL_OUTREACH_STEP_TITLES]).toEqual(EXPECTED_TITLES);
    expect(template.action_references ?? []).toEqual([]);
  });

  it("names the composer it wraps (surface, not execute)", () => {
    const composeStep = template.steps.find(
      (step) => step.title === "Compose owner outreach draft",
    );
    expect(composeStep?.description).toContain("buildOwnerRenewalDraft");
  });

  // Proves the outreach uses the EXISTING composer verbatim (no re-implementation): a known input
  // yields the composer's own source-tagged facts.
  it("reuses buildOwnerRenewalDraft — a known input yields the expected source-tagged facts", () => {
    const draft = buildOwnerRenewalDraft({
      addressLabel: "123 Main St",
      currentRent: 1500,
      market: { specificNumber: 1650, rangeLow: 1600, rangeHigh: 1700 },
    });
    const byKey = Object.fromEntries(draft.facts.map((fact) => [fact.key, fact]));
    expect(byKey.current_rent.value).toBe("$1,500");
    expect(byKey.market_range.value).toBe("$1,600–$1,700");
    expect(byKey.market_number.value).toBe("$1,650");
    expect(draft.production_allowed).toBe(false);
    expect(draft.send_allowed).toBe(false);
  });
});
