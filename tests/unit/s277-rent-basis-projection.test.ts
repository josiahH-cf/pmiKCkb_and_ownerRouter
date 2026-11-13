import { describe, expect, it } from "vitest";

import {
  projectGuidedPriority,
  type GuidedPriorityFacts,
} from "@/lib/lease-renewal/guided-priority";
import type { RenewalPathStepId } from "@/lib/lease-renewal/renewal-path";
import type {
  RenewalPathStepView,
  RenewalStage,
} from "@/lib/lease-renewal/renewal-stage";
import {
  RENT_BASIS_WORDS,
  formatRentAmount,
  recommendationBasisLine,
  rentBasisOf,
  rentBasisPhrase,
  rentViewBasisPhrase,
  workingBaseWords,
} from "@/lib/lease-renewal/rent-basis";
import {
  STANDING_ADOPTION_CONTROL_ID,
  adoptedStandingRule,
  standingAdoptionOffer,
  standingAdoptionSave,
} from "@/lib/lease-renewal/standing-agreement";
import type { WorkingFieldEntry } from "@/lib/lease-renewal/working-record";

// S277 ARCH-S277-1 / ARCH-S277-2 / R-S277-2 / R-S277-6 / AC-S277-1 / AC-S277-2: the one adoption
// writer's stored basis and the one basis projection every surface reads. Fail-first on the
// starting state: lib/lease-renewal/rent-basis.ts and the adoption helpers did not exist, so every
// case here failed on import, and "Set renewal base rent" on a covered lease named the Pricing
// basis container (its first radio, "Owner decides each renewal"). Every value is synthetic.

const CYCLE = "0f1c8f6e-6d1c-4bd3-9d7a-00000000000a";
const AGREEMENT_ID = "6a1f3c2e-5b4d-4e8f-9a7b-1c2d3e4f5a6b";
const POLICY_ID = "5d3f8275-0f4f-4c5c-909b-23103711c953";
const AGREEMENT = "Example Standing Agreement";
// 18:00 UTC is midday in Kansas City, so the business date is 11/12/2026.
const SAVED_AT = "2026-11-12T18:00:00.000Z";

function entry(
  value: number | null,
  extra: Partial<WorkingFieldEntry> = {},
): WorkingFieldEntry {
  return {
    value,
    revision: 1,
    eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000101",
    recordedAt: SAVED_AT,
    recordedByUid: "editor-1",
    recordedByLabel: "editor1@pmikcmetro.com",
    origin: "staff_entry",
    cycleId: CYCLE,
    ...extra,
  };
}

const COMPARISON_BASIS =
  "Suggested from the stored comparison: Median of 5 comparable rents ($1,450 to $1,550).";

/** What the monthly preparation saves for a comparison suggestion (S249). */
const PREPARED_COMPARISON = entry(1500, {
  origin: "adopted_source",
  sourceLabel: "stored market comparison",
  context: JSON.stringify({
    cycleId: CYCLE,
    cycleDateIso: "2026-12-31",
    basis: COMPARISON_BASIS,
  }),
});

const STAFF_ADOPTION = standingAdoptionSave({
  agreementId: AGREEMENT_ID,
  agreementName: AGREEMENT,
  policyId: POLICY_ID,
  policyVersion: 1,
  basis: `${AGREEMENT}: raise the current rent by 3 percent.`,
});
const PREPARED_ADOPTION = standingAdoptionSave({
  agreementId: AGREEMENT_ID,
  agreementName: AGREEMENT,
  policyId: POLICY_ID,
  policyVersion: 1,
  basis: `${AGREEMENT}: raise the current rent by 3 percent. Cycle 2026-12-31 (${CYCLE}).`,
});

const COVERED = {
  covered: true,
  kind: "standing",
  reason: `Covered by ${AGREEMENT}: no owner message needed.`,
  agreementId: AGREEMENT_ID,
  agreementVersion: 1,
  label: AGREEMENT,
  rule: "Raise the current rent by 3 percent",
  amount: 1751,
  basis: `${AGREEMENT}: raise the current rent by 3 percent, applied to the current rent of $1,700.00 and rounded to $1,751.`,
  policyId: POLICY_ID,
  policyVersion: 1,
} as const;
const RULE = { id: POLICY_ID, kind: "percentage" as const, value: 3 };

describe("ARCH-S277-1 the one adoption writer", () => {
  it("ARCH-S277-1: preparation and the staff action store the same agreement, policy id and version as the basis", () => {
    expect(STAFF_ADOPTION.origin).toBe("adopted_source");
    expect(STAFF_ADOPTION.sourceLabel).toBe(
      "Standing agreement Example Standing Agreement, rule v1",
    );
    expect(PREPARED_ADOPTION.sourceLabel).toBe(STAFF_ADOPTION.sourceLabel);
    const expected = { agreementId: AGREEMENT_ID, policyId: POLICY_ID, policyVersion: 1 };
    expect(adoptedStandingRule(STAFF_ADOPTION)).toEqual(expected);
    expect(adoptedStandingRule(PREPARED_ADOPTION)).toEqual(expected);
  });

  it("R-S277-1: a covered lease with an empty base offers one adoption with the agreement's result in words", () => {
    const offer = standingAdoptionOffer({
      authority: COVERED,
      policy: RULE,
      currentRent: 1700,
      baseEmpty: true,
    });
    expect(offer).toMatchObject({
      amount: 1751,
      name: AGREEMENT,
      line: "Example Standing Agreement gives $1,751.00 (3 percent on $1,700.00).",
      label: "Use $1,751.00 from the agreement",
    });
    // The action's options are the one writer's, with the agreement's own basis.
    expect(offer!.save.sourceLabel).toBe(STAFF_ADOPTION.sourceLabel);
    expect(adoptedStandingRule(offer!.save)).toEqual({
      agreementId: AGREEMENT_ID,
      policyId: POLICY_ID,
      policyVersion: 1,
    });
  });

  it("R-S277-1 / S250 R-S250-4: a typed amount wins, and a lease without a covering agreement keeps the ordinary path", () => {
    expect(
      standingAdoptionOffer({
        authority: COVERED,
        policy: RULE,
        currentRent: 1700,
        baseEmpty: false,
      }),
    ).toBeNull();
    expect(
      standingAdoptionOffer({
        authority: { covered: false, kind: "standing", amount: 1751, label: AGREEMENT },
        policy: RULE,
        currentRent: 1700,
        baseEmpty: true,
      }),
    ).toBeNull();
    expect(
      standingAdoptionOffer({
        authority: { covered: true, kind: "exact" },
        policy: RULE,
        currentRent: 1700,
        baseEmpty: true,
      }),
    ).toBeNull();
    expect(
      standingAdoptionOffer({
        authority: null,
        policy: null,
        currentRent: null,
        baseEmpty: true,
      }),
    ).toBeNull();
  });
});

// ---- AC-S277-1: "Set renewal base rent" lands on the adoption action ----------------------------

function step(id: RenewalPathStepId): RenewalPathStepView {
  return { id, label: id, state: "current", detail: null, primary: null, controls: [] };
}

function facts(extra: Partial<GuidedPriorityFacts>): GuidedPriorityFacts {
  const shown = step("offer-tenant");
  const stage = {
    stage: { key: "preparing_tenant_offer", label: "Preparing the tenant offer" },
    stageLine: "",
    currentStepId: shown.id,
    nextStep: { label: "", stepId: shown.id, processStepId: null },
    waiting: null,
    evidenceLine: null,
    steps: [shown],
    check: null,
    evidenceCheck: null,
    derived: [],
    handStatusLine: null,
    blocker: null,
    evidence: {
      owner: { unconfirmedSequenceId: null, corrected: [] },
      tenant: { unconfirmedSequenceId: null, corrected: [] },
    },
    finishUp: [],
  } as unknown as RenewalStage;
  return { stage, shown, canEdit: true, ...extra };
}

describe("AC-S277-1 the landing of Set renewal base rent", () => {
  const working = { rent: null, effectiveDate: "2027-01-01", endDate: "2027-12-31" };

  it("AC-S277-1: on a covered lease with an empty base the fix names the adoption action in Ask the owner", () => {
    const priority = projectGuidedPriority(facts({ working, standingCovered: true }));
    expect(priority.lead).toMatchObject({
      key: "renewal-base-rent",
      label: "Set renewal base rent",
      target: STANDING_ADOPTION_CONTROL_ID,
      owner: "ask-owner",
    });
    expect(priority.lead?.target).not.toBe("renewal-pricing-basis");
  });

  it("AC-S277-1 (preservation, S269): on an ordinary lease the fix still goes to Rent to recommend", () => {
    expect(projectGuidedPriority(facts({ working })).lead).toMatchObject({
      key: "renewal-base-rent",
      target: "renewal-now-rent-to-recommend",
      owner: "compare-market",
    });
  });
});

// ---- ARCH-S277-2 / AC-S277-2: one phrase per stored origin --------------------------------------

describe("ARCH-S277-2 the one basis projection", () => {
  it("AC-S277-2: each stored origin reads as its one phrase", () => {
    expect(rentBasisPhrase(PREPARED_COMPARISON)).toBe(
      "suggested from the stored comparison",
    );
    expect(rentBasisPhrase(entry(1751, STAFF_ADOPTION))).toBe(
      "from Example Standing Agreement",
    );
    expect(rentBasisPhrase(entry(1751, PREPARED_ADOPTION))).toBe(
      "from Example Standing Agreement",
    );
    expect(rentBasisPhrase(entry(1760))).toBe(RENT_BASIS_WORDS.staff);
    expect(
      rentBasisPhrase(
        entry(1425, {
          basis: { kind: "owner_approval", ownerResponseEventId: "owner-answer-1" },
        }),
      ),
    ).toBe("approved by the owner on 11/12/2026");
    expect(
      rentBasisPhrase(
        entry(1500, { basis: { kind: "recommendation", recommendationRevision: 2 } }),
      ),
    ).toBe("adopted for the offer by staff");
    // A cleared value has no amount to describe.
    expect(rentBasisPhrase(entry(null))).toBeNull();
  });

  it("AC-S277-2: the projection names who saved it: the monthly preparation, or the staff member", () => {
    expect(rentBasisOf(PREPARED_COMPARISON)).toMatchObject({
      kind: "comparison",
      savedBy: "monthly preparation",
      savedByPreparation: true,
      savedOn: "11/12/2026",
      comparables: 5,
    });
    expect(rentBasisOf(entry(1751, PREPARED_ADOPTION))).toMatchObject({
      kind: "agreement",
      savedBy: "monthly preparation",
      agreementName: AGREEMENT,
    });
    expect(rentBasisOf(entry(1751, STAFF_ADOPTION))).toMatchObject({
      kind: "agreement",
      savedBy: "editor1@pmikcmetro.com",
      savedByPreparation: false,
    });
  });

  it("BEH-S277-2: a typed amount on a covered lease names the agreement amount too", () => {
    expect(workingBaseWords({ entry: entry(1760), agreementAmount: 1751 })).toEqual({
      amount: "$1,760.00",
      phrase: "entered by staff",
      agreement: "the agreement gives $1,751.00",
      basis: "entered by staff; the agreement gives $1,751.00",
      sentence: "$1,760.00 entered by staff; the agreement gives $1,751.00.",
    });
    // The adopted amount is the agreement's: no second figure.
    expect(
      workingBaseWords({ entry: entry(1751, STAFF_ADOPTION), agreementAmount: 1751 })
        ?.sentence,
    ).toBe("$1,751.00 from Example Standing Agreement.");
    expect(workingBaseWords({ entry: entry(1760) })?.sentence).toBe(
      "$1,760.00 entered by staff.",
    );
  });

  it("R-S277-6: the recommendation line names its basis and who saved it", () => {
    expect(recommendationBasisLine({ entry: PREPARED_COMPARISON })).toBe(
      "Rent to recommend $1,500.00: suggested from the stored comparison (median of 5), saved by monthly preparation on 11/12/2026",
    );
    expect(recommendationBasisLine({ entry: entry(1500) })).toBe(
      "Rent to recommend $1,500.00: entered by editor1@pmikcmetro.com on 11/12/2026",
    );
    expect(recommendationBasisLine({ entry: entry(1751, PREPARED_ADOPTION) })).toBe(
      "Rent to recommend $1,751.00: from Example Standing Agreement, saved by monthly preparation on 11/12/2026",
    );
    // A suggestion nobody saved says so.
    expect(
      recommendationBasisLine({
        entry: null,
        proposal: { value: 1500, origin: "comparison", basis: COMPARISON_BASIS },
      }),
    ).toBe(
      "Rent to recommend $1,500.00: suggested from the stored comparison (median of 5), not saved yet",
    );
    expect(
      recommendationBasisLine({
        entry: null,
        proposal: { value: 1751, origin: "agreement", basis: COVERED.basis },
        agreementName: AGREEMENT,
      }),
    ).toBe("Rent to recommend $1,751.00: from Example Standing Agreement, not saved yet");
    expect(recommendationBasisLine({ entry: null, proposal: null })).toBeNull();
  });

  it("R-S277-2 on the desk: the desk's Rent to recommend reads the same phrase from its rent view", () => {
    expect(
      rentViewBasisPhrase({
        origin: "typed",
        basis:
          "Saved working rent from Standing agreement Example Standing Agreement, rule v1. Later proposals keep this saved amount.",
      }),
    ).toBe("from Example Standing Agreement");
    expect(
      rentViewBasisPhrase({
        origin: "typed",
        basis:
          "Saved working rent from stored market comparison. Later proposals keep this saved amount.",
      }),
    ).toBe("suggested from the stored comparison");
    expect(
      rentViewBasisPhrase({
        origin: "typed",
        basis: "Entered by staff. A later proposal never replaces it.",
      }),
    ).toBe("entered by staff");
    expect(
      rentViewBasisPhrase({ origin: "agreement", basis: COVERED.basis }, AGREEMENT),
    ).toBe("from Example Standing Agreement");
    expect(rentViewBasisPhrase({ origin: "comparison", basis: COMPARISON_BASIS })).toBe(
      "suggested from the stored comparison",
    );
    expect(rentViewBasisPhrase({ origin: null, basis: "" })).toBeNull();
  });

  it("R-S277-5: every basis amount prints as currency with cents", () => {
    expect(formatRentAmount(1400)).toBe("$1,400.00");
    expect(formatRentAmount(1425.5)).toBe("$1,425.50");
    expect(formatRentAmount(950)).toBe("$950.00");
  });
});
