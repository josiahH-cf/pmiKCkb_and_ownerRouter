// S249 ARCH-S249-1, R-S249-1, R-S249-5, R-S249-11, R-S249-13: the one preparation projection per
// lease and cycle. Synthetic values only.
import { describe, expect, it } from "vitest";

import {
  KICKOFF_WORDS,
  kickoffOrderGroup,
  kickoffRowLine,
  projectRenewalPreparation,
  renewalNumbersCheck,
  renewalRentToRecommend,
  type RenewalKickoffFacts,
  type RenewalNumbersFacts,
} from "@/lib/lease-renewal/renewal-preparation";
import { orderThisBatch, thisBatchParts } from "@/lib/lease-renewal/renewal-batch";
import { kickoffFactsFor } from "@/lib/lease-renewal/kickoff-facts";
import {
  projectRenewalStage,
  type RenewalStageContext,
} from "@/lib/lease-renewal/renewal-stage";

const NUMBERS: RenewalNumbersFacts = {
  contractualRent: 1350,
  rentCharges: [1350],
  leaseEndIso: "2026-12-31",
  workingRent: null,
  sheetRent: null,
  sheetEndIso: null,
  sourceReadable: true,
};

const STORED = {
  state: "stored" as const,
  comparison: {
    observationId: "observation-1",
    observedAtIso: "2026-11-04T15:00:00.000Z",
    source: "RentCast",
    rangeLow: 1300,
    rangeHigh: 1500,
    compCount: 4,
    comps: [
      { rent: 1380, distanceMiles: 0.4 },
      { rent: 1420, distanceMiles: 0.6 },
      { rent: 0, distanceMiles: 0.7 },
      { rent: 1460, distanceMiles: 0.9 },
      { rent: 1500, distanceMiles: 1.2 },
    ],
  },
};

const FACTS: RenewalKickoffFacts = {
  numbers: NUMBERS,
  comparison: STORED,
  typedRent: null,
  agreementRent: null,
  currentRent: 1350,
  ownerRecipient: { state: "ready" },
  signature: true,
  templateApproved: true,
  address: "101 Sample Pl",
};

describe("S249 R-S249-1 numbers check (D-OP-7: RentVine is the basis)", () => {
  it("states Numbers agree when RentVine's rent, its one rent charge and the lease end agree", () => {
    const check = renewalNumbersCheck(NUMBERS);
    expect(check.state).toBe("agree");
    expect(check.line).toBe(KICKOFF_WORDS.numbersAgree);
    expect(check.sheetNotes).toEqual([]);
  });

  it("treats a blank Sheet row as no difference", () => {
    const check = renewalNumbersCheck({ ...NUMBERS, sheetRent: null, sheetEndIso: null });
    expect(check.line).toBe("Numbers agree");
    expect(check.sheetNotes).toHaveLength(0);
  });

  it("shows a differing Sheet value as information and still states Numbers agree", () => {
    const check = renewalNumbersCheck({ ...NUMBERS, sheetRent: 1300 });
    expect(check.state).toBe("agree");
    expect(check.sheetNotes).toEqual([
      "The operating Sheet shows $1,300 for the current rent. This is information; RentVine is the basis.",
    ]);
  });

  it("names the one difference to settle with its existing fix control", () => {
    const check = renewalNumbersCheck({ ...NUMBERS, workingRent: 1400 });
    expect(check.state).toBe("difference");
    if (check.state !== "difference") throw new Error("expected a difference");
    expect(check.line).toBe(
      "Your working current rent is $1,400 and RentVine reports $1,350",
    );
    expect(check.fix.target).toBe("renewal-rent-and-charges");
    // S249 review fix E (ARCH-S249-1): the rent charges are not part of the shared check on any
    // surface (the desk reads none); the lease page states them as a separate fact.
    expect(renewalNumbersCheck({ ...NUMBERS, rentCharges: [1400] }).state).toBe("agree");
  });

  it("names a working rent that differs from RentVine, and nothing else", () => {
    const check = renewalNumbersCheck({ ...NUMBERS, workingRent: 1325, sheetRent: 1300 });
    expect(check.state).toBe("difference");
    expect(check.line).toBe(
      "Your working current rent is $1,325 and RentVine reports $1,350",
    );
  });

  it("does not claim agreement from an unreadable source", () => {
    expect(renewalNumbersCheck({ ...NUMBERS, sourceReadable: false }).state).toBe(
      "unavailable",
    );
  });
});

describe("S249 comparison age follows the business time convention", () => {
  for (const [observedAtIso, expected] of [
    ["2026-11-07T00:30:00.000Z", "Compared 11/06/2026, 6:30 PM CST"],
    ["2026-07-07T00:30:00.000Z", "Compared 07/06/2026, 7:30 PM CDT"],
    ["unreadable", "Comparison time unavailable"],
  ]) {
    it(`shows ${expected} for ${observedAtIso} without a lookup`, () => {
      const facts: RenewalKickoffFacts = {
        ...FACTS,
        comparison: {
          ...STORED,
          comparison: { ...STORED.comparison, observedAtIso: observedAtIso! },
        },
      };
      expect(projectRenewalPreparation(facts).comparison.ageLine).toBe(expected);
    });
  }
});

describe("S249 R-S249-5 Rent to recommend: typed, agreement, comparison", () => {
  it("prefills from the comparison-based suggestion with its basis in words", () => {
    const rent = renewalRentToRecommend(FACTS);
    expect(rent.origin).toBe("comparison");
    expect(rent.value).toBe(1440);
    expect(rent.basis).toMatch(/^Suggested from the stored comparison: Median of 4/);
  });

  it("prefers the covering standing agreement over the comparison (S250 slot)", () => {
    const rent = renewalRentToRecommend({
      ...FACTS,
      agreementRent: { value: 1391, basis: "Example agreement: current rent plus 3%" },
    });
    expect(rent).toMatchObject({
      origin: "agreement",
      value: 1391,
      basis: "Example agreement: current rent plus 3%",
    });
  });

  it("AC-S249-5: a typed figure always wins over every proposal", () => {
    const rent = renewalRentToRecommend({
      ...FACTS,
      typedRent: 1375,
      agreementRent: { value: 1391, basis: "Example agreement" },
    });
    expect(rent).toMatchObject({ origin: "typed", value: 1375 });
  });

  it("asks for a rent when nothing is stored and nothing is typed", () => {
    const rent = renewalRentToRecommend({ ...FACTS, comparison: { state: "none" } });
    expect(rent.value).toBeNull();
    expect(rent.basis).toMatch(/Enter the rent to recommend/);
  });

  it("names an adopted working rent's recorded source while preserving its amount", () => {
    expect(
      renewalRentToRecommend({
        ...FACTS,
        typedRent: 1751,
        workingRentBasis:
          "Saved working rent from Pricing policy v1. Later proposals keep this saved amount.",
      }),
    ).toMatchObject({
      value: 1751,
      origin: "typed",
      basis:
        "Saved working rent from Pricing policy v1. Later proposals keep this saved amount.",
    });
  });
});

describe("S249 ARCH-S249-1 / R-S249-11 one projection: ready or the named missing input", () => {
  it("a prepared lease is sendable with every item ready", () => {
    const preparation = projectRenewalPreparation(FACTS);
    expect(preparation.sendable).toBe(true);
    expect(preparation.missing).toEqual([]);
    expect(preparation.comparison.firstComps.map((comp) => comp.rent)).toEqual([
      1380, 1420, 1460, 1500,
    ]);
    expect(preparation.comparison.ageLine).toBe("Compared 11/04/2026, 9:00 AM CST");
    expect(kickoffRowLine(preparation)).toBe(
      "Ready for your review: owner message prepared",
    );
  });

  it("names a missing verified owner recipient with its fix", () => {
    const preparation = projectRenewalPreparation({
      ...FACTS,
      ownerRecipient: { state: "missing", reasons: ["No owner email is on file."] },
    });
    expect(preparation.sendable).toBe(false);
    expect(preparation.missing).toEqual(["a verified owner recipient"]);
    const item = preparation.items.find((entry) => entry.key === "recipient")!;
    expect(item.fix?.label).toMatch(/owner record in RentVine/);
    expect(item.fix?.target).toBe("renewal-message-owner-recipients");
    expect(kickoffRowLine(preparation)).toBe("Missing: a verified owner recipient");
  });

  it("names a missing signature and a template that is not approved, each with its fix", () => {
    const preparation = projectRenewalPreparation({
      ...FACTS,
      signature: false,
      templateApproved: false,
    });
    expect(preparation.missing).toEqual(["your signature", "an approved owner template"]);
    expect(preparation.items.find((item) => item.key === "signature")?.fix).toEqual({
      label: "Set up your signature",
      target: "renewal-now-signature",
    });
    expect(preparation.items.find((item) => item.key === "template")?.fix?.target).toBe(
      "renewal-message-owner-publication",
    );
  });

  it("at the allowance, the comparison reads the stated words and offers own figures", () => {
    const preparation = projectRenewalPreparation({
      ...FACTS,
      comparison: { state: "allowance_reached" },
    });
    expect(preparation.comparison.line).toBe(
      "Comparison not run: monthly allowance reached",
    );
    expect(preparation.comparison.fix).toEqual({
      label: "Enter your own comparison figures",
      target: "renewal-market-comparison-low",
    });
    expect(kickoffRowLine(preparation)).toBe(
      "Comparison not run: monthly allowance reached",
    );
  });

  it("an unread fact is unknown, never claimed missing or ready", () => {
    const preparation = projectRenewalPreparation({
      ...FACTS,
      signature: null,
      ownerRecipient: null,
    });
    const signature = preparation.items.find((item) => item.key === "signature")!;
    expect(signature).toMatchObject({ ready: false, missing: null, unknown: true });
    expect(preparation.sendable).toBe(false);
    expect(preparation.missing).toEqual([]);
  });
});

describe("S249 R-S249-13 batch ordering group", () => {
  const ready = projectRenewalPreparation(FACTS);
  const missing = projectRenewalPreparation({
    ...FACTS,
    ownerRecipient: { state: "missing", reasons: [] },
  });
  it("ready first, then missing an input, then waiting or finished", () => {
    expect(
      kickoffOrderGroup({
        preparation: ready,
        currentStepId: "ask-owner",
        ownerStepStarted: false,
      }),
    ).toBe("ready");
    expect(
      kickoffOrderGroup({
        preparation: missing,
        currentStepId: "ask-owner",
        ownerStepStarted: false,
      }),
    ).toBe("missing");
    expect(
      kickoffOrderGroup({
        preparation: ready,
        currentStepId: "ask-owner",
        ownerStepStarted: true,
      }),
    ).toBe("other");
    expect(
      kickoffOrderGroup({
        preparation: ready,
        currentStepId: "offer-tenant",
        ownerStepStarted: false,
      }),
    ).toBe("other");
  });
});

describe("S249 the stage reads the preparation (R-S249-1, R-S249-2)", () => {
  const context: RenewalStageContext = {
    leaseId: "9101",
    staffRecordUnavailable: false,
    standingAgreement: null,
    housingAssistance: null,
    numbers: { verified: false, openDifferences: 0 },
    term: { monthToMonth: false, reviewNeeded: false },
    moveOutInitiated: false,
    sourceRenewal: null,
    verification: null,
    handStatus: null,
    lastContactAtIso: null,
    threadCheck: null,
    outreach: null,
  };
  it("without the projection the lease starts at Check the numbers", () => {
    expect(projectRenewalStage(null, context).currentStepId).toBe("check-numbers");
  });

  it("numbers agreed and a stored comparison bring a prepared lease to Ask the owner", () => {
    const preparation = projectRenewalPreparation(FACTS);
    const stage = projectRenewalStage(null, {
      ...context,
      numbers: { verified: true, openDifferences: 0, line: preparation.numbers.line },
      preparation,
    });
    expect(stage.currentStepId).toBe("ask-owner");
    const steps = Object.fromEntries(stage.steps.map((step) => [step.id, step]));
    expect(steps["check-numbers"]).toMatchObject({
      state: "done",
      detail: "Numbers agree",
    });
    expect(steps["compare-market"]?.state).toBe("done");
  });

  it("names the one difference on Check the numbers", () => {
    const preparation = projectRenewalPreparation({
      ...FACTS,
      numbers: { ...NUMBERS, workingRent: 1400 },
    });
    const stage = projectRenewalStage(null, {
      ...context,
      numbers: { verified: false, openDifferences: 1, line: preparation.numbers.line },
      preparation,
    });
    expect(stage.currentStepId).toBe("check-numbers");
    expect(stage.steps.find((step) => step.id === "check-numbers")?.detail).toBe(
      "Your working current rent is $1,400 and RentVine reports $1,350",
    );
  });
});

describe("S249 R-S249-13 This batch ordering", () => {
  const item = (
    key: string,
    date: string,
    kickoffGroup?: "ready" | "missing" | "other",
  ) => ({
    key,
    placement: { kind: "dated" as const, dateIso: date },
    sortDateIso: date,
    sortLabel: key,
    ...(kickoffGroup ? { kickoffGroup } : {}),
  });
  it("lists ready first, then missing an input, then waiting and finished, each by date", () => {
    const rows = [
      item("waiting", "2026-12-01", "other"),
      item("missing", "2026-12-05", "missing"),
      item("ready", "2026-12-31", "ready"),
      item("plain", "2026-12-02"),
    ];
    expect(orderThisBatch(rows).map((row) => row.key)).toEqual([
      "ready",
      "missing",
      "waiting",
      "plain",
    ]);
    const parts = thisBatchParts(rows);
    expect(parts.ready.map((row) => row.key)).toEqual(["ready"]);
    expect(parts.missing.map((row) => row.key)).toEqual(["missing"]);
    expect(parts.other.map((row) => row.key)).toEqual(["waiting", "plain"]);
  });
});

describe("S249 ARCH-S249-3: a cycle whose one lookup already ran is not offered again", () => {
  const base = {
    leaseId: "9102",
    cycleDateIso: "2026-12-31",
    contractualRent: 1350,
    leaseEndIso: "2026-12-31",
    workingCurrentRent: null,
    address: "102 Sample Street",
    dataCheck: [],
    manual: null,
    working: null,
    sourceReadable: true,
    ownerRecipient: { state: "ready" as const },
  };
  const support = (state: "claimed" | "failed" | null) => ({
    observationsByLease: new Map(),
    signature: true,
    templateApproved: true,
    allowanceReached: false,
    preparationsByLease: state
      ? new Map([["9102", { cycleKey: "2026-12-31", state, reason: null }]])
      : new Map(),
  });

  it("with no claim the lease needs its comparison", () => {
    const facts = kickoffFactsFor({ ...base, support: support(null) });
    expect(facts.comparison).toEqual({ state: "none" });
  });

  it.each(["claimed", "failed"] as const)(
    "a %s claim for this cycle reads as already run, and the batch does not offer it again",
    (state) => {
      const facts = kickoffFactsFor({ ...base, support: support(state) });
      expect(facts.comparison).toEqual({ state: "none", attempted: true });
      const view = projectRenewalPreparation(facts).comparison;
      expect(view.attempted).toBe(true);
      expect(view.line).toBe(
        "This cycle's comparison already ran once and stored no result",
      );
    },
  );

  it("a claim for an earlier cycle does not count for this one", () => {
    const facts = kickoffFactsFor({
      ...base,
      support: {
        ...support(null),
        preparationsByLease: new Map([
          ["9102", { cycleKey: "2025-12-31", state: "failed" as const, reason: null }],
        ]),
      },
    });
    expect(facts.comparison).toEqual({ state: "none" });
  });
});
