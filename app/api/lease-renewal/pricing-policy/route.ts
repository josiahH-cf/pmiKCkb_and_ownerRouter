import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { PricingAssignmentInputSchema } from "@/lib/firestore/renewal-pricing-policies";
import {
  RenewalPricingPolicyInputSchema,
  StandingOwnerAgreementInputSchema,
  policyPrefill,
} from "@/lib/lease-renewal/renewal-pricing-policy";
import { pricingPolicyDependencies } from "@/lib/lease-renewal/pricing-policy-dependencies";
import { getRenewalWorkingRecord } from "@/lib/firestore/renewal-working-record";
import { readEffectiveRenewalTerms } from "@/lib/firestore/renewal-effective-terms";
import { getRenewalWorkspace } from "@/lib/firestore/renewal-workspace";
import { currentManualOwnerTerms } from "@/lib/lease-renewal/workspace-state";
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
]);
const headers = { "Cache-Control": "private, no-store" };
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
      })
      .strict()
      .refine((q) => !(q.leaseId && q.portfolioId), "Choose one source scope.")
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const { store, verifier } = pricingPolicyDependencies(actor);
    const catalog = await store.list(actor, q.after ?? null);
    if (q.portfolioId) {
      if (!(await verifier.portfolio(q.portfolioId)))
        throw new EditableLayerError(
          "The portfolio membership could not be verified.",
          409,
        );
      return NextResponse.json(
        {
          ...catalog,
          assignment: await store.assignment(actor, "portfolio", q.portfolioId),
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
    const resolved = await store.resolve(actor, facts, terms.complete);
    const prefill = resolved.proposal
      ? policyPrefill({
          proposal: resolved.proposal,
          workingEntry: working?.fields.terms_rent ?? null,
          recordedOwnerRent: workspace
            ? (currentManualOwnerTerms(workspace)?.rent ?? null)
            : null,
        })
      : null;
    return NextResponse.json(
      {
        ...resolved,
        ...catalog,
        prefill,
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
