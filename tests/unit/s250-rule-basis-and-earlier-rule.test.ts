// S250 R-S250-8: the tenant offer and the source update previews name the standing agreement's
// rule as the rent's basis; R-S250-7: the one message record reads "Built on the earlier rule"
// and offers to rebuild. The store and composition halves are proven at the backend
// (tests/firestore/s250-message-earlier-rule.test.ts); these are the pure rule and the places
// that render it. Synthetic values only.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STANDING_AGREEMENT_WORDS,
  standingRuleBasis,
  standingRuleContext,
  standingRuleSourceLabel,
} from "@/lib/lease-renewal/standing-agreement";
import { SaveMessagePreparationSchema } from "@/lib/lease-renewal/renewal-message-preparation";

const BASIS =
  "Example Standing Agreement: raise the current rent by 3 percent, applied to the current rent of $1,700.00 and rounded to $1,751. The owner pre-approved renewals at this rule.";
const adopted = {
  origin: "adopted_source",
  sourceLabel: standingRuleSourceLabel("Example Standing Agreement", 1),
  context: standingRuleContext({
    agreementId: "2c3d4e5f-6071-4b82-9c93-ad4e5f6a7b8c",
    policyId: "1b2c3d4e-5f60-4a71-8b82-9c3d4e5f6a7b",
    policyVersion: 1,
    basis: BASIS,
  }),
};

describe("S250 R-S250-8: the rule as the rent's basis", () => {
  it("names the covering agreement's rule, else the rule a saved rent was adopted from", () => {
    expect(
      standingRuleBasis({ covered: true, kind: "standing", basis: BASIS }, null),
    ).toBe(BASIS);
    expect(standingRuleBasis({ covered: false, kind: "standing" }, adopted)).toBe(
      "Standing agreement Example Standing Agreement, rule v1",
    );
  });

  it("names no rule for a typed rent, a comparison's rent or an exact per-cycle agreement", () => {
    const typed = { origin: "typed" };
    const comparison = {
      origin: "adopted_source",
      sourceLabel: "Comparable-rent recommendation",
      context: "Sent in the owner message, revision ABC123.",
    };
    expect(standingRuleBasis({ covered: false }, typed)).toBeNull();
    expect(standingRuleBasis({ covered: false }, comparison)).toBeNull();
    expect(standingRuleBasis({ covered: true, kind: "exact" }, null)).toBeNull();
    expect(standingRuleBasis(null, null)).toBeNull();
  });

  it("the tenant offer and the source update previews render it", () => {
    const tenant = readFileSync(
      "components/lease-renewal/RenewalPreparedMessage.tsx",
      "utf8",
    );
    expect(tenant).toMatch(/api\.channel === "tenant"\s*\?\s*standingRuleBasis\(/);
    expect(tenant).toContain('data-renewal-field="tenant-offer-rule-basis"');
    const previews = readFileSync(
      "components/lease-renewal/RenewalFinishUpPreviews.tsx",
      "utf8",
    );
    expect(previews).toContain("standingRuleBasis(");
    expect(previews).toContain('data-renewal-field="finish-up-rule-basis"');
  });
});

describe("S250 R-S250-7: the message record itself reads Built on the earlier rule", () => {
  it("a save carries the rule the message was built on, by its ids only", () => {
    const base = {
      leaseId: "9102",
      channel: "owner",
      expectedRevision: 1,
      operationId: "5f607182-93a4-4eb5-8fc6-d07b8c9daebf",
      inputs: {
        edits: { responseRequest: "" },
        compScreenshotReceiptId: null,
        charges: [],
        leaseOrigin: null,
        insuranceTransition: null,
        otherChargesComparison: null,
        signature: null,
      },
    };
    const ruleBasis = {
      agreementId: "2c3d4e5f-6071-4b82-9c93-ad4e5f6a7b8c",
      policyId: "1b2c3d4e-5f60-4a71-8b82-9c3d4e5f6a7b",
      policyVersion: 1,
    };
    expect(SaveMessagePreparationSchema.safeParse({ ...base, ruleBasis }).success).toBe(
      true,
    );
    expect(
      SaveMessagePreparationSchema.safeParse({ ...base, ruleBasis: null }).success,
    ).toBe(true);
    expect(SaveMessagePreparationSchema.safeParse(base).success).toBe(true);
    expect(
      SaveMessagePreparationSchema.safeParse({
        ...base,
        ruleBasis: { ...ruleBasis, rent: 1751 },
      }).success,
    ).toBe(false);
  });

  it("the Now card's message shows the notice and offers the rebuild, and every save carries the rule", () => {
    const card = readFileSync(
      "components/lease-renewal/RenewalPreparedMessage.tsx",
      "utf8",
    );
    expect(card).toContain('data-renewal-field="message-earlier-rule"');
    expect(card).toContain("STANDING_AGREEMENT_WORDS.earlierRule");
    expect(card).toContain("STANDING_AGREEMENT_WORDS.rebuild");
    const editor = readFileSync(
      "components/lease-renewal/RenewalMessagePreparation.tsx",
      "utf8",
    );
    // Every autosave carries the rule shown, or the rebuild staff chose; a rebuild chosen while
    // an earlier save is in flight is cleared only by the save that carried it.
    expect(editor).toContain("const rebuild = ruleOverride.current;");
    expect(editor).toMatch(
      /savePayload\(local, server, rebuild \?\? server\.ruleBasis \?\? null\)/,
    );
    expect(editor).toContain(
      "if (rebuild && ruleOverride.current === rebuild) ruleOverride.current = null;",
    );
    expect(editor).toContain("onRebuildRule={rebuildRule}");
    expect(STANDING_AGREEMENT_WORDS.earlierRule).toBe("Built on the earlier rule");
  });
});
