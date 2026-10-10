import { z } from "zod";
import type { MaintenanceTicketRecord } from "./ticket-model";
// S108 property maintenance preapproval: the exact amount an owner has already authorized for a
// property, recorded by an Admin from the owner's records. Money is stored as whole cents so a
// comparison against an estimate is exact; nothing here reaches a provider, and a preapproval never
// claims owner approval inside RentVine.

export interface MaintenancePropertyPreapproval {
  readonly property_key: string;
  readonly amount_cents: number;
  readonly effective_from_iso: string;
  readonly recorded_by_uid: string;
  readonly version: number;
  readonly note?: string;
  readonly policy_terms?: MaintenanceStandingPolicyTerms;
}

/** The largest amount an Admin may record. A larger entry is a typo, not an authorization. */
export const MAX_PREAPPROVAL_AMOUNT_CENTS = 100_000_00;

export class PreapprovalAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreapprovalAmountError";
  }
}

/**
 * Parse an operator-entered amount into whole cents. Only a plain positive decimal with at most two
 * fractional digits is accepted; grouping commas and one leading currency symbol are tolerated
 * because that is how the amount appears in the owner's records.
 */
export function parsePreapprovalAmountCents(input: string): number {
  const trimmed = String(input ?? "")
    .trim()
    .replace(/^\$/, "")
    .replaceAll(",", "");
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(trimmed)) {
    throw new PreapprovalAmountError(
      "Enter the preapproval as a dollar amount with at most two decimal places, for example 500 or 1250.75.",
    );
  }
  const [dollars, fraction = ""] = trimmed.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new PreapprovalAmountError("A preapproval amount must be greater than zero.");
  }
  if (cents > MAX_PREAPPROVAL_AMOUNT_CENTS) {
    throw new PreapprovalAmountError(
      `A preapproval above ${formatPreapprovalAmount(MAX_PREAPPROVAL_AMOUNT_CENTS)} needs the owner's written direction; record the exact authorized amount instead.`,
    );
  }
  return cents;
}

export function formatPreapprovalAmount(cents: number): string {
  const negative = cents < 0;
  const absolute = Math.abs(Math.trunc(cents));
  const dollars = String(Math.floor(absolute / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  const remainder = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars}.${remainder}`;
}

/**
 * True only when an exact recorded estimate is at or below an exact recorded preapproval. A missing
 * estimate or a missing preapproval is never "within": absence is not authorization.
 */
export function isWithinPreapproval(
  estimateCents: number | null | undefined,
  preapproval: MaintenancePropertyPreapproval | null | undefined,
): boolean {
  if (typeof estimateCents !== "number" || !Number.isFinite(estimateCents)) return false;
  if (estimateCents <= 0) return false;
  if (!preapproval || !Number.isFinite(preapproval.amount_cents)) return false;
  return estimateCents <= preapproval.amount_cents;
}

export const MaintenanceStandingPolicyTermsSchema = z
  .object({
    scope: z.enum(["property", "owner"]),
    property_keys: z
      .array(z.string().regex(/^[A-Za-z0-9:_-]{1,200}$/))
      .min(1)
      .max(500),
    owner_ref: z
      .string()
      .regex(/^[A-Za-z0-9:_-]{1,200}$/)
      .nullable(),
    comparison: z.enum(["inclusive", "exclusive"]),
    cost_basis: z.enum([
      "total_including_tax_and_markup",
      "vendor_cost_including_tax",
      "vendor_cost_excluding_tax",
    ]),
    evidence_ref: z.string().trim().min(1).max(1000),
    expires_at: z.string().datetime().nullable(),
    revoked_at: z.string().datetime().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.property_keys).size !== value.property_keys.length ||
      (value.scope === "owner") !== Boolean(value.owner_ref)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Use unique real properties and an exact owner reference only for an owner policy.",
      });
    if (value.scope === "property" && value.property_keys.length !== 1)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A property policy applies to exactly one property.",
      });
  });
export type MaintenanceStandingPolicyTerms = z.infer<
  typeof MaintenanceStandingPolicyTermsSchema
>;
/** Evaluates only exact actual terms. Imported limits remain visible without becoming policy. */
export function evaluateMaintenanceStandingPolicy(
  ticket: MaintenanceTicketRecord,
  preapproval: MaintenancePropertyPreapproval | null | undefined,
  at: Date | string | number = Date.now(),
  verifiedOwnerRefs: readonly string[] = [],
) {
  const refuse = (state: string) => ({
    authorized: false,
    state,
    policyVersion: preapproval?.version ?? null,
  });
  if (
    ticket.status === "Closed" ||
    ticket.assessment?.outcome !== "work_required" ||
    !ticket.assessment.scope?.trim()
  )
    return refuse("assessment_required");
  const parsed = MaintenanceStandingPolicyTermsSchema.safeParse(
    preapproval?.policy_terms,
  );
  if (!preapproval || !parsed.success) return refuse("unqualified_policy");
  const terms = parsed.data,
    now = new Date(at).getTime();
  if (
    !ticket.property_id ||
    !terms.property_keys.includes(ticket.property_id) ||
    !terms.property_keys.includes(preapproval.property_key)
  )
    return refuse("scope_mismatch");
  if (terms.revoked_at && Date.parse(terms.revoked_at) <= now) return refuse("revoked");
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(Date.parse(preapproval.effective_from_iso)) ||
    Date.parse(preapproval.effective_from_iso) > now
  )
    return refuse("not_effective");
  if (terms.expires_at && Date.parse(terms.expires_at) <= now) return refuse("expired");
  if (!ticket.estimate_cost_basis || ticket.estimate_cost_basis !== terms.cost_basis)
    return refuse("cost_basis_unknown");
  const cents = ticket.estimate_amount_cents;
  if (
    !Number.isSafeInteger(cents) ||
    !cents ||
    cents <= 0 ||
    !Number.isSafeInteger(preapproval.amount_cents) ||
    preapproval.amount_cents <= 0
  )
    return refuse("amount_unknown");
  if (
    terms.comparison === "inclusive"
      ? cents > preapproval.amount_cents
      : cents >= preapproval.amount_cents
  )
    return refuse("amount_exceeds_policy");
  if (terms.scope === "owner" && !verifiedOwnerRefs.includes(terms.owner_ref!))
    return refuse("owner_relation_unverified");
  return {
    authorized: true,
    state: "within_current_policy",
    policyVersion: preapproval.version,
  };
}

export const MaintenancePropertyPreapprovalSchema = z
  .object({
    property_key: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9:_-]+$/),
    amount_cents: z.number().int().positive().max(MAX_PREAPPROVAL_AMOUNT_CENTS),
    effective_from_iso: z.string().min(1).max(60),
    recorded_by_uid: z.string().min(1).max(200),
    version: z.number().int().positive(),
    note: z.string().trim().min(1).max(2000).optional(),
    policy_terms: MaintenanceStandingPolicyTermsSchema.optional(),
  })
  .strict();
const PolicyIdentity = {
  property_key: MaintenancePropertyPreapprovalSchema.shape.property_key,
  expected_version: z.number().int().nonnegative(),
  operation_id: z.string().uuid(),
};
export const ApplyMaintenancePolicyInputSchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...PolicyIdentity,
      operation: z.literal("set_policy"),
      amount_cents: z.number().int().positive().max(MAX_PREAPPROVAL_AMOUNT_CENTS),
      effective_from_iso: z.string().datetime(),
      policy_terms: MaintenanceStandingPolicyTermsSchema,
      note: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      ...PolicyIdentity,
      operation: z.literal("revoke_policy"),
      reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);
export type ApplyMaintenancePolicyInput = z.infer<
  typeof ApplyMaintenancePolicyInputSchema
>;
