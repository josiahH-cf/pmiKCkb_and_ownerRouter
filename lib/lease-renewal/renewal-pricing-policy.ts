import { z } from "zod";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(`${v}T00:00Z`)) &&
      new Date(`${v}T00:00Z`).toISOString().slice(0, 10) === v,
    "Use an actual calendar date.",
  );
export const RenewalPricingPolicyInputSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    kind: z.enum(["percentage", "fixed_dollar", "no_increase", "manual_review"]),
    value: z.number().finite().positive().max(1_000_000).nullable(),
    effectiveFrom: date,
    effectiveThrough: date.nullable(),
    enabled: z.boolean(),
    purpose: z.string().trim().min(1).max(1000),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      p.kind === "percentage" || p.kind === "fixed_dollar"
        ? p.value === null
        : p.value !== null
    )
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message:
          "Percentage and fixed-dollar policies require a value; other types carry no amount.",
      });
    if (p.kind === "percentage" && p.value !== null && p.value > 100)
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Use a percentage at most 100.",
      });
    if (p.effectiveThrough && p.effectiveThrough < p.effectiveFrom)
      ctx.addIssue({
        code: "custom",
        path: ["effectiveThrough"],
        message: "End date precedes the effective date.",
      });
  });
export type RenewalPricingPolicyInput = z.infer<typeof RenewalPricingPolicyInputSchema>;
export interface RenewalPricingPolicy extends RenewalPricingPolicyInput {
  version: number;
  updatedByUid: string;
  updatedAt: string;
}
export interface RenewalPolicyProposal {
  policyId: string;
  policyVersion: number;
  policyName: string;
  currentRent: number | null;
  amount: number | null;
  reason: string;
  effective: boolean;
}
export function projectRenewalPricingPolicy(
  p: RenewalPricingPolicy,
  currentRent: number | null,
  today: string,
): RenewalPolicyProposal {
  const { version, updatedByUid, updatedAt, ...input } = p;
  void updatedByUid;
  void updatedAt;
  const parsed = RenewalPricingPolicyInputSchema.safeParse(input);
  const effective =
    parsed.success &&
    Number.isSafeInteger(version) &&
    version > 0 &&
    p.enabled &&
    p.effectiveFrom <= today &&
    (!p.effectiveThrough || p.effectiveThrough >= today);
  const base = {
    policyId: p.id,
    policyVersion: p.version,
    policyName: p.name,
    currentRent,
    amount: null,
    effective,
  };
  if (!effective)
    return {
      ...base,
      reason:
        "The policy is invalid, disabled or outside its effective dates. Owner review is required.",
    };
  if (p.kind === "manual_review")
    return { ...base, reason: "This policy requires manual pricing review." };
  if (currentRent === null || !Number.isFinite(currentRent) || currentRent <= 0)
    return {
      ...base,
      reason: "Authoritative current rent is unavailable. No amount is proposed.",
    };
  const amount = Math.round(
    p.kind === "percentage"
      ? currentRent * (1 + p.value! / 100)
      : p.kind === "fixed_dollar"
        ? currentRent + p.value!
        : currentRent,
  );
  if (amount <= 0 || amount > 1_000_000)
    return {
      ...base,
      reason: "The result exceeds the supported rent range. Manual review is required.",
    };
  const operation =
    p.kind === "percentage"
      ? `+${p.value}%`
      : p.kind === "fixed_dollar"
        ? `+$${p.value}`
        : "no increase";
  return {
    ...base,
    amount,
    reason: `${p.name} v${p.version}: $${currentRent.toFixed(2)} current rent, ${operation}, rounded to $${amount.toFixed(0)}. ${p.purpose}`,
  };
}
/** An untouched field is absent. Even a deliberately cleared entry is a staff choice. */
export function policyPrefill(i: {
  proposal: RenewalPolicyProposal;
  workingEntry: { value: unknown } | null;
  recordedOwnerRent: number | null;
}) {
  return i.workingEntry === null &&
    i.recordedOwnerRent === null &&
    i.proposal.effective &&
    i.proposal.amount !== null
    ? {
        value: i.proposal.amount,
        origin: "policy_prefill" as const,
        policyId: i.proposal.policyId,
        policyVersion: i.proposal.policyVersion,
        sourceRent: i.proposal.currentRent,
        reason: i.proposal.reason,
      }
    : null;
}
const terms = z
  .object({
    rent: z.number().positive().finite().max(1_000_000),
    effectiveDate: date,
    endDate: date,
  })
  .strict()
  .refine((t) => t.endDate > t.effectiveDate, "End date must follow the effective date.");
export const StandingOwnerAgreementInputSchema = z
  .object({
    id: z.string().uuid(),
    policyId: z.string().uuid(),
    policyVersion: z.number().int().positive(),
    portfolioId: z.string().regex(/^[1-9]\d{0,9}$/),
    leaseIds: z
      .array(z.string().regex(/^[1-9]\d*$/))
      .min(1)
      .max(500)
      .refine((v) => new Set(v).size === v.length),
    cycleDate: date,
    terms,
    evidenceRef: z.string().trim().min(8).max(1000),
    effectiveFrom: date,
    expiresOn: date,
    revoked: z.boolean(),
  })
  .strict()
  .refine(
    (a) => a.expiresOn >= a.effectiveFrom,
    "Agreement expiry precedes its effective date.",
  );
export interface StandingOwnerAgreement extends z.infer<
  typeof StandingOwnerAgreementInputSchema
> {
  version: number;
  recordedByUid: string;
  recordedAt: string;
}
/** A recorded price rule is preparation context. Only a separately evidenced exact agreement covers outreach. */
export function standingOwnerAuthority(i: {
  agreement: StandingOwnerAgreement | null;
  policy: RenewalPricingPolicy | null;
  leaseId: string;
  verifiedPortfolioId: string | null;
  cycleDate: string | null;
  terms: z.infer<typeof terms> | null;
  currentRent: number | null;
  today: string;
  conflict: boolean;
}): {
  covered: boolean;
  reason: string;
  agreementId?: string;
  agreementVersion?: number;
} {
  const a = i.agreement;
  const refuse = (reason: string) => ({ covered: false, reason });
  if (!a || !i.policy)
    return refuse(
      "No applicable recorded standing owner authority. Individual owner review is required.",
    );
  const { version, recordedByUid, recordedAt, ...recorded } = a;
  if (
    !StandingOwnerAgreementInputSchema.safeParse(recorded).success ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !recordedByUid ||
    !recordedAt
  )
    return refuse("Standing authority evidence is invalid. Owner review is required.");
  if (i.conflict)
    return refuse(
      "Standing authority conflicts with another current agreement. Owner review is required.",
    );
  if (
    !i.verifiedPortfolioId ||
    a.portfolioId !== i.verifiedPortfolioId ||
    !a.leaseIds.includes(i.leaseId)
  )
    return refuse("Verified lease membership is missing or outside this agreement.");
  if (
    a.revoked ||
    a.effectiveFrom > i.today ||
    a.expiresOn < i.today ||
    !a.evidenceRef.trim()
  )
    return refuse(
      "Standing authority is revoked, expired, future or lacks agreement evidence.",
    );
  if (
    !i.cycleDate ||
    a.cycleDate !== i.cycleDate ||
    a.policyId !== i.policy.id ||
    a.policyVersion !== i.policy.version
  )
    return refuse(
      "The current cycle or policy version is outside recorded standing authority.",
    );
  const p = projectRenewalPricingPolicy(i.policy, i.currentRent, i.today);
  if (
    p.amount === null ||
    !i.terms ||
    p.amount !== i.terms.rent ||
    a.terms.rent !== i.terms.rent ||
    a.terms.effectiveDate !== i.terms.effectiveDate ||
    a.terms.endDate !== i.terms.endDate
  )
    return refuse(
      "The working terms differ from the recorded agreement. Owner review is required.",
    );
  return {
    covered: true,
    agreementId: a.id,
    agreementVersion: a.version,
    reason: `Recorded standing owner authority v${a.version} covers this lease, cycle and exact rent/dates. Other changed terms retain their own review requirements.`,
  };
}

export interface PricingAssignment {
  scope: "portfolio" | "lease";
  sourceId: string;
  policyId: string | null;
  version: number;
  selectedPolicyVersion: number | null;
  reason: string;
  recordedByUid: string;
  recordedAt: string;
}
export interface VerifiedPricingLease {
  leaseId: string;
  portfolioId: string;
  currentRent: number | null;
  cycleDate: string | null;
  rentSource: string;
}
/** One request's bounded source-owned snapshot. It never outlives the source generation. */
export interface RenewalPricingSnapshot {
  assignments: PricingAssignment[];
  policies: RenewalPricingPolicy[];
  agreements: StandingOwnerAgreement[];
  legacyPolicies: Record<string, RenewalPricingPolicy>;
}
export function resolveRenewalPricing(
  snapshot: RenewalPricingSnapshot,
  f: VerifiedPricingLease,
  terms: StandingOwnerAgreement["terms"] | null,
  today: string,
) {
  const leaseAssignment =
    snapshot.assignments.find((a) => a.scope === "lease" && a.sourceId === f.leaseId) ??
    null;
  const portfolioAssignment =
    snapshot.assignments.find(
      (a) => a.scope === "portfolio" && a.sourceId === f.portfolioId,
    ) ?? null;
  const selected = leaseAssignment?.policyId
    ? leaseAssignment
    : portfolioAssignment?.policyId
      ? portfolioAssignment
      : null;
  const policy = selected
    ? (snapshot.policies
        .filter((p) => p.id === selected.policyId && p.effectiveFrom <= today)
        .sort((a, b) => b.version - a.version)[0] ?? null)
    : (snapshot.legacyPolicies[f.portfolioId] ?? null);
  const proposal = policy
    ? projectRenewalPricingPolicy(policy, f.currentRent, today)
    : null;
  const agreements = snapshot.agreements.filter((g) => g.leaseIds.includes(f.leaseId));
  const currentAgreements = agreements.filter(
    (g) =>
      !g.revoked &&
      g.effectiveFrom <= today &&
      g.expiresOn >= today &&
      g.cycleDate === f.cycleDate,
  );
  const authority = standingOwnerAuthority({
    agreement: currentAgreements.length === 1 ? currentAgreements[0] : null,
    policy,
    leaseId: f.leaseId,
    verifiedPortfolioId: f.portfolioId,
    cycleDate: f.cycleDate,
    terms,
    currentRent: f.currentRent,
    today,
    conflict: currentAgreements.length > 1,
  });
  return {
    policy,
    proposal,
    assignment: selected,
    leaseAssignment,
    portfolioAssignment,
    policyChanged: !!(
      selected &&
      policy &&
      selected.selectedPolicyVersion !== policy.version
    ),
    authority,
    agreements,
    rentSource: f.rentSource,
  };
}
export type RenewalPricingProjection = ReturnType<typeof resolveRenewalPricing>;

export interface RenewalPricingRead {
  snapshot: RenewalPricingSnapshot;
  facts: VerifiedPricingLease[];
  today: string;
}
