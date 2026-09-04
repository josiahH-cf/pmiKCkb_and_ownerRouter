// S108 waiting-on projection: one derivation of what a maintenance ticket is blocked on, shared by
// the queue, the blocker report, and the S109 intake handoff.
//
// It is pure. It reads the app ticket, the RentVine link's recorded provider snapshot, and the
// property preapproval, and it never writes, never calls a provider, and never claims owner approval
// inside RentVine. Absence is never authorization: a missing estimate or a missing preapproval keeps
// the owner decision required.

import type { MaintenanceWorkOrderProviderSnapshot } from "@/lib/firestore/maintenance-work-order-links";
import type { MaintenanceWorkOrderLink } from "@/lib/firestore/maintenance-work-order-links";
import {
  formatPreapprovalAmount,
  isWithinPreapproval,
  type MaintenancePropertyPreapproval,
} from "@/lib/maintenance/property-preapproval";
import type {
  MaintenanceTicketRecord,
  MaintenanceTicketStatus,
} from "@/lib/maintenance/ticket-model";

export const MAINTENANCE_WAITING_ON = [
  "owner_approval",
  "resident",
  "vendor",
  "scheduling",
  "estimate",
  "unit_verification",
  "none",
] as const;

export type MaintenanceWaitingOn = (typeof MAINTENANCE_WAITING_ON)[number];

export const MAINTENANCE_WAITING_ON_LABELS: Record<MaintenanceWaitingOn, string> = {
  owner_approval: "Owner approval",
  resident: "Resident",
  vendor: "Vendor",
  scheduling: "Scheduling",
  estimate: "Estimate",
  unit_verification: "Unit verification",
  none: "Nothing",
};

const NEXT_ACTION: Record<MaintenanceWaitingOn, string> = {
  owner_approval: "Send the owner the approval request from this ticket.",
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
}

function statusBlocker(
  status: MaintenanceTicketStatus,
  ticket: MaintenanceTicketRecord,
): MaintenanceWaitingOn {
  switch (status) {
    case "Waiting on Response":
      return "resident";
    case "Waiting on Vendor":
      return "vendor";
    case "Scheduled":
      return "scheduling";
    default:
      // An open ticket needs a vendor first; once one is chosen the date is what remains.
      return ticket.vendor_id || ticket.assignee_uid ? "scheduling" : "vendor";
  }
}

export function projectMaintenanceWaitingOn(
  input: MaintenanceWaitingOnInput,
): MaintenanceWaitingOnProjection {
  const { ticket, link, preapproval } = input;
  const snapshot = link?.provider_snapshot ?? null;
  const estimate =
    typeof ticket.estimate_amount_cents === "number"
      ? ticket.estimate_amount_cents
      : null;
  const withinPreapproval = isWithinPreapproval(estimate, preapproval);
  const providerApproved = snapshot?.is_owner_approved === "1";
  const base = {
    ticketId: ticket.id,
    withinPreapproval,
    estimateAmountCents: estimate,
    preapprovalAmountCents: preapproval?.amount_cents ?? null,
    providerWorkOrderId: link?.provider_work_order_id ?? null,
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
  if (!ticket.unit) {
    return {
      ...base,
      waitingOn: "unit_verification",
      nextAction: NEXT_ACTION.unit_verification,
      ownerDecisionRequired: !withinPreapproval && !providerApproved,
      ownerDecisionDetail:
        "This ticket has no verified RentVine unit, so its property preapproval cannot be applied.",
    };
  }

  if (!withinPreapproval && !providerApproved) {
    return {
      ...base,
      waitingOn: "owner_approval",
      nextAction: NEXT_ACTION.owner_approval,
      ownerDecisionRequired: true,
      ownerDecisionDetail:
        estimate === null
          ? "The owner decides this one: no estimate amount is recorded yet, so no preapproval can cover it."
          : preapproval
            ? `The estimate is above this property's preapproval of ${formatPreapprovalAmount(preapproval.amount_cents)}.`
            : "This property has no recorded preapproval amount, so the owner decides this one.",
    };
  }

  const ownerDecisionDetail = withinPreapproval
    ? `Owner approval not required (preapproved up to ${formatPreapprovalAmount(preapproval!.amount_cents)}).`
    : "RentVine already records this work order as owner approved.";

  if (providerApproved && estimate === null) {
    return {
      ...base,
      waitingOn: "estimate",
      nextAction: NEXT_ACTION.estimate,
      ownerDecisionRequired: false,
      ownerDecisionDetail,
    };
  }

  const waitingOn = statusBlocker(ticket.status, ticket);
  return {
    ...base,
    waitingOn,
    nextAction: NEXT_ACTION[waitingOn],
    ownerDecisionRequired: false,
    ownerDecisionDetail,
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
