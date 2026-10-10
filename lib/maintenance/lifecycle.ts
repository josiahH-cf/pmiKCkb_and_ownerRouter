import {
  evaluateMaintenanceStandingPolicy,
  type MaintenancePropertyPreapproval,
} from "./property-preapproval";
// One app-owned maintenance lifecycle. Provider status and financial settlement remain separate.
import { z } from "zod";
import {
  businessDateIso,
  BUSINESS_TIME_ZONE,
} from "@/lib/lease-renewal/business-calendar";
import type { MaintenanceTicketRecord, MaintenanceTicketStatus } from "./ticket-model";
export const MAINTENANCE_STAGES = [
  "assessment",
  "needs_information",
  "estimate_needed",
  "owner_decision",
  "vendor_coordination",
  "scheduled",
  "in_progress",
  "completion_review",
  "resolved_troubleshooting",
  "closed",
  "cancelled",
] as const;
export const MaintenanceStageSchema = z.enum(MAINTENANCE_STAGES);
export type MaintenanceStage = z.infer<typeof MaintenanceStageSchema>;
export const MAINTENANCE_STAGE_LABELS: Record<MaintenanceStage, string> = {
  assessment: "Assess issue",
  needs_information: "Awaiting information",
  estimate_needed: "Estimate needed",
  owner_decision: "Owner decision",
  vendor_coordination: "Coordinate vendor",
  scheduled: "Scheduled",
  in_progress: "Work in progress",
  completion_review: "PMI completion review",
  resolved_troubleshooting: "Resolved by troubleshooting — PMI closeout",
  closed: "Closed",
  cancelled: "Cancelled",
};
export const MaintenanceAssessmentInputSchema = z
  .object({
    outcome: z.enum([
      "resolved_troubleshooting",
      "needs_information",
      "estimate_needed",
      "work_required",
    ]),
    scope: z.string().trim().min(1).max(4000),
    evidence_refs: z.array(z.string().trim().min(1).max(1000)).max(30).default([]),
  })
  .strict();
export type MaintenanceAssessmentInput = z.infer<typeof MaintenanceAssessmentInputSchema>;
export interface MaintenanceAssessment extends MaintenanceAssessmentInput {
  version: number;
  recorded_at: string;
  recorded_by_uid: string;
}
export const MAINTENANCE_STAGE_TRANSITIONS: Record<
  MaintenanceStage,
  readonly MaintenanceStage[]
> = {
  assessment: ["cancelled"],
  needs_information: ["assessment", "estimate_needed", "cancelled"],
  estimate_needed: ["assessment", "owner_decision", "cancelled"],
  owner_decision: ["assessment", "estimate_needed", "vendor_coordination", "cancelled"],
  vendor_coordination: [
    "assessment",
    "owner_decision",
    "scheduled",
    "in_progress",
    "cancelled",
  ],
  scheduled: ["assessment", "vendor_coordination", "in_progress", "cancelled"],
  in_progress: ["assessment", "vendor_coordination", "completion_review", "cancelled"],
  completion_review: ["assessment", "in_progress", "closed", "cancelled"],
  resolved_troubleshooting: ["assessment", "closed", "cancelled"],
  closed: ["assessment"],
  cancelled: ["assessment"],
};
export function maintenanceStage(ticket: MaintenanceTicketRecord): MaintenanceStage {
  const parsed = MaintenanceStageSchema.safeParse(ticket.workflow_stage);
  return parsed.success
    ? parsed.data
    : ticket.status === "Closed"
      ? "closed"
      : "assessment";
}
export function assessmentStage(
  outcome: MaintenanceAssessmentInput["outcome"],
): MaintenanceStage {
  return outcome === "work_required" ? "owner_decision" : outcome;
}
export function maintenanceStatusForStage(
  stage: MaintenanceStage,
): MaintenanceTicketStatus {
  switch (stage) {
    case "closed":
    case "cancelled":
      return "Closed";
    case "needs_information":
    case "owner_decision":
      return "Waiting on Response";
    case "estimate_needed":
    case "vendor_coordination":
      return "Waiting on Vendor";
    case "scheduled":
    case "in_progress":
    case "completion_review":
      return "Scheduled";
    default:
      return "Open";
  }
}
export function maintenanceWorkScope(ticket: MaintenanceTicketRecord): string {
  return JSON.stringify([
    ticket.summary,
    ticket.description,
    ticket.assessment?.version ?? null,
    ticket.assessment?.scope ?? null,
    ticket.estimate_amount_cents ?? null,
    ticket.estimate_cost_basis ?? null,
    ticket.unit?.unitId ?? null,
    ticket.property_id ?? null,
  ]);
}
export function hasCurrentRecordedOwnerDecision(
  ticket: MaintenanceTicketRecord,
): boolean {
  return (
    ticket.status !== "Closed" &&
    ticket.assessment?.outcome === "work_required" &&
    ticket.estimate_cost_basis === "total_including_tax_and_markup" &&
    ticket.owner_decision?.decision === "approved" &&
    ticket.owner_decision.work_scope === maintenanceWorkScope(ticket) &&
    ticket.owner_decision.cost_basis === "total_including_tax_and_markup"
  );
}
export function maintenanceAging(
  ticket: MaintenanceTicketRecord,
  at: Date | string | number = Date.now(),
) {
  const day = (v: Date | string | number) =>
      Date.parse(businessDateIso(v) + "T00:00:00Z") / 86400000,
    createdDays = Math.max(0, day(at) - day(ticket.created_at)),
    progressAt = ticket.meaningful_progress_at ?? ticket.created_at,
    progressDays = Math.max(0, day(at) - day(progressAt));
  return {
    createdDays,
    progressDays,
    progressAt,
    aging: ticket.status !== "Closed" && createdDays >= 3,
    timeZone: BUSINESS_TIME_ZONE,
    progressKnown: !!ticket.meaningful_progress_at,
  };
}

export const MaintenanceAssessmentSchema = MaintenanceAssessmentInputSchema.extend({
  version: z.number().int().positive(),
  recorded_at: z.string().datetime(),
  recorded_by_uid: z.string().min(1).max(200),
});
export function maintenanceWorkAuthorized(
  ticket: MaintenanceTicketRecord,
  preapproval?: MaintenancePropertyPreapproval | null,
  verifiedOwnerRefs: readonly string[] = [],
  at: Date | string | number = Date.now(),
) {
  const assessment = MaintenanceAssessmentSchema.safeParse(ticket.assessment);
  if (
    ticket.data_mode !== "live" ||
    ticket.status === "Closed" ||
    !assessment.success ||
    assessment.data.outcome !== "work_required"
  )
    return false;
  return (
    hasCurrentRecordedOwnerDecision(ticket) ||
    evaluateMaintenanceStandingPolicy(ticket, preapproval, at, verifiedOwnerRefs)
      .authorized
  );
}
