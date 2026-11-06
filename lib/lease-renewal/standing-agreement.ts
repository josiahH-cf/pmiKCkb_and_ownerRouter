// S250 ARCH-S250-1 / ARCH-S250-2: a standing owner agreement recorded once for an owner's
// portfolio, and the ONE pure coverage function every consumer reads.
//
// An agreement names an existing pricing policy as its rule, the owner's pre-approval statement in
// words, the dates it is in effect and who agreed, how and when, in words. It carries no cycle
// date, lease list or exact terms (D-OP-3): it covers every lease it is applied to, in every
// renewal cycle while it is in effect, as long as the working rent follows its rule. The S194 exact
// per-lease, per-cycle agreement (`StandingOwnerAgreement` in `renewal-pricing-policy.ts`) stays a
// distinct kind with its own behavior.
//
// Coverage gates nothing (S156): it records no owner response, sends nothing, changes no provider
// rent, and every control stays usable whatever it answers. Pure and client-safe.

import { z } from "zod";

import { formatCalendarDate } from "@/lib/date-display";
import {
  projectRenewalPricingPolicy,
  type RenewalPricingPolicy,
} from "@/lib/lease-renewal/renewal-pricing-policy";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      Number.isFinite(Date.parse(`${value}T00:00Z`)) &&
      new Date(`${value}T00:00Z`).toISOString().slice(0, 10) === value,
    "Use an actual calendar date.",
  );
const words = (max: number) => z.string().trim().min(1).max(max);

/** R-S250-1: one standing agreement, as an Admin records it from the owner's instruction. */
export const StandingAgreementInputSchema = z
  .object({
    id: z.string().uuid(),
    name: words(100),
    /** The pricing rule: an existing reusable policy. */
    policyId: z.string().uuid(),
    /** The owner's verified RentVine portfolio, kept as the numeric stored reference. */
    portfolioId: z.string().regex(/^[1-9]\d{0,9}$/),
    /** The owner's pre-approval of renewals at the rule, in words; null records none. */
    preApprovalStatement: words(1000).nullable(),
    effectiveFrom: date,
    endsOn: date.nullable(),
    agreedBy: words(200),
    agreedHow: words(300),
    agreedWhen: words(200),
    revoked: z.boolean(),
  })
  .strict()
  .refine(
    (value) => value.endsOn === null || value.endsOn >= value.effectiveFrom,
    "The end date precedes the date the agreement took effect.",
  );
export type StandingAgreementInput = z.infer<typeof StandingAgreementInputSchema>;

export interface StandingAgreement extends StandingAgreementInput {
  version: number;
  recordedByUid: string;
  recordedAt: string;
}

/** R-S250-3: the pricing basis staff choose at one scope (the lease, or its owner's portfolio). */
export const PricingBasisChoiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("agreement"), agreementId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("owner_decides") }).strict(),
]);
export type PricingBasisChoice = z.infer<typeof PricingBasisChoiceSchema>;

/** The exact words the Now card, the panel and the litmus read. */
export const STANDING_AGREEMENT_WORDS = {
  pricingBasis: "Pricing basis",
  ownerDecides: "Owner decides each renewal",
  leaseOnly: "This lease only",
  portfolio: "Every lease in this owner's portfolio",
  earlierRule: "Built on the earlier rule",
  rebuild: "Rebuild with the current rule",
  usePortfolio: "Use the portfolio's pricing basis",
  tag: "Standing agreement",
} as const;

export function coveredByLine(name: string): string {
  return `Covered by ${name}: no owner message needed`;
}

const usd = (amount: number, cents = true) =>
  `$${(cents ? amount.toFixed(2) : String(Math.round(amount))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  )}`;

/** The rule in words, from the policy's own kind and amount (never from its name). */
export function standingRuleWords(
  policy: Pick<RenewalPricingPolicy, "kind" | "value">,
): string {
  switch (policy.kind) {
    case "percentage":
      return `Raise the current rent by ${policy.value} percent`;
    case "fixed_dollar":
      return `Raise the current rent by ${usd(policy.value ?? 0, !Number.isInteger(policy.value ?? 0))}`;
    case "no_increase":
      return "Keep the current rent";
    default:
      return "Review the rent by hand";
  }
}

/** One agreement as the Pricing basis list names it: by name and rule. */
export function standingAgreementChoiceLabel(name: string, rule: string | null): string {
  return rule ? `${name}: ${rule}` : name;
}

export type StandingCoverage =
  | {
      readonly covered: true;
      readonly kind: "standing";
      readonly agreementId: string;
      readonly agreementVersion: number;
      readonly label: string;
      readonly rule: string;
      readonly policyId: string;
      readonly policyVersion: number;
      readonly amount: number;
      /** The rent's basis in words: the rule applied to the authoritative current rent. */
      readonly basis: string;
      readonly effectiveFrom: string;
      readonly appliedScope: "lease" | "portfolio";
      readonly reason: string;
    }
  | {
      readonly covered: false;
      readonly kind: "standing";
      /** The agreement this lease leaves, when one is applied; null for "Owner decides". */
      readonly agreementId: string | null;
      readonly label: string | null;
      readonly rule: string | null;
      /** The rule's rent where it gives one, so a different working rent can name both. */
      readonly amount: number | null;
      readonly appliedScope: "lease" | "portfolio" | null;
      readonly reason: string;
    };

export interface StandingCoverageInput {
  /** The agreement applied at the winning scope (lease over portfolio); null when none. */
  readonly agreement: StandingAgreement | null;
  readonly appliedScope: "lease" | "portfolio" | null;
  /** The agreement's rule: its policy's newest version in effect today; null when none is. */
  readonly policy: RenewalPricingPolicy | null;
  /** The lease's portfolio from the verified RentVine read; null when it cannot be verified. */
  readonly verifiedPortfolioId: string | null;
  /** The authoritative current rent (RentVine contractual base rent). */
  readonly currentRent: number | null;
  /** The working renewal rent staff saved; null while it is untouched (the rule then stands). */
  readonly workingRent: number | null;
  /** Today's Central business date. */
  readonly today: string;
  /** Other current agreements naming this lease whose rent differs from the rule's. */
  readonly conflicts: number;
}

const OWNER_DECIDES = "so the owner decides this renewal";

/**
 * ARCH-S250-2: the ONE coverage function. Covered only while a recorded, pre-approved agreement
 * in effect today is applied to this lease, the lease's portfolio is verified and is the
 * agreement's own, no other current agreement disagrees, the rule gives a rent and the working
 * rent is untouched or equal to it. Every other answer returns the owner step with the reason in
 * words (R-S250-6).
 */
export function standingAgreementCoverage(
  input: StandingCoverageInput,
): StandingCoverage {
  const a = input.agreement;
  const refuse = (
    reason: string,
    extra: { rule?: string | null; amount?: number | null } = {},
  ): StandingCoverage => ({
    covered: false,
    kind: "standing",
    agreementId: a?.id ?? null,
    label: a?.name ?? null,
    rule: extra.rule ?? null,
    amount: extra.amount ?? null,
    appliedScope: a ? input.appliedScope : null,
    reason,
  });
  if (!a) return refuse(`${STANDING_AGREEMENT_WORDS.ownerDecides}.`);
  const { version, recordedByUid, recordedAt, ...recorded } = a;
  if (
    !StandingAgreementInputSchema.safeParse(recorded).success ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !recordedByUid ||
    !recordedAt
  )
    return refuse(`The standing agreement record needs review, ${OWNER_DECIDES}.`);
  const rule = input.policy ? standingRuleWords(input.policy) : null;
  if (!a.preApprovalStatement?.trim())
    return refuse(`${a.name} records no owner pre-approval, ${OWNER_DECIDES}.`, { rule });
  if (a.revoked) return refuse(`${a.name} was revoked, ${OWNER_DECIDES}.`, { rule });
  if (a.effectiveFrom > input.today)
    return refuse(
      `${a.name} takes effect on ${formatCalendarDate(a.effectiveFrom)}, ${OWNER_DECIDES}.`,
      { rule },
    );
  if (a.endsOn !== null && a.endsOn < input.today)
    return refuse(
      `${a.name} ended on ${formatCalendarDate(a.endsOn)}, ${OWNER_DECIDES}.`,
      { rule },
    );
  if (!input.verifiedPortfolioId)
    return refuse(
      `This lease's RentVine portfolio could not be verified, so ${a.name} cannot cover it and the owner decides this renewal.`,
      { rule },
    );
  if (input.verifiedPortfolioId !== a.portfolioId)
    return refuse(`This lease is outside the portfolio of ${a.name}, ${OWNER_DECIDES}.`, {
      rule,
    });
  if (input.conflicts > 0)
    return refuse(
      `Two agreements with different rents apply to this lease, ${OWNER_DECIDES}.`,
      { rule },
    );
  if (!input.policy)
    return refuse(`The rule of ${a.name} is not in effect today, ${OWNER_DECIDES}.`);
  const proposal = projectRenewalPricingPolicy(
    input.policy,
    input.currentRent,
    input.today,
  );
  if (!proposal.effective || proposal.amount === null)
    return refuse(
      `The rule of ${a.name} gives no rent for this lease. ${proposal.reason.replace(/\s*Owner review is required\.?$/, "")} The owner decides this renewal.`,
      { rule },
    );
  if (
    input.workingRent !== null &&
    Math.abs(input.workingRent - proposal.amount) >= 0.005
  )
    return refuse(
      `The working rent ${usd(input.workingRent)} differs from ${usd(proposal.amount)} under ${a.name}, ${OWNER_DECIDES}.`,
      { rule, amount: proposal.amount },
    );
  const basis = `${a.name}: ${rule!.charAt(0).toLowerCase()}${rule!.slice(1)}, applied to the current rent of ${usd(input.currentRent!)} and rounded to ${usd(proposal.amount, false)}. The owner pre-approved renewals at this rule.`;
  return {
    covered: true,
    kind: "standing",
    agreementId: a.id,
    agreementVersion: a.version,
    label: a.name,
    rule: rule!,
    policyId: input.policy.id,
    policyVersion: input.policy.version,
    amount: proposal.amount,
    basis,
    effectiveFrom: a.effectiveFrom,
    appliedScope: input.appliedScope ?? "lease",
    reason: `${coveredByLine(a.name)}. ${rule} under the owner's pre-approval, in effect since ${formatCalendarDate(a.effectiveFrom)}.`,
  };
}

/** The newest recorded version of one agreement among the snapshot's versions. */
export function newestStandingAgreement(
  agreements: readonly StandingAgreement[],
  agreementId: string,
): StandingAgreement | null {
  return (
    agreements
      .filter((entry) => entry.id === agreementId)
      .sort((left, right) => right.version - left.version)[0] ?? null
  );
}

/** The agreement's rule: its policy's newest version in effect on the business date. */
export function standingRulePolicy(
  policies: readonly RenewalPricingPolicy[],
  policyId: string,
  today: string,
): RenewalPricingPolicy | null {
  return (
    policies
      .filter((entry) => entry.id === policyId && entry.effectiveFrom <= today)
      .sort((left, right) => right.version - left.version)[0] ?? null
  );
}

/**
 * R-S250-7: the marker a working rent carries when staff adopt it from an agreement's rule, so a
 * later rule change can say the rent (and the message built on it) came from the earlier rule.
 */
export function standingRuleSourceLabel(agreementName: string, policyVersion: number) {
  return `Standing agreement ${agreementName}, rule v${policyVersion}`.slice(0, 120);
}
export function standingRuleContext(input: {
  agreementId: string;
  policyId: string;
  policyVersion: number;
  basis: string;
}) {
  return `standing:${input.agreementId}:${input.policyId}:v${input.policyVersion}. ${input.basis}`.slice(
    0,
    1000,
  );
}
/** The rule a working rent was adopted from, or null when it was typed or adopted elsewhere. */
export function adoptedStandingRule(entry: {
  readonly origin: string;
  readonly context?: string;
}): { agreementId: string; policyId: string; policyVersion: number } | null {
  if (entry.origin !== "adopted_source" || !entry.context) return null;
  const match = entry.context.match(
    /^standing:([0-9a-f-]{36}):([0-9a-f-]{36}):v([1-9]\d*)\./i,
  );
  return match
    ? { agreementId: match[1]!, policyId: match[2]!, policyVersion: Number(match[3]) }
    : null;
}
