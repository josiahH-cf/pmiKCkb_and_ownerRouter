import { describe, expect, it } from "vitest";

import {
  ChargePolicyContentSchema,
  ChargePolicyRecordSchema,
  calculateRenewalCharges,
  economicsHash,
  type ChargePolicyContent,
  type ChargePolicyRecord,
} from "@/lib/lease-documents/charge-policy";
import type { PacketAnimalInput } from "@/lib/lease-documents/packet-inputs";
import { s66Fact } from "@/tests/fixtures/s66-packet";

const ANIMAL = (n: number) => `30000000-0000-4000-8000-00000000000${n}`;

function content(overrides: Partial<ChargePolicyContent> = {}): ChargePolicyContent {
  return {
    residentBenefitPackage: { monthlyCents: 4_500 },
    insuranceProgram: { monthlyCents: 1_250 },
    animals: {
      basis: "weight_lb",
      tiers: [
        {
          tierId: "small",
          label: "Under 25 lb",
          min: 0,
          maxExclusive: 25,
          monthlyCents: 2_500,
          oneTimeCents: 20_000,
          refundableDepositCents: 15_000,
        },
        {
          tierId: "large",
          label: "25 lb and over",
          min: 25,
          maxExclusive: null,
          monthlyCents: 4_000,
          oneTimeCents: 30_000,
          refundableDepositCents: 25_000,
        },
      ],
      treatments: { pet: "tiered", assistance_animal: "no_charge" },
      agreementFor: { pet: true, assistance_animal: true },
      juvenileWeightBasis: "expected_adult",
    },
    ...overrides,
  };
}

function policy(
  overrides: Partial<ChargePolicyContent> = {},
  version = 3,
): ChargePolicyRecord {
  return {
    schemaVersion: "renewal-charge-policy/v1",
    version,
    effectiveFrom: "2026-10-01",
    content: content(overrides),
    publishedAt: "2026-10-01T12:00:00.000Z",
    publishedByUid: "admin-1",
  };
}

function animal(
  n: number,
  overrides: Partial<PacketAnimalInput> = {},
): PacketAnimalInput {
  return {
    animalId: ANIMAL(n),
    name: `Animal ${n}`,
    species: "Dog",
    breed: "Mixed",
    weight: 30,
    weightUnit: "lb",
    weightBasis: "current",
    maturity: "adult",
    fidoScore: null,
    treatment: "pet",
    ...overrides,
  };
}

const ELECTED = [
  s66Fact("charges.resident_benefit_package.enrolled", true, "renewal_staff_entry"),
  s66Fact("insurance.coverage_method", "pmi_program", "renewal_staff_entry"),
];

describe("S66 versioned charge policy (AC-S66-7, BEH-S66-2)", () => {
  it("refuses overlapping, gapped, unordered or open-ended middle tiers", () => {
    const base = content();
    const withTiers = (tiers: NonNullable<ChargePolicyContent["animals"]>["tiers"]) => ({
      ...base,
      animals: { ...base.animals!, tiers },
    });
    const [small, large] = base.animals!.tiers;
    expect(
      ChargePolicyContentSchema.safeParse(withTiers([small, { ...large, min: 20 }])).error
        ?.issues[0].message,
    ).toMatch(/overlap/);
    expect(
      ChargePolicyContentSchema.safeParse(withTiers([small, { ...large, min: 30 }])).error
        ?.issues[0].message,
    ).toMatch(/gap between/);
    expect(
      ChargePolicyContentSchema.safeParse(withTiers([{ ...small, min: 5 }, large])).error
        ?.issues[0].message,
    ).toMatch(/must start at 0/);
    expect(
      ChargePolicyContentSchema.safeParse(
        withTiers([{ ...small, maxExclusive: null }, large]),
      ).error?.issues[0].message,
    ).toMatch(/only the last tier may be open-ended/);
    expect(
      ChargePolicyContentSchema.safeParse(
        withTiers([small, { ...large, maxExclusive: 80 }]),
      ).error?.issues[0].message,
    ).toMatch(/must be open-ended/);
    expect(ChargePolicyContentSchema.safeParse(base).success).toBe(true);
  });

  it("calculates per-animal and aggregate monthly, one-time and refundable amounts from the published tiers", () => {
    const result = calculateRenewalCharges({
      leaseId: "701",
      policy: policy(),
      facts: ELECTED,
      animals: [
        animal(1, { weight: 12 }),
        animal(2, { weight: 25 }),
        // 20 kg is 44.09 lb: the large tier.
        animal(3, { weight: 20, weightUnit: "kg" }),
      ],
      overrides: [],
    });
    expect(result.issues).toEqual([]);
    expect(
      result.animals.map((entry) => [entry.label, entry.tierLabel, entry.amounts]),
    ).toEqual([
      [
        "Animal 1",
        "Under 25 lb",
        { monthly: 2_500, one_time: 20_000, refundable_deposit: 15_000 },
      ],
      [
        "Animal 2",
        "25 lb and over",
        { monthly: 4_000, one_time: 30_000, refundable_deposit: 25_000 },
      ],
      [
        "Animal 3",
        "25 lb and over",
        { monthly: 4_000, one_time: 30_000, refundable_deposit: 25_000 },
      ],
    ]);
    // Monthly: package 45.00 + program 12.50 + pets 25 + 40 + 40.
    expect(result.totals).toEqual({
      monthly: 4_500 + 1_250 + 2_500 + 4_000 + 4_000,
      one_time: 80_000,
      refundable_deposit: 65_000,
    });
    expect(result.facts).toContainEqual(
      expect.objectContaining({
        fieldKey: "charges.monthly_total",
        normalizedValue: 162.5,
        displayValue: "$162.50",
      }),
    );
    expect(result.agreementApplicable).toEqual({
      [ANIMAL(1)]: true,
      [ANIMAL(2)]: true,
      [ANIMAL(3)]: true,
    });
  });

  it("never turns an unknown election, treatment, weight, maturity or score into zero", () => {
    const result = calculateRenewalCharges({
      leaseId: "701",
      policy: policy(),
      facts: [],
      animals: [
        animal(1, { treatment: null }),
        animal(2, { weight: null }),
        animal(3, { maturity: null }),
        animal(4, { maturity: "juvenile", weightBasis: "current" }),
      ],
      overrides: [],
    });
    expect(result.totals).toEqual({
      monthly: null,
      one_time: null,
      refundable_deposit: null,
    });
    expect(result.issues.map((issue) => issue.label)).toEqual([
      "Record whether the tenant is enrolled in the Resident Benefit Package.",
      "Animal 1: record whether this animal is a pet or an assistance animal.",
      "Animal 2: record the weight and its unit.",
      "Animal 3: record whether the animal is an adult or a juvenile.",
      "Animal 4: record the expected adult weight for a juvenile animal.",
    ]);
    expect(
      result.charges
        .filter((charge) => charge.kind === "animal")
        .every(
          (charge) => charge.applicable === null && charge.amountCents === undefined,
        ),
    ).toBe(true);
    expect(result.agreementApplicable[ANIMAL(1)]).toBeNull();
  });

  it("applies the published treatment rule and FIDO-score tiers exactly", () => {
    const fido = policy({
      animals: {
        basis: "fido_score",
        tiers: [
          {
            tierId: "low",
            label: "Score 1-2",
            min: 1,
            maxExclusive: 3,
            monthlyCents: 5_000,
            oneTimeCents: 0,
            refundableDepositCents: 30_000,
          },
          {
            tierId: "high",
            label: "Score 3-5",
            min: 3,
            maxExclusive: null,
            monthlyCents: 2_000,
            oneTimeCents: 0,
            refundableDepositCents: 10_000,
          },
        ],
        treatments: { pet: "tiered", assistance_animal: "no_charge" },
        agreementFor: { pet: true, assistance_animal: false },
        juvenileWeightBasis: null,
      },
    });
    const result = calculateRenewalCharges({
      leaseId: "701",
      policy: fido,
      facts: ELECTED,
      animals: [
        animal(1, { fidoScore: 2 }),
        animal(2, { fidoScore: 3 }),
        animal(3, { treatment: "assistance_animal" }),
        animal(4, { fidoScore: null }),
      ],
      overrides: [],
    });
    expect(result.animals.map((entry) => [entry.status, entry.tierLabel])).toEqual([
      ["calculated", "Score 1-2"],
      ["calculated", "Score 3-5"],
      ["no_charge", null],
      ["needs_input", null],
    ]);
    expect(result.animals[2].amounts).toEqual({
      monthly: 0,
      one_time: 0,
      refundable_deposit: 0,
    });
    expect(result.agreementApplicable[ANIMAL(3)]).toBe(false);
    expect(result.issues.map((issue) => issue.label)).toEqual([
      "Animal 4: record the FIDO score.",
    ]);
  });

  it("uses a per-lease override with its reason and provenance without editing the policy", () => {
    const result = calculateRenewalCharges({
      leaseId: "701",
      policy: policy(),
      facts: ELECTED,
      animals: [animal(1, { weight: 12 })],
      overrides: [
        {
          chargeId: `animal:${ANIMAL(1)}:monthly`,
          amountCents: 1_000,
          reason: "Owner-approved concession for an elderly pet",
          recordedAt: "2026-10-07T03:00:00.000Z",
          recordedByUid: "editor-1",
        },
      ],
    });
    const monthly = result.charges.find(
      (charge) => charge.chargeId === `animal:${ANIMAL(1)}:monthly`,
    )!;
    expect(monthly).toMatchObject({
      applicable: true,
      amountCents: 1_000,
      source: {
        system: "renewal_staff_override",
        reference: `packet-inputs:701:override:animal:${ANIMAL(1)}:monthly`,
      },
    });
    expect(result.animals[0]).toMatchObject({
      overridden: ["monthly"],
      amounts: { monthly: 1_000, one_time: 20_000, refundable_deposit: 15_000 },
    });
  });

  it("holds every charge without a published policy and changes the economics identity when amounts change", () => {
    const none = calculateRenewalCharges({
      leaseId: "701",
      policy: null,
      facts: ELECTED,
      animals: [animal(1)],
      overrides: [],
    });
    expect(none.charges).toEqual([]);
    expect(none.issues[0].label).toMatch(/has not published the renewal charge policy/);
    const before = calculateRenewalCharges({
      leaseId: "701",
      policy: policy(),
      facts: ELECTED,
      animals: [animal(1, { weight: 12 })],
      overrides: [],
    });
    const heavier = calculateRenewalCharges({
      leaseId: "701",
      policy: policy(),
      facts: ELECTED,
      animals: [animal(1, { weight: 30 })],
      overrides: [],
    });
    const nextVersion = calculateRenewalCharges({
      leaseId: "701",
      policy: policy({}, 4),
      facts: ELECTED,
      animals: [animal(1, { weight: 12 })],
      overrides: [],
    });
    expect(economicsHash(before)).not.toBe(economicsHash(heavier));
    expect(economicsHash(before)).not.toBe(economicsHash(nextVersion));
    expect(economicsHash(before)).toBe(
      economicsHash(
        calculateRenewalCharges({
          leaseId: "701",
          policy: policy(),
          facts: ELECTED,
          animals: [animal(1, { weight: 12, name: "Renamed" })],
          overrides: [],
        }),
      ),
    );
  });

  it("asks about a recorded package enrollment the policy cannot price instead of dropping it", () => {
    const calculated = calculateRenewalCharges({
      leaseId: "701",
      policy: policy({ residentBenefitPackage: null }),
      facts: ELECTED,
      animals: [],
      overrides: [],
    });
    expect(
      calculated.charges.find(
        (charge) => charge.chargeId === "resident_benefit_package:monthly",
      ),
    ).toMatchObject({ applicable: null });
    expect(calculated.totals.monthly).toBeNull();
    expect(calculated.issues.map((issue) => issue.label)).toContain(
      "The lease records Resident Benefit Package enrollment, but the published charge policy has no package amount.",
    );
    // Not enrolled, or a policy that offers no package, stays a plain not-applicable charge.
    const notEnrolled = calculateRenewalCharges({
      leaseId: "701",
      policy: policy({ residentBenefitPackage: null }),
      facts: [
        s66Fact(
          "charges.resident_benefit_package.enrolled",
          false,
          "renewal_staff_entry",
        ),
      ],
      animals: [],
      overrides: [],
    });
    expect(
      notEnrolled.charges.find(
        (charge) => charge.chargeId === "resident_benefit_package:monthly",
      ),
    ).toMatchObject({ applicable: false });
    expect(notEnrolled.issues).toEqual([]);
  });

  it("chooses a tier from the exact converted weight, never a rounded one", () => {
    // 11.339 kg is 24.998 lb: under the 25 lb edge even though it rounds to 25.00.
    const calculated = calculateRenewalCharges({
      leaseId: "701",
      policy: policy(),
      facts: ELECTED,
      animals: [animal(1, { weight: 11.339, weightUnit: "kg" })],
      overrides: [],
    });
    expect(calculated.animals[0]).toMatchObject({ tierLabel: "Under 25 lb" });
  });

  it("refuses an impossible effective date in the stored and published policy", () => {
    expect(
      ChargePolicyRecordSchema.safeParse({ ...policy(), effectiveFrom: "2026-99-99" })
        .success,
    ).toBe(false);
    expect(ChargePolicyRecordSchema.safeParse(policy()).success).toBe(true);
  });
});
