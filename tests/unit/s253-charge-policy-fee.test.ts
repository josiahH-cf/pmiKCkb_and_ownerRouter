import { describe, expect, it } from "vitest";

import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  CHARGE_OVERRIDE_SOURCE_SYSTEM,
  CHARGE_POLICY_SOURCE_SYSTEM,
  ChargePolicyContentSchema,
  PET_AGREEMENT_DEPOSIT_FACT,
  PET_AGREEMENT_TOTAL_FACT,
  PET_FEE_CHARGE_ID,
  PET_PROCESSING_FEE_FACT,
  PublishChargePolicyInputSchema,
  calculateRenewalCharges,
  economicsHash,
  type ChargePolicyContent,
  type ChargePolicyRecord,
} from "@/lib/lease-documents/charge-policy";
import type { PacketAnimalInput } from "@/lib/lease-documents/packet-inputs";
import { s66Fact } from "@/tests/fixtures/s66-packet";

// S253 ARCH-S253-1, BEH-S253-1, BEH-S253-2, AC-S253-1: the pet processing fee is its own published
// amount, the deposit is a staff record on the pet, and the form total is a calculator output.
// Synthetic amounts and names only.

const ANIMAL = (n: number) => `30000000-0000-4000-8000-00000000000${n}`;
const FEE_SOURCE = "Synthetic test source for the processing fee";

function feeOnly(
  fee: Partial<NonNullable<ChargePolicyContent["petProcessingFee"]>> = {},
): ChargePolicyContent {
  return {
    residentBenefitPackage: null,
    insuranceProgram: null,
    animals: null,
    petProcessingFee: { amountCents: 5_000, unit: null, source: FEE_SOURCE, ...fee },
  };
}

function policy(content: ChargePolicyContent, version = 2): ChargePolicyRecord {
  return {
    schemaVersion: "renewal-charge-policy/v1",
    version,
    effectiveFrom: "2026-11-01",
    content,
    publishedAt: "2026-11-05T15:00:00.000Z",
    publishedByUid: "admin-synthetic",
  };
}

function animal(
  n: number,
  overrides: Partial<PacketAnimalInput> = {},
): PacketAnimalInput {
  return {
    animalId: ANIMAL(n),
    name: `Example Pet ${n}`,
    species: "Dog",
    breed: "Mixed",
    weight: 30,
    weightUnit: "lb",
    weightBasis: "current",
    maturity: "adult",
    fidoScore: 4,
    treatment: "pet",
    ...overrides,
  };
}

const deposit = (amountCents: number) => ({
  amountCents,
  source: "Synthetic screening result",
  recordedAt: "2026-11-05T16:00:00.000Z",
  recordedByUid: "editor-synthetic",
});

const NOT_ENROLLED = [
  s66Fact("charges.resident_benefit_package.enrolled", false, "renewal_staff_entry"),
  s66Fact(
    "insurance.coverage_method",
    "verified_external_coverage",
    "renewal_staff_entry",
  ),
];

function calculate(
  content: ChargePolicyContent | null,
  animals: PacketAnimalInput[],
  leaseId = "701",
) {
  return calculateRenewalCharges({
    leaseId,
    policy: content ? policy(content) : null,
    facts: NOT_ENROLLED,
    animals,
    overrides: [],
  });
}

describe("S253 the processing fee is its own published amount (R-S253-2)", () => {
  it("publishes a policy that carries the fee alone: no tiers, no deposit schedule, no assistance-animal treatment", () => {
    expect(ChargePolicyContentSchema.safeParse(feeOnly()).success).toBe(true);
    expect(
      PublishChargePolicyInputSchema.safeParse({
        content: feeOnly(),
        effectiveFrom: "2026-11-01",
        expectedVersion: 0,
        operationId: "00000000-0000-4000-8000-000000000253",
      }).success,
    ).toBe(true);
  });

  it("needs a source note and a positive amount, and gives the unit no default", () => {
    const parsed = (fee: unknown) =>
      ChargePolicyContentSchema.safeParse({ ...feeOnly(), petProcessingFee: fee });
    expect(parsed({ amountCents: 5_000, unit: null }).success).toBe(false);
    expect(parsed({ amountCents: 5_000, unit: null, source: "  " }).success).toBe(false);
    expect(parsed({ amountCents: 0, unit: null, source: FEE_SOURCE }).success).toBe(
      false,
    );
    // The unit is always stated; leaving it out never means a pet or an agreement.
    expect(parsed({ amountCents: 5_000, source: FEE_SOURCE }).success).toBe(false);
    expect(parsed(null).success).toBe(true);
  });

  it("refuses to publish what one fee covers while that question is still open", () => {
    const result = PublishChargePolicyInputSchema.safeParse({
      content: feeOnly({ unit: "pet" }),
      effectiveFrom: "2026-11-01",
      expectedVersion: 0,
      operationId: "00000000-0000-4000-8000-000000000254",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/what one processing fee covers/i);
  });

  it("keeps an existing policy without the fee readable and its economics identity unchanged", () => {
    const tiered: ChargePolicyContent = {
      residentBenefitPackage: { monthlyCents: 4_500 },
      insuranceProgram: null,
      animals: {
        basis: "fido_score",
        tiers: [
          {
            tierId: "all",
            label: "Every score",
            min: 1,
            maxExclusive: null,
            monthlyCents: 2_500,
            oneTimeCents: 0,
            refundableDepositCents: 22_500,
          },
        ],
        treatments: { pet: "tiered", assistance_animal: "no_charge" },
        agreementFor: { pet: true, assistance_animal: false },
        juvenileWeightBasis: null,
      },
    };
    expect(ChargePolicyContentSchema.safeParse(tiered).success).toBe(true);
    const calculated = calculate(tiered, [animal(1)]);
    // The identity an owner approval is bound to is the same computation as before this suite.
    expect(economicsHash(calculated)).toBe(
      hashExecutionPreview({
        policyVersion: calculated.policyVersion,
        charges: [...calculated.charges]
          .map((entry) => ({
            chargeId: entry.chargeId,
            applicable: entry.applicable,
            amountCents: entry.amountCents ?? null,
            cadence: entry.cadence ?? null,
          }))
          .sort((left, right) => left.chargeId.localeCompare(right.chargeId)),
      }),
    );
    // Tier pricing still prices the animal, and without a published fee there is no form total.
    expect(calculated.animals[0].amounts).toEqual({
      monthly: 2_500,
      one_time: 0,
      refundable_deposit: 22_500,
    });
    expect(calculated.petAgreement).toMatchObject({ feeCents: null, totalCents: null });
    expect(calculated.petAgreement.needs.join(" ")).toMatch(/pet processing fee/i);
  });
});

describe("S253 total equals fee plus deposit, exact to the cent (R-S253-3, R-S253-4)", () => {
  it("shows the fee, the recorded deposit and their exact sum for one ordinary pet", () => {
    const calculated = calculate(feeOnly(), [animal(1, { deposit: deposit(12_345) })]);
    expect(calculated.petAgreement).toMatchObject({
      feeCents: 5_000,
      feeUnit: null,
      feeSource: FEE_SOURCE,
      ordinaryPets: 1,
      depositCents: 12_345,
      totalCents: 17_345,
      needs: [],
    });
    const fact = (key: string) =>
      calculated.facts.find((entry) => entry.fieldKey === key);
    expect(fact(PET_PROCESSING_FEE_FACT)).toMatchObject({
      normalizedValue: 50,
      displayValue: "$50.00",
      source: { system: "renewal_charge_policy" },
    });
    expect(fact(PET_AGREEMENT_DEPOSIT_FACT)).toMatchObject({
      normalizedValue: 123.45,
      displayValue: "$123.45",
    });
    expect(fact(PET_AGREEMENT_TOTAL_FACT)).toMatchObject({
      normalizedValue: 173.45,
      displayValue: "$173.45",
      source: { system: "renewal_charge_policy" },
    });
    expect(calculated.agreementApplicable[ANIMAL(1)]).toBe(true);
    expect(calculated.animals[0]).toMatchObject({
      status: "calculated",
      amounts: { monthly: null, one_time: null, refundable_deposit: 12_345 },
    });
    // The deposit keeps where it came from; the policy supplies none of it.
    expect(
      calculated.charges.find(
        (charge) => charge.chargeId === `animal:${ANIMAL(1)}:refundable_deposit`,
      ),
    ).toMatchObject({
      applicable: true,
      amountCents: 12_345,
      source: { system: "renewal_staff_deposit" },
    });
  });

  it("never rounds: every cent of a matrix of deposits survives the sum", () => {
    for (const cents of [1, 99, 100, 33_333, 250_001, 999_999]) {
      const calculated = calculate(feeOnly({ amountCents: 4_999 }), [
        animal(1, { deposit: deposit(cents) }),
      ]);
      expect(calculated.petAgreement.totalCents).toBe(cents + 4_999);
    }
  });

  it("changes the economics identity when the deposit or the fee changes", () => {
    const base = calculate(feeOnly(), [animal(1, { deposit: deposit(30_000) })]);
    const otherDeposit = calculate(feeOnly(), [animal(1, { deposit: deposit(30_001) })]);
    const otherFee = calculate(feeOnly({ amountCents: 5_001 }), [
      animal(1, { deposit: deposit(30_000) }),
    ]);
    expect(economicsHash(base)).not.toBe(economicsHash(otherDeposit));
    expect(economicsHash(base)).not.toBe(economicsHash(otherFee));
  });

  it("states the published fee on the charge, the facts and the total when a stored override names the fee", () => {
    // R-S253-5: the fee is the published amount wherever it is stated. A per-lease override that
    // names it changes nothing, so the approved economics and the prepared agreement agree.
    const pet = animal(1, { deposit: deposit(10_000) });
    const stored = (chargeId: string, amountCents: number) => ({
      chargeId,
      amountCents,
      reason: "Synthetic override reason",
      recordedAt: "2026-11-05T16:30:00.000Z",
      recordedByUid: "editor-synthetic",
    });
    const withOverride = (overrides: ReturnType<typeof stored>[]) =>
      calculateRenewalCharges({
        leaseId: "701",
        policy: policy(feeOnly()),
        facts: NOT_ENROLLED,
        animals: [pet],
        overrides,
      });
    const calculated = withOverride([stored(PET_FEE_CHARGE_ID, 2_500)]);
    expect(
      calculated.charges.find((charge) => charge.chargeId === PET_FEE_CHARGE_ID),
    ).toMatchObject({
      applicable: true,
      amountCents: 5_000,
      source: { system: CHARGE_POLICY_SOURCE_SYSTEM },
    });
    expect(calculated.totals.one_time).toBe(5_000);
    expect(calculated.petAgreement).toMatchObject({
      feeCents: 5_000,
      depositCents: 10_000,
      totalCents: 15_000,
    });
    const fact = (key: string) =>
      calculated.facts.find((entry) => entry.fieldKey === key)?.normalizedValue;
    expect(fact(PET_PROCESSING_FEE_FACT)).toBe(50);
    expect(fact(PET_AGREEMENT_TOTAL_FACT)).toBe(150);
    expect(fact("charges.one_time_total")).toBe(50);
    expect(economicsHash(calculated)).toBe(economicsHash(withOverride([])));

    // The deposit keeps its override with a reason: the charge, the blank and the total follow it.
    const depositOverride = withOverride([
      stored(PET_FEE_CHARGE_ID, 2_500),
      stored(`animal:${ANIMAL(1)}:refundable_deposit`, 20_000),
    ]);
    expect(depositOverride.petAgreement).toMatchObject({
      feeCents: 5_000,
      depositCents: 20_000,
      totalCents: 25_000,
    });
    expect(
      depositOverride.charges.find(
        (charge) => charge.chargeId === `animal:${ANIMAL(1)}:refundable_deposit`,
      ),
    ).toMatchObject({
      amountCents: 20_000,
      source: { system: CHARGE_OVERRIDE_SOURCE_SYSTEM },
    });
  });
});

describe("S253 a missing part shows the named need and no total (BEH-S253-2)", () => {
  it("with no deposit recorded: no deposit, no total, nothing reads as zero", () => {
    const calculated = calculate(feeOnly(), [animal(1)]);
    expect(calculated.petAgreement).toMatchObject({
      feeCents: 5_000,
      depositCents: null,
      totalCents: null,
    });
    expect(calculated.petAgreement.needs).toEqual([
      "Example Pet 1: record the refundable deposit and where it comes from.",
    ]);
    const keys = calculated.facts.map((entry) => entry.fieldKey);
    expect(keys).toContain(PET_PROCESSING_FEE_FACT);
    expect(keys).not.toContain(PET_AGREEMENT_DEPOSIT_FACT);
    expect(keys).not.toContain(PET_AGREEMENT_TOTAL_FACT);
    expect(calculated.animals[0].amounts.refundable_deposit).toBeNull();
    expect(JSON.stringify(calculated.petAgreement)).not.toMatch(/:0[,}]/);
    // A missing deposit holds the pet agreement only: it adds no charge the packet must settle.
    expect(calculated.charges.some((charge) => charge.applicable === null)).toBe(false);
  });

  it("with no published fee: the recorded deposit stays, and no total is made", () => {
    const calculated = calculate(
      { residentBenefitPackage: null, insuranceProgram: null, animals: null },
      [animal(1, { deposit: deposit(30_000) })],
    );
    expect(calculated.petAgreement).toMatchObject({ feeCents: null, totalCents: null });
    expect(calculated.facts.map((entry) => entry.fieldKey)).not.toContain(
      PET_AGREEMENT_TOTAL_FACT,
    );
  });

  it("with more than one ordinary pet and the unit unset: both blanks wait", () => {
    const calculated = calculate(feeOnly(), [
      animal(1, { deposit: deposit(30_000) }),
      animal(2, { deposit: deposit(20_000) }),
    ]);
    expect(calculated.petAgreement).toMatchObject({
      ordinaryPets: 2,
      depositCents: null,
      totalCents: null,
    });
    expect(calculated.petAgreement.needs.join(" ")).toMatch(
      /what one processing fee covers/i,
    );
    const keys = calculated.facts.map((entry) => entry.fieldKey);
    expect(keys).not.toContain(PET_AGREEMENT_DEPOSIT_FACT);
    expect(keys).not.toContain(PET_AGREEMENT_TOTAL_FACT);
    expect(calculated.totals.one_time).toBeNull();
  });

  it("an assistance animal with no published rule shows only that the rule is needed", () => {
    const calculated = calculate(feeOnly(), [
      animal(1, { treatment: "assistance_animal", name: "Example Helper" }),
    ]);
    expect(calculated.animals[0]).toMatchObject({
      status: "needs_rule",
      amounts: { monthly: null, one_time: null, refundable_deposit: null },
    });
    expect(calculated.animals[0].reason).toMatch(/approved rule for assistance animals/i);
    expect(calculated.agreementApplicable[ANIMAL(1)]).toBeNull();
    expect(calculated.heldAnimalIds).toEqual([ANIMAL(1)]);
    // Never charged, never free, never zero: no charge exists for it at all.
    expect(calculated.charges.filter((charge) => charge.animalId === ANIMAL(1))).toEqual(
      [],
    );
    expect(calculated.petAgreement).toMatchObject({
      ordinaryPets: 0,
      depositCents: null,
      totalCents: null,
    });
    expect(JSON.stringify(calculated.animals[0])).not.toMatch(
      /"(monthly|one_time|refundable_deposit)":0/,
    );
  });

  it("an ordinary pet on the same lease still totals while the assistance animal waits", () => {
    const calculated = calculate(feeOnly(), [
      animal(1, { deposit: deposit(30_000) }),
      animal(2, { treatment: "assistance_animal" }),
    ]);
    expect(calculated.petAgreement).toMatchObject({
      ordinaryPets: 1,
      depositCents: 30_000,
      totalCents: 35_000,
    });
    expect(calculated.heldAnimalIds).toEqual([ANIMAL(2)]);
    expect(calculated.agreementApplicable).toEqual({
      [ANIMAL(1)]: true,
      [ANIMAL(2)]: null,
    });
  });

  it("no printed or tiered amount is ever used for the fee or the deposit", () => {
    // A score and a weight are recorded; with the fee alone nothing prices the pet from them.
    const calculated = calculate(feeOnly(), [animal(1, { fidoScore: 1, weight: 120 })]);
    expect(calculated.petAgreement.depositCents).toBeNull();
    expect(calculated.animals[0].tierLabel).toBeNull();
  });
});
