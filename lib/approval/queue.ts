import type { Role } from "@/lib/auth/roles";
import type {
  ApprovalQueueItemRecord,
  QueueAudienceGroup,
  QueueItemStatus,
  QueueRiskLevel,
} from "@/lib/firestore/types";

export const QUEUE_ITEM_STATUSES = [
  "Ready for Approval",
  "Blocked",
  "Snoozed",
  "Returned",
  "Approved",
  "Completed",
  "Cancelled",
  "Disabled",
  "Failed",
  "Closed",
] as const satisfies readonly QueueItemStatus[];

export const QUEUE_RISK_LEVELS = [
  "Low",
  "Medium",
  "High",
  "Blocked",
] as const satisfies readonly QueueRiskLevel[];

export const QUEUE_AUDIENCE_GROUPS = [
  "Dan/Admin decisions",
  "Team follow-up",
  "Outside waiting",
  "Failed/Blocked automation",
] as const satisfies readonly QueueAudienceGroup[];

export const QUEUE_TERMINAL_STATUSES = [
  "Approved",
  "Completed",
  "Cancelled",
  "Disabled",
  "Closed",
] as const satisfies readonly QueueItemStatus[];

const terminalStatuses = new Set<QueueItemStatus>(QUEUE_TERMINAL_STATUSES);

export interface ApprovalQueueActor {
  role: Role;
  uid: string;
}

export interface ApprovalQueueActionAvailability {
  approve: boolean;
  approveReason?: string;
  assign: boolean;
  disable: boolean;
  returnForRevision: boolean;
  snooze: boolean;
}

export function isQueueItemTerminal(status: QueueItemStatus) {
  return terminalStatuses.has(status);
}

export function canViewApprovalQueueItem(
  actor: ApprovalQueueActor,
  item: Pick<ApprovalQueueItemRecord, "assignee_uid" | "required_approver_uid">,
) {
  return (
    actor.role === "Admin" ||
    item.assignee_uid === actor.uid ||
    item.required_approver_uid === actor.uid
  );
}

export function queueActionAvailability(
  actor: ApprovalQueueActor,
  item: Pick<
    ApprovalQueueItemRecord,
    "assignee_uid" | "required_approver_uid" | "status"
  >,
): ApprovalQueueActionAvailability {
  const terminal = isQueueItemTerminal(item.status);
  const canApproveByRole = actor.role === "Approver" || actor.role === "Admin";
  const isAdmin = actor.role === "Admin";
  const isRequiredApprover = item.required_approver_uid === actor.uid;
  const isOwnAssignedItem = item.assignee_uid === actor.uid;

  if (terminal) {
    return {
      approve: false,
      approveReason: "This queue item is already closed.",
      assign: false,
      disable: false,
      returnForRevision: false,
      snooze: false,
    };
  }

  let approveReason: string | undefined;
  let approve = canApproveByRole;

  if (item.status !== "Ready for Approval") {
    approve = false;
    approveReason = "Only Ready for Approval items can be approved.";
  } else if (!canApproveByRole) {
    approveReason = "Approver or Admin role is required.";
  } else if (!isAdmin && isOwnAssignedItem) {
    approve = false;
    approveReason = "You cannot approve your own assigned item.";
  } else if (!isAdmin && !isRequiredApprover) {
    approve = false;
    approveReason = "Only the required approver or an Admin can approve.";
  }

  return {
    approve,
    approveReason,
    assign: isAdmin,
    disable: isAdmin,
    returnForRevision: true,
    snooze: true,
  };
}

export function isQueueStatus(value: string): value is QueueItemStatus {
  return (QUEUE_ITEM_STATUSES as readonly string[]).includes(value);
}

export function isQueueRisk(value: string): value is QueueRiskLevel {
  return (QUEUE_RISK_LEVELS as readonly string[]).includes(value);
}

export function isQueueAudienceGroup(value: string): value is QueueAudienceGroup {
  return (QUEUE_AUDIENCE_GROUPS as readonly string[]).includes(value);
}
