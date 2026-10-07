// S66 (AC-S66-7): the Admin-published, versioned renewal charge policy and its calculator.
//
// Admins publish amounts and rules; nothing here adopts a printed fee schedule from a form, guesses
// an election, or turns an unknown input into zero. The calculator applies only the approved rules
// to the lease's recorded inputs and returns per-animal amounts, aggregate totals split into
// monthly, one-time and refundable amounts, and the exact inputs still needed. A per-lease override
// replaces one calculated amount with its reason and provenance; it never edits the shared policy.
// Calculating writes nothing: no RentVine charge, Sheet value or Dotloop document changes.

import { z } from "zod";

import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type {
  PacketAnimalInput,
  StoredChargeOverride,
} from "@/lib/lease-documents/packet-inputs";
import type {
  PacketCharge,
  PacketFact,
  PacketSourceReference,
} from "@/lib/lease-documents/packet-types";

export const CHARGE_POLICY_SCHEMA_VERSION = "renewal-charge-policy/v1";
export const CHARGE_POLICY_SOURCE_SYSTEM = "renewal_charge_policy";
export const CHARGE_OVERRIDE_SOURCE_SYSTEM = "renewal_staff_override";
export const RBP_ELECTION_KEY = "charges.resident_benefit_package.enrolled";
export const INSURANCE_METHOD_KEY = "insurance.coverage_method";

const cents = z.number().int().nonnegative().max(10_000_000);

const TierSchema = z
  .object({
    tierId: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    label: z.string().trim().min(1).max(80),
    /** Inclusive lower bound of the basis value. */
    min: z.number().finite().nonnegative(),
    /** Exclusive upper bound; null only on the last tier. */
    maxExclusive: z.number().finite().positive().nullable(),
    monthlyCents: cents,
    oneTimeCents: cents,
    refundableDepositCents: cents,
  })
  .strict();
export type ChargePolicyTier = z.infer<typeof TierSchema>;

export const ChargePolicyContentSchema = z
  .object({
    /** Null when the company does not offer the package. */
    residentBenefitPackage: z.object({ monthlyCents: cents }).strict().nullable(),
    /** Null when the company insurance program amount is not configured. */
    insuranceProgram: z.object({ monthlyCents: cents }).strict().nullable(),
    animals: z
      .object({
        basis: z.enum(["weight_lb", "fido_score"]),
        tiers: z.array(TierSchema).min(1).max(20),
        /** How each recorded treatment is charged; never inferred from the animal. */
        treatments: z
          .object({
            pet: z.enum(["tiered", "no_charge"]),
            assistance_animal: z.enum(["tiered", "no_charge"]),
          })
          .strict(),
        /** Whether the animal agreement applies to each recorded treatment. */
        agreementFor: z
          .object({ pet: z.boolean(), assistance_animal: z.boolean() })
          .strict(),
        /** Which weight counts for a juvenile animal under a weight basis; null when not used. */
        juvenileWeightBasis: z.enum(["current", "expected_adult"]).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((content, ctx) => {
    const issue = tierIssue(content.animals);
    if (issue) ctx.addIssue({ code: "custom", message: issue });
  });
export type ChargePolicyContent = z.infer<typeof ChargePolicyContentSchema>;

/** A real calendar day; 2026-99-99 and other impossible dates are refused. */
const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Choose a real calendar date.");

export const ChargePolicyRecordSchema = z
  .object({
    schemaVersion: z.literal(CHARGE_POLICY_SCHEMA_VERSION),
    version: z.number().int().positive(),
    effectiveFrom: CalendarDateSchema,
    content: ChargePolicyContentSchema,
    note: z.string().trim().min(1).max(500).optional(),
    publishedAt: z.string().datetime(),
    publishedByUid: z.string().trim().min(1).max(128),
  })
  .strict();
export type ChargePolicyRecord = z.infer<typeof ChargePolicyRecordSchema>;

export const PublishChargePolicyInputSchema = z
  .object({
    content: ChargePolicyContentSchema,
    effectiveFrom: CalendarDateSchema,
    note: z.string().trim().min(1).max(500).optional(),
    /** 0 when no policy has been published yet. */
    expectedVersion: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
  })
  .strict();

/** Overlapping, unordered or gapped tiers are refused; a value never falls between two rules. */
export function tierIssue(animals: ChargePolicyContent["animals"]): string | null {
  if (!animals) return null;
  const tiers = animals.tiers;
  if (new Set(tiers.map((tier) => tier.tierId)).size !== tiers.length)
    return "Each tier needs a distinct identifier.";
  const start = animals.basis === "fido_score" ? 1 : 0;
  if (tiers[0].min !== start)
    return `The first tier must start at ${start} so no ${animals.basis === "fido_score" ? "score" : "weight"} is left without a rule.`;
  for (const [index, tier] of tiers.entries()) {
    const last = index === tiers.length - 1;
    if (tier.maxExclusive !== null && tier.maxExclusive <= tier.min)
      return `${tier.label}: the upper bound must be above the lower bound.`;
    if (!last && tier.maxExclusive === null)
      return `${tier.label}: only the last tier may be open-ended.`;
    if (!last && tiers[index + 1].min !== tier.maxExclusive)
      return tiers[index + 1].min < (tier.maxExclusive ?? Infinity)
        ? `${tier.label} and ${tiers[index + 1].label} overlap.`
        : `There is a gap between ${tier.label} and ${tiers[index + 1].label}.`;
    if (
      animals.basis === "fido_score" &&
      (!Number.isInteger(tier.min) ||
        (tier.maxExclusive !== null && !Number.isInteger(tier.maxExclusive)))
    )
      return `${tier.label}: FIDO score tiers use whole scores.`;
  }
  const lastTier = tiers[tiers.length - 1];
  if (
    animals.basis === "fido_score" &&
    lastTier.maxExclusive !== null &&
    lastTier.maxExclusive < 6
  )
    return "FIDO score tiers must cover every score from 1 to 5.";
  if (animals.basis === "weight_lb" && lastTier.maxExclusive !== null)
    return "The last weight tier must be open-ended so a heavier animal is never unpriced.";
  return null;
}

export type ChargeCadence = "monthly" | "one_time" | "refundable_deposit";
export const CHARGE_CADENCE_LABELS: Readonly<Record<ChargeCadence, string>> = {
  monthly: "Monthly",
  one_time: "One-time",
  refundable_deposit: "Refundable deposit",
};

export interface AnimalChargeResult {
  animalId: string;
  label: string;
  status: "calculated" | "no_charge" | "needs_input";
  tierLabel: string | null;
  amounts: Record<ChargeCadence, number | null>;
  overridden: ChargeCadence[];
  reason: string;
}

export interface ChargeIssue {
  scope: string;
  label: string;
}

export interface CalculatedCharges {
  policyVersion: string | null;
  charges: PacketCharge[];
  animals: AnimalChargeResult[];
  /** Per-animal agreement applicability; null while the treatment or policy is unknown. */
  agreementApplicable: Record<string, boolean | null>;
  /** Null while any applicable component is unknown; never a guessed zero. */
  totals: Record<ChargeCadence, number | null>;
  issues: ChargeIssue[];
  /** Document facts for the totals and package/program amounts, in dollars. */
  facts: PacketFact[];
}

const KG_TO_LB = 2.20462262185;

function policySource(policy: ChargePolicyRecord, part: string): PacketSourceReference {
  return {
    system: CHARGE_POLICY_SOURCE_SYSTEM,
    reference: `charge-policy:v${policy.version}:${part}`,
    retrievedAt: policy.publishedAt,
    effectiveAt: policy.effectiveFrom,
    version: String(policy.version),
  };
}

function animalLabel(animal: PacketAnimalInput, index: number): string {
  return animal.name ?? `Animal ${index + 1}`;
}

function dollars(centsValue: number): number {
  return Math.round(centsValue) / 100;
}

function money(centsValue: number): string {
  return `$${dollars(centsValue).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Apply the published policy to one lease's recorded inputs. Missing policy, unknown elections,
 * unknown treatment, weight, maturity or score, and values outside every tier produce named issues
 * and null applicability, so the packet holds only the output that needs them.
 */
export function calculateRenewalCharges(input: {
  leaseId: string;
  policy: ChargePolicyRecord | null;
  facts: readonly PacketFact[];
  animals: readonly PacketAnimalInput[];
  overrides: readonly StoredChargeOverride[];
}): CalculatedCharges {
  const { policy } = input;
  const issues: ChargeIssue[] = [];
  const charges: PacketCharge[] = [];
  const animals: AnimalChargeResult[] = [];
  const agreementApplicable: Record<string, boolean | null> = {};
  const overrides = new Map(input.overrides.map((entry) => [entry.chargeId, entry]));
  if (!policy) {
    issues.push({
      scope: "charges",
      label: "An Admin has not published the renewal charge policy.",
    });
    for (const animal of input.animals) agreementApplicable[animal.animalId] = null;
    return {
      policyVersion: null,
      charges,
      animals,
      agreementApplicable,
      totals: { monthly: null, one_time: null, refundable_deposit: null },
      issues,
      facts: [],
    };
  }
  const factValue = (key: string) => {
    const values = new Set(
      input.facts
        .filter((fact) => fact.fieldKey === key && fact.confidence === "Verified")
        .map((fact) => JSON.stringify(fact.normalizedValue)),
    );
    return values.size === 1 ? JSON.parse([...values][0]) : undefined;
  };
  const charge = (
    chargeId: string,
    kind: PacketCharge["kind"],
    applicable: boolean | null,
    calculatedCents: number | null,
    cadence: ChargeCadence,
    part: string,
    extra: Partial<PacketCharge> = {},
  ): PacketCharge => {
    const override = applicable ? overrides.get(chargeId) : undefined;
    const amountCents = override ? override.amountCents : calculatedCents;
    return {
      chargeId,
      kind,
      applicable: applicable && amountCents === null ? null : applicable,
      ...(applicable && amountCents !== null ? { amountCents } : {}),
      source: override
        ? {
            system: CHARGE_OVERRIDE_SOURCE_SYSTEM,
            reference: `packet-inputs:${input.leaseId}:override:${chargeId}`,
            retrievedAt: override.recordedAt,
            version: `${policy.version}`,
          }
        : policySource(policy, part),
      confidence: "Verified",
      policyVersion: String(policy.version),
      cadence,
      ...extra,
    };
  };

  // Resident Benefit Package: offered or not by policy; enrollment is the lease's recorded election.
  const rbp = policy.content.residentBenefitPackage;
  if (!rbp) {
    // A recorded enrollment the policy cannot price is a question, never a silently dropped charge.
    const enrolledWithoutAmount = factValue(RBP_ELECTION_KEY) === true;
    if (enrolledWithoutAmount)
      issues.push({
        scope: "resident_benefit_package",
        label:
          "The lease records Resident Benefit Package enrollment, but the published charge policy has no package amount.",
      });
    charges.push(
      charge(
        "resident_benefit_package:monthly",
        "resident_benefit_package",
        enrolledWithoutAmount ? null : false,
        null,
        "monthly",
        "rbp",
      ),
    );
  } else {
    const enrolled = factValue(RBP_ELECTION_KEY);
    if (typeof enrolled !== "boolean")
      issues.push({
        scope: "resident_benefit_package",
        label: "Record whether the tenant is enrolled in the Resident Benefit Package.",
      });
    charges.push(
      charge(
        "resident_benefit_package:monthly",
        "resident_benefit_package",
        typeof enrolled === "boolean" ? enrolled : null,
        rbp.monthlyCents,
        "monthly",
        "rbp",
      ),
    );
  }

  // Insurance: only the PMI program carries a charge; the method itself is a recorded election.
  const method = factValue(INSURANCE_METHOD_KEY);
  if (method === "pmi_program") {
    if (!policy.content.insuranceProgram)
      issues.push({
        scope: "insurance",
        label: "The insurance program amount is not in the published charge policy.",
      });
    charges.push(
      charge(
        "insurance:monthly",
        "insurance",
        policy.content.insuranceProgram ? true : null,
        policy.content.insuranceProgram?.monthlyCents ?? null,
        "monthly",
        "insurance",
      ),
    );
  }

  const animalRules = policy.content.animals;
  for (const [index, animal] of input.animals.entries()) {
    const label = animalLabel(animal, index);
    const result: AnimalChargeResult = {
      animalId: animal.animalId,
      label,
      status: "needs_input",
      tierLabel: null,
      amounts: { monthly: null, one_time: null, refundable_deposit: null },
      overridden: [],
      reason: "",
    };
    const needs = (reason: string) => {
      result.reason = reason;
      issues.push({ scope: "animal_agreement", label: `${label}: ${reason}` });
    };
    const emit = (applicable: boolean | null, tier: ChargePolicyTier | null) => {
      for (const cadence of ["monthly", "one_time", "refundable_deposit"] as const) {
        const chargeId = `animal:${animal.animalId}:${cadence}`;
        const calculated =
          tier === null
            ? null
            : cadence === "monthly"
              ? tier.monthlyCents
              : cadence === "one_time"
                ? tier.oneTimeCents
                : tier.refundableDepositCents;
        const packetCharge = charge(
          chargeId,
          "animal",
          applicable,
          calculated,
          cadence,
          tier ? `animals:${tier.tierId}` : "animals",
          { animalId: animal.animalId, targetArtifactKind: "animal_agreement" },
        );
        charges.push(packetCharge);
        if (packetCharge.applicable)
          result.amounts[cadence] = packetCharge.amountCents ?? null;
        else if (packetCharge.applicable === false) result.amounts[cadence] = 0;
        if (packetCharge.source?.system === CHARGE_OVERRIDE_SOURCE_SYSTEM)
          result.overridden.push(cadence);
      }
    };
    if (!animalRules) {
      agreementApplicable[animal.animalId] = null;
      needs("the published charge policy has no animal rules.");
      emit(null, null);
      animals.push(result);
      continue;
    }
    if (animal.treatment === null) {
      agreementApplicable[animal.animalId] = null;
      needs("record whether this animal is a pet or an assistance animal.");
      emit(null, null);
      animals.push(result);
      continue;
    }
    agreementApplicable[animal.animalId] = animalRules.agreementFor[animal.treatment];
    if (animalRules.treatments[animal.treatment] === "no_charge") {
      result.status = "no_charge";
      result.reason = "Not charged under the published policy for this treatment.";
      emit(false, null);
      animals.push(result);
      continue;
    }
    let basisValue: number | null = null;
    if (animalRules.basis === "fido_score") {
      basisValue = animal.fidoScore;
      if (basisValue === null) needs("record the FIDO score.");
    } else if (animal.weight === null || animal.weightUnit === null) {
      needs("record the weight and its unit.");
    } else if (animalRules.juvenileWeightBasis !== null && animal.maturity === null) {
      needs("record whether the animal is an adult or a juvenile.");
    } else if (
      animalRules.juvenileWeightBasis !== null &&
      animal.maturity === "juvenile" &&
      animal.weightBasis !== animalRules.juvenileWeightBasis
    ) {
      needs(
        animalRules.juvenileWeightBasis === "expected_adult"
          ? "record the expected adult weight for a juvenile animal."
          : "record the juvenile animal's current weight.",
      );
    } else {
      // The exact converted weight decides the tier; rounding first could cross a tier edge.
      basisValue = animal.weightUnit === "kg" ? animal.weight * KG_TO_LB : animal.weight;
    }
    if (basisValue === null) {
      emit(null, null);
      animals.push(result);
      continue;
    }
    const tier = animalRules.tiers.find(
      (candidate) =>
        basisValue >= candidate.min &&
        (candidate.maxExclusive === null || basisValue < candidate.maxExclusive),
    );
    if (!tier) {
      needs(
        "its recorded value is outside every published tier; an Admin must review the policy.",
      );
      emit(null, null);
      animals.push(result);
      continue;
    }
    result.status = "calculated";
    result.tierLabel = tier.label;
    result.reason = `${tier.label} under policy version ${policy.version}.`;
    emit(true, tier);
    animals.push(result);
  }

  const totals: Record<ChargeCadence, number | null> = {
    monthly: 0,
    one_time: 0,
    refundable_deposit: 0,
  };
  for (const entry of charges) {
    const cadence = entry.cadence ?? "monthly";
    if (totals[cadence] === null) continue;
    if (entry.applicable === null) totals[cadence] = null;
    else if (entry.applicable)
      totals[cadence] = totals[cadence]! + (entry.amountCents ?? 0);
  }
  const facts: PacketFact[] = [];
  const fact = (fieldKey: string, valueCents: number, part: string) =>
    facts.push({
      fieldKey,
      normalizedValue: dollars(valueCents),
      displayValue: money(valueCents),
      source: policySource(policy, part),
      confidence: "Verified",
      applicability: "Applicable",
      verifiedBy: CHARGE_POLICY_SOURCE_SYSTEM,
      blockingScope: "charges",
    });
  for (const cadence of ["monthly", "one_time", "refundable_deposit"] as const) {
    const total = totals[cadence];
    if (total !== null) fact(`charges.${cadence}_total`, total, `totals:${cadence}`);
  }
  for (const entry of charges) {
    if (entry.kind === "animal" || !entry.applicable || entry.amountCents === undefined)
      continue;
    fact(`charges.${entry.kind}.monthly`, entry.amountCents, entry.kind);
  }
  return {
    policyVersion: String(policy.version),
    charges,
    animals,
    agreementApplicable,
    totals,
    issues,
    facts,
  };
}

/**
 * The economic decisions an owner approval covers: every calculated charge's applicability and
 * amount and the policy version. A later change makes the recorded approval stale.
 */
export function economicsHash(
  calculated: Pick<CalculatedCharges, "policyVersion" | "charges">,
): string {
  return hashExecutionPreview({
    policyVersion: calculated.policyVersion,
    charges: [...calculated.charges]
      .map((entry) => ({
        chargeId: entry.chargeId,
        applicable: entry.applicable,
        amountCents: entry.amountCents ?? null,
        cadence: entry.cadence ?? null,
      }))
      .sort((left, right) => left.chargeId.localeCompare(right.chargeId)),
  });
}
