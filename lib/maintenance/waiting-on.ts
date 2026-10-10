// S108 waiting-on projection: one derivation of what a maintenance ticket is blocked on, shared by
// the queue, the blocker report, and the S109 intake handoff.
//
// It is pure. It reads the app ticket, the RentVine link's recorded provider snapshot, and the
// property preapproval, and it never writes, never calls a provider, and never claims owner approval
// inside RentVine. Absence is never authorization: a missing estimate or a missing preapproval keeps
// the owner decision required.

import {
  maintenanceStage,
  hasCurrentRecordedOwnerDecision,
  MaintenanceAssessmentSchema,
} from "@/lib/maintenance/lifecycle";
import { maintenancePropertyIdentity } from "@/lib/maintenance/property-identity";
import type { MaintenanceWorkOrderProviderSnapshot } from "@/lib/firestore/maintenance-work-order-links";
import type { MaintenanceWorkOrderLink } from "@/lib/firestore/maintenance-work-order-links";
import {
  evaluateMaintenanceStandingPolicy,
  formatPreapprovalAmount,
  type MaintenancePropertyPreapproval,
} from "@/lib/maintenance/property-preapproval";
import type {
  MaintenanceTicketRecord,
  MaintenanceTicketStatus,
} from "@/lib/maintenance/ticket-model";

export const MAINTENANCE_WAITING_ON = [
  "assessment",
  "pmi_review",
  "work_progress",
  "owner_approval",
  "authority_verification",
  "resident",
  "vendor",
  "scheduling",
  "estimate",
  "unit_verification",
  "none",
] as const;

export type MaintenanceWaitingOn = (typeof MAINTENANCE_WAITING_ON)[number];

export const MAINTENANCE_WAITING_ON_LABELS: Record<MaintenanceWaitingOn, string> = {
  assessment: "Assessment",
  pmi_review: "PMI review",
  work_progress: "Work progress",
  owner_approval: "Owner approval",
  authority_verification: "Verify standing authority",
  resident: "Resident",
  vendor: "Vendor",
  scheduling: "Scheduling",
  estimate: "Estimate",
  unit_verification: "Unit verification",
  none: "Nothing",
};

const NEXT_ACTION: Record<MaintenanceWaitingOn, string> = {
  assessment:
    "Assess the reported issue and troubleshooting evidence before deciding on work.",
  pmi_review: "PMI reviews the retained evidence and closes or returns this case.",
  work_progress:
    "Record meaningful progress or submit the completed work for PMI review.",
  owner_approval:
    "Review the current scope, cost basis and applicable owner decision; communicate if needed.",
  authority_verification:
    "Verify the current owner and standing policy when preparing this work.",
  resident: "Follow up with the resident on this ticket.",
  vendor: "Assign the vendor who will do this work.",
  scheduling: "Set the date with the resident and the vendor.",
  estimate: "Record the exact estimate amount on this ticket.",
  unit_verification: "Verify the RentVine unit for this ticket.",
  none: "Nothing is waiting on this ticket.",
};

export interface MaintenanceWaitingOnInput {
  readonly ticket: MaintenanceTicketRecord;
  readonly link: MaintenanceWorkOrderLink | null;
  readonly preapproval: MaintenancePropertyPreapproval | null;
  readonly verifiedOwnerRefs?: readonly string[];
  readonly at?: Date | string | number;
}

export interface MaintenanceWaitingOnProjection {
  readonly ticketId: string;
  readonly waitingOn: MaintenanceWaitingOn;
  readonly nextAction: string;
  /** True while the owner still has to decide; a preapproved or provider-approved job is false. */
  readonly ownerDecisionRequired: boolean;
  readonly withinPreapproval: boolean;
  /** Plain-language reason the owner decision is or is not required. */
  readonly ownerDecisionDetail: string;
  readonly estimateAmountCents: number | null;
  readonly preapprovalAmountCents: number | null;
  readonly providerWorkOrderId: string | null;
  /** S109 handoff: the report still needs the photos the intake asked for. */
  readonly photosNeeded: boolean;
}

export function projectMaintenanceWaitingOn(
  input: MaintenanceWaitingOnInput,
): MaintenanceWaitingOnProjection {
  const { ticket, link, preapproval } = input;

  const estimate =
    typeof ticket.estimate_amount_cents === "number"
      ? ticket.estimate_amount_cents
      : null;
  const standingPolicy = evaluateMaintenanceStandingPolicy(
    ticket,
    preapproval,
    input.at,
    input.verifiedOwnerRefs,
  );
  const withinPreapproval = standingPolicy.authorized;
  const base = {
    ticketId: ticket.id,
    withinPreapproval,
    estimateAmountCents: estimate,
    preapprovalAmountCents: preapproval?.amount_cents ?? null,
    providerWorkOrderId: link?.provider_work_order_id ?? null,
    photosNeeded: ticket.photos_needed === true,
  };

  if (ticket.status === "Closed") {
    return {
      ...base,
      waitingOn: "none",
      nextAction: NEXT_ACTION.none,
      ownerDecisionRequired: false,
      ownerDecisionDetail: "This ticket is closed.",
    };
  }
  if (maintenancePropertyIdentity(ticket, link).status === "conflict")
    return {
      ...base,
      withinPreapproval: false,
      waitingOn: "unit_verification",
      nextAction: "Resolve the conflicting property evidence for this ticket.",
      ownerDecisionRequired: true,
      ownerDecisionDetail:
        "The ticket and work order identify different properties, so neither approval can be applied.",
    };
  if (!ticket.unit) {
    return {
      ...base,
      waitingOn: "unit_verification",
      nextAction: NEXT_ACTION.unit_verification,
      ownerDecisionRequired: false,
      ownerDecisionDetail:
        "This ticket has no verified RentVine unit, so its property preapproval cannot be applied.",
    };
  }

  const stage = maintenanceStage(ticket);
  const parsedAssessment = MaintenanceAssessmentSchema.safeParse(ticket.assessment);
  const assessment = parsedAssessment.success ? parsedAssessment.data : null;
  const noSpending = { ...base, withinPreapproval: false, ownerDecisionRequired: false };
  if (stage === "assessment" || !assessment)
    return {
      ...noSpending,
      waitingOn: "assessment",
      nextAction: NEXT_ACTION.assessment,
      ownerDecisionDetail:
        "No spending decision is evaluated until the issue and proposed work are assessed. An owner email is optional.",
    };
  if (stage === "resolved_troubleshooting" || stage === "completion_review")
    return {
      ...noSpending,
      waitingOn: "pmi_review",
      nextAction: NEXT_ACTION.pmi_review,
      ownerDecisionDetail:
        stage === "resolved_troubleshooting"
          ? "Troubleshooting is reported resolved; PMI still makes the final closeout decision."
          : "Reported completion is evidence for PMI review; it is not final closure or verified payment.",
    };
  if (stage === "needs_information")
    return {
      ...noSpending,
      waitingOn: "resident",
      nextAction: ticket.photos_needed
        ? "Obtain the requested photos and missing information identified in the assessment."
        : "Obtain the missing information identified in the assessment.",
      ownerDecisionDetail:
        "The work is not yet sized. No owner message is required to collect information.",
    };
  if (
    stage === "estimate_needed" ||
    (assessment.outcome === "work_required" && estimate === null)
  )
    return {
      ...noSpending,
      waitingOn: "estimate",
      nextAction: NEXT_ACTION.estimate,
      ownerDecisionDetail:
        "Obtain the current assessed work's estimate before evaluating spending authorization.",
    };
  if (hasCurrentRecordedOwnerDecision(ticket) || withinPreapproval) {
    const waitingOn =
      stage === "in_progress"
        ? "work_progress"
        : stage === "scheduled"
          ? "scheduling"
          : "vendor";
    return {
      ...base,
      waitingOn,
      nextAction: NEXT_ACTION[waitingOn],
      ownerDecisionRequired: false,
      ownerDecisionDetail: withinPreapproval
        ? `The assessed work and recorded cost basis are within the current scoped standing policy of ${formatPreapprovalAmount(preapproval!.amount_cents)} (${preapproval!.policy_terms!.comparison}). No owner email is required; provider approval and payment remain separate.`
        : "Staff recorded an actual owner decision for this exact assessment and total estimate. It is not provider approval or payment.",
    };
  }
  if (
    input.verifiedOwnerRefs === undefined &&
    standingPolicy.state === "owner_relation_unverified"
  )
    return {
      ...base,
      withinPreapproval: false,
      waitingOn: "authority_verification",
      nextAction: NEXT_ACTION.authority_verification,
      ownerDecisionRequired: false,
      ownerDecisionDetail:
        "The recorded scope and cost fit the standing policy, but this worklist has not checked the current owner. Preparing or advancing the work verifies that relationship before applying authority; a new owner decision is not yet established as necessary.",
    };
  // A newly assessed scope must not inherit an older provider approval or an unqualified imported limit.
  if (assessment.outcome === "work_required")
    return {
      ...base,
      withinPreapproval: false,
      waitingOn: "owner_approval",
      nextAction: NEXT_ACTION.owner_approval,
      ownerDecisionRequired: true,
      ownerDecisionDetail:
        "Review a current scoped standing policy or record the actual owner's decision for this assessed scope and cost basis. Legacy imported limits and old provider approval alone do not establish that authority.",
    };

  return {
    ...noSpending,
    waitingOn: "assessment",
    nextAction: NEXT_ACTION.assessment,
    ownerDecisionDetail:
      "The current assessment is incomplete; review the reported facts before deciding on work.",
  };
}

export interface MaintenanceProviderStatusConflict {
  readonly differs: boolean;
  readonly appStatus: MaintenanceTicketStatus;
  readonly providerStatus: string | null;
  readonly readAtIso: string | null;
  readonly nextAction: string;
}

/**
 * Compare the app status with the last recorded RentVine status. It reports the difference and the
 * exact next action; neither side is overwritten and nothing is reconciled here.
 */
export function describeProviderStatusConflict(input: {
  readonly appStatus: MaintenanceTicketStatus;
  readonly snapshot: MaintenanceWorkOrderProviderSnapshot | null;
}): MaintenanceProviderStatusConflict {
  const providerStatus = input.snapshot?.status_label?.trim() || null;
  const differs =
    providerStatus !== null &&
    providerStatus.toLowerCase() !== input.appStatus.toLowerCase();
  return {
    differs,
    appStatus: input.appStatus,
    providerStatus,
    readAtIso: input.snapshot?.read_at_iso ?? null,
    nextAction: differs
      ? "Differs from RentVine. Decide which one is right, then update the app status here or the work-order status through the RentVine status action."
      : "The app status matches the last RentVine read.",
  };
}
