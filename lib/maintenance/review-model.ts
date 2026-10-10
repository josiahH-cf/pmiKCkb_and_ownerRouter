import type { maintenanceResponsibilityContext } from "./responsibility-context";
import type { OperatingPolicySelection } from "./operating-policy";
import type { MaintenanceTicketRecord } from "./ticket-model";
import { z } from "zod";
export const PolicyBindingSchema = z
  .object({
    id: z
      .string()
      .regex(/^(?:emergency|chargeback)_(?:organization|property_[1-9][0-9]{0,9})$/)
      .nullable(),
    version: z.number().int().positive().nullable(),
  })
  .strict()
  .refine(
    (v) => (v.id === null) === (v.version === null),
    "Keep the exact policy identifier and version together.",
  );
export const UrgencyReviewSchema = z
  .object({
    facts: z
      .object({
        summary: z.string().trim().min(1).max(1000),
        description: z.string().trim().max(8000),
        happeningNow: z.boolean().nullable(),
        damageOrAccess: z.string().trim().max(1000),
      })
      .strict(),
    expectedPolicy: PolicyBindingSchema,
    reason: z.string().trim().min(1).max(4000),
    evidenceRefs: z.array(z.string().trim().min(1).max(2000)).min(1).max(20),
    reviewedActualFacts: z.literal(true),
  })
  .strict();
export const ResponsibilityReviewSchema = z
  .object({
    state: z.enum(["pending_assessment", "needs_review", "reviewed", "disputed"]),
    expectedPolicy: PolicyBindingSchema,
    expectedAssessmentVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(4000),
    evidenceRefs: z.array(z.string().trim().min(1).max(2000)).max(30),
    leaseEvidenceRefs: z.array(z.string().trim().min(1).max(2000)).max(20),
    allocations: z
      .array(
        z
          .object({
            party: z.enum(["resident", "owner", "vendor", "pmi"]),
            identityRef: z.string().trim().min(1).max(160).nullable(),
            basisPoints: z.number().int().min(1).max(10000),
            evidenceRef: z.string().trim().min(1).max(2000),
          })
          .strict(),
      )
      .max(10),
    proposedAmountCents: z.number().int().nonnegative().max(10000000000).nullable(),
    amountBasis: z.string().trim().max(2000),
    residentConcern: z.string().trim().max(4000),
    reviewedByStaff: z.literal(true),
  })
  .strict()
  .superRefine((v, c) => {
    const bad = (message: string) => c.addIssue({ code: "custom", message });
    if (v.state === "reviewed") {
      if (
        !v.allocations.length ||
        v.allocations.reduce((sum, a) => sum + a.basisPoints, 0) !== 10000
      )
        bad(
          "A reviewed allocation must account for exactly 100% of responsibility with actual evidence.",
        );
      if (!v.evidenceRefs.length || !v.expectedPolicy.id)
        bad(
          "A responsibility assertion requires applicable approved policy and reviewed actual evidence.",
        );
      if (v.proposedAmountCents !== null && !v.amountBasis)
        bad("Record the actual amount basis, or leave the amount unknown.");
    } else if (v.allocations.length || v.proposedAmountCents !== null)
      bad(
        "Pending or disputed review cannot assert a current allocation or amount. Prior decisions remain in history.",
      );
    if (
      new Set(v.allocations.map((a) => [a.party, a.identityRef].join(":"))).size !==
      v.allocations.length
    )
      bad("Each actual party can appear only once in the allocation.");
  });
export type UrgencyReviewInput = z.infer<typeof UrgencyReviewSchema>;
export type ResponsibilityReviewInput = z.infer<typeof ResponsibilityReviewSchema>;
export interface ResponsibilityDecision extends ResponsibilityReviewInput {
  version: number;
  recordedAt: string;
  recordedBy: string;
  contextHash: string;
  contextSnapshot?: ReturnType<typeof maintenanceResponsibilityContext>;
  meaning: "staff_recorded_responsibility_and_proposal";
  ledgerPosting: "not_executed";
  paymentVerification: "not_established";
}

export interface MaintenanceReviewContext {
  ticket: MaintenanceTicketRecord;
  emergency: OperatingPolicySelection;
  chargeback: OperatingPolicySelection;
  urgencyNeedsReview: boolean;
  responsibilityNeedsReview: boolean;
  approvedGuidance: string | null;
  guidanceHold: string | null;
}
