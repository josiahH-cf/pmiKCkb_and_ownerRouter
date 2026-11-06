import {
  assertRenewalRoleAuthority,
  renewalRoleCapability,
} from "@/lib/lease-renewal/role-action-governance";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import {
  PricingAssignmentInputSchema,
  PricingBasisInputSchema,
} from "@/lib/firestore/renewal-pricing-policies";
import {
  RenewalPricingPolicyInputSchema,
  StandingOwnerAgreementInputSchema,
  policyPrefill,
  type RenewalPricingPolicy,
} from "@/lib/lease-renewal/renewal-pricing-policy";
import {
  StandingAgreementInputSchema,
  standingRuleWords,
  standingRulePolicy,
  type StandingAgreement,
} from "@/lib/lease-renewal/standing-agreement";
import { pricingPolicyDependencies } from "@/lib/lease-renewal/pricing-policy-dependencies";
import { getRenewalWorkingRecord } from "@/lib/firestore/renewal-working-record";
import { readEffectiveRenewalTerms } from "@/lib/firestore/renewal-effective-terms";
import { getRenewalWorkspace } from "@/lib/firestore/renewal-workspace";
import { currentManualOwnerTerms } from "@/lib/lease-renewal/workspace-state";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import { workingRenewalTerms } from "@/lib/lease-renewal/working-record";
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("policy"),
      policy: RenewalPricingPolicyInputSchema,
      expectedVersion: z.number().int().nonnegative(),
      operationId: z.string().uuid(),
    })
    .strict(),
  PricingAssignmentInputSchema.extend({ action: z.literal("assignment") }),
  z
    .object({
      action: z.literal("agreement"),
      agreement: StandingOwnerAgreementInputSchema,
      expectedVersion: z.number().int().nonnegative(),
      operationId: z.string().uuid(),
    })
    .strict(),
  // S250 R-S250-1: an Admin records or changes a standing agreement for an owner's portfolio.
  z
    .object({
      action: z.literal("standing_agreement"),
      agreement: StandingAgreementInputSchema,
      expectedVersion: z.number().int().nonnegative(),
      operationId: z.string().uuid(),
    })
    .strict(),
  // S250 R-S250-3: staff choose the pricing basis for this lease or the owner's portfolio.
  PricingBasisInputSchema.extend({ action: z.literal("pricing_basis") }),
]);
const headers = { "Cache-Control": "private, no-store" };

/** One agreement as the Pricing basis list shows it: by name and rule, with its dates. */
function standingAgreementView(
  agreement: StandingAgreement,
  policies: readonly RenewalPricingPolicy[],
  today: string,
) {
  const rule = standingRulePolicy(policies, agreement.policyId, today);
  return {
    ...agreement,
    rule: rule ? standingRuleWords(rule) : null,
    ruleVersion: rule?.version ?? null,
    active:
      !agreement.revoked &&
      agreement.effectiveFrom <= today &&
      (agreement.endsOn === null || agreement.endsOn >= today),
  };
}

export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const q = z
      .object({
        leaseId: z
          .string()
          .regex(/^[1-9]\d*$/)
          .optional(),
        after: z.string().uuid().optional(),
        portfolioId: z
          .string()
          .regex(/^[1-9]\d{0,9}$/)
          .optional(),
        // S250: the Admin list of every recorded standing agreement.
        standing: z.literal("all").optional(),
      })
      .strict()
      .refine((q) => !(q.leaseId && q.portfolioId), "Choose one source scope.")
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const { store, verifier } = pricingPolicyDependencies(actor);
    const catalog = await store.list(actor, q.after ?? null);
    const today = businessDateIso(new Date());
    if (q.standing === "all") {
      const agreements = await store.standingAgreements(actor, null);
      return NextResponse.json(
        {
          ...catalog,
          standingAgreements: agreements.map((agreement) =>
            standingAgreementView(agreement, catalog.policies, today),
          ),
        },
        { headers },
      );
    }
    if (q.portfolioId) {
      if (!(await verifier.portfolio(q.portfolioId)))
        throw new EditableLayerError(
          "The portfolio membership could not be verified.",
          409,
        );
      const [assignment, agreements, owners] = await Promise.all([
        store.assignment(actor, "portfolio", q.portfolioId),
        store.standingAgreements(actor, q.portfolioId),
        verifier.portfolioOwners?.(q.portfolioId) ?? Promise.resolve([]),
      ]);
      return NextResponse.json(
        {
          ...catalog,
          assignment,
          portfolioOwners: owners,
          standingAgreements: agreements.map((agreement) =>
            standingAgreementView(agreement, catalog.policies, today),
          ),
        },
        { headers },
      );
    }
    if (!q.leaseId) return NextResponse.json(catalog, { headers });
    const [facts, working, workspace, terms] = await Promise.all([
      verifier.lease(q.leaseId),
      getRenewalWorkingRecord(actor, q.leaseId),
      getRenewalWorkspace(actor, q.leaseId),
      readEffectiveRenewalTerms(q.leaseId),
    ]);
    const [resolved, agreements, owners] = await Promise.all([
      store.resolve(actor, facts, terms.complete, workingRenewalTerms(working).rent),
      store.standingAgreements(actor, facts.portfolioId),
      verifier.portfolioOwners?.(facts.portfolioId) ?? Promise.resolve([]),
    ]);
    const prefill = resolved.proposal
      ? policyPrefill({
          proposal: resolved.proposal,
          workingEntry: working?.fields.terms_rent ?? null,
          recordedOwnerRent: workspace
            ? (currentManualOwnerTerms(workspace)?.rent ?? null)
            : null,
        })
      : null;
    const authority = resolved.authority;
    return NextResponse.json(
      {
        ...resolved,
        ...catalog,
        prefill:
          prefill &&
          resolved.standingAgreement &&
          authority.kind === "standing" &&
          authority.covered &&
          authority.agreementId &&
          authority.policyId &&
          authority.policyVersion &&
          authority.basis
            ? {
                ...prefill,
                // R-S250-7: a rent adopted from the rule names the rule version it came from.
                standing: {
                  agreementId: authority.agreementId,
                  name: authority.label ?? resolved.standingAgreement.name,
                  policyId: authority.policyId,
                  policyVersion: authority.policyVersion,
                  basis: authority.basis,
                },
              }
            : prefill,
        // R-S250-3: the active agreements of this lease's owner, by name and rule.
        standingAgreements: agreements
          .map((agreement) => standingAgreementView(agreement, catalog.policies, today))
          .filter((agreement) => agreement.active),
        portfolioOwners: owners,
        workingRevision: working?.revision ?? 0,
        manualRevision: workspace?.revision ?? 0,
        source: {
          portfolioId: facts.portfolioId,
          cycleDate: facts.cycleDate,
          currentRent: facts.currentRent,
          rentSource: facts.rentSource,
        },
      },
      { headers },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("save_pricing_policy"),
      "renewals",
    );
    const input = await parseJsonBody(request, command);
    const { store, verifier } = pricingPolicyDependencies(actor);
    if (input.action === "policy")
      return NextResponse.json(
        {
          policy: await store.savePolicy(
            actor,
            input.policy,
            input.expectedVersion,
            input.operationId,
          ),
        },
        { headers },
      );
    if (input.action === "assignment") {
      const { action, ...assignment } = input;
      void action;
      return NextResponse.json(
        { assignment: await store.assign(actor, assignment, verifier) },
        { headers },
      );
    }
    if (input.action === "pricing_basis") {
      // S250: an Editor applies or removes an existing agreement; the store checks it again.
      assertRenewalRoleAuthority("apply_standing_agreement", actor.role);
      const { action, ...basis } = input;
      void action;
      return NextResponse.json(
        { assignment: await store.applyPricingBasis(actor, basis, verifier) },
        { headers },
      );
    }
    if (input.action === "standing_agreement")
      return NextResponse.json(
        {
          standingAgreement: await store.saveStandingAgreement(
            actor,
            input.agreement,
            input.expectedVersion,
            input.operationId,
            verifier,
          ),
        },
        { headers },
      );
    return NextResponse.json(
      {
        agreement: await store.saveAgreement(
          actor,
          input.agreement,
          input.expectedVersion,
          input.operationId,
          verifier,
        ),
      },
      { headers },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
