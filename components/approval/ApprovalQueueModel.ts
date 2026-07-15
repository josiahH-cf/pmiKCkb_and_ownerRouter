import { isQueueItemTerminal, queueActionAvailability } from "@/lib/approval/queue";
import type { Role } from "@/lib/auth/roles";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
} from "@/lib/firestore/types";

export type QueueActionMode = "approve" | "assign" | "disable" | "return" | "snooze";
export type BulkActionMode =
  | "approve"
  | "assign"
  | "disable"
  | "execute"
  | "return"
  | "snooze";

export interface QueueDetail {
  activity: ApprovalQueueActivityRecord[];
  item: ApprovalQueueItemRecord;
}

export interface BulkQueueResultItem {
  item?: ApprovalQueueItemRecord;
  item_id: string;
  message: string;
  outcome: "failed" | "skipped" | "updated";
}

export interface BulkQueueResult {
  results: BulkQueueResultItem[];
  summary: {
    failed: number;
    requested: number;
    skipped: number;
    updated: number;
  };
}

export interface QueueFilters {
  assignee_uid: string;
  audience_group: string;
  due_date: string;
  process_run_id: string;
  required_approver_uid: string;
  risk: string;
  status: string;
}

export const emptyFilters: QueueFilters = {
  assignee_uid: "",
  audience_group: "",
  due_date: "",
  process_run_id: "",
  required_approver_uid: "",
  risk: "",
  status: "",
};

export const BULK_ACTION_LIMIT = 50;

export function previewBulkAction(
  currentUser: { role: Role; uid: string },
  selectedItems: ApprovalQueueItemRecord[],
  action: BulkActionMode,
) {
  const knownSkipped = selectedItems.filter(
    (item) => !canClientBulkUpdate(currentUser, item, action),
  ).length;
  const highRiskApprovals =
    action === "approve"
      ? selectedItems.filter((item) => item.risk === "High").length
      : 0;
  const linkedHighRiskApprovals =
    action === "approve"
      ? selectedItems.filter(
          (item) => item.risk === "High" && Boolean(item.action_execution_id),
        ).length
      : 0;

  return {
    highRiskApprovals,
    linkedHighRiskApprovals,
    knownSkipped,
    ready: selectedItems.length - knownSkipped,
  };
}

export function canClientBulkUpdate(
  currentUser: { role: Role; uid: string },
  item: ApprovalQueueItemRecord,
  action: BulkActionMode,
) {
  if (action === "execute" || isQueueItemTerminal(item.status)) {
    return false;
  }

  const availability = queueActionAvailability(currentUser, item);

  switch (action) {
    case "approve":
      return availability.approve;
    case "assign":
      return availability.assign;
    case "disable":
      return availability.disable;
    case "return":
      return availability.returnForRevision;
    case "snooze":
      return availability.snooze;
  }
}

export function requiresBulkReason(action: BulkActionMode) {
  return action === "disable" || action === "return" || action === "snooze";
}

export function validateBulkActionFields(input: {
  action: BulkActionMode;
  assigneeUid: string;
  reason: string;
  requiredApproverUid: string;
  snoozeUntil: string;
}) {
  if (
    input.action === "assign" &&
    !input.assigneeUid.trim() &&
    !input.requiredApproverUid.trim()
  ) {
    return "Assign requires an assignee or required approver.";
  }

  if (input.action === "snooze" && (!input.snoozeUntil || !input.reason.trim())) {
    return "Snooze requires a date and reason.";
  }

  if ((input.action === "disable" || input.action === "return") && !input.reason.trim()) {
    return input.action === "return"
      ? "Return for Revision requires a reason."
      : "Disable Action requires a reason.";
  }

  return null;
}

export function filterQuery(filters: QueueFilters) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    const trimmed = value.trim();

    if (trimmed) {
      params.set(key, trimmed);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function hasActiveFilters(filters: QueueFilters) {
  return Object.values(filters).some((value) => value.trim().length > 0);
}

export function replaceItem(
  items: ApprovalQueueItemRecord[],
  replacement: ApprovalQueueItemRecord,
) {
  return items.map((item) => (item.id === replacement.id ? replacement : item));
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(readApiError(payload));
  }

  return payload as T;
}

export function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Approval Queue request failed.";
}

function readApiError(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.trim().length > 0
  ) {
    return payload.error;
  }

  return "Approval Queue request failed.";
}

export function displayValue(value: string | undefined) {
  return value?.trim() || "Not set";
}

const APPROVAL_QUEUE_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "America/Chicago",
  timeZoneName: "short",
  year: "numeric",
});

export function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return APPROVAL_QUEUE_DATE_TIME_FORMATTER.format(date);
}

export function activityLabel(action: ApprovalQueueActivityRecord["action"]) {
  const labels: Record<ApprovalQueueActivityRecord["action"], string> = {
    approved: "Approved",
    assigned: "Assigned",
    blocked: "Blocked",
    closed: "Closed",
    comment: "Comment",
    created: "Created",
    disabled: "Disabled",
    refreshed: "Refreshed",
    returned: "Returned",
    skipped: "Skipped",
    snoozed: "Snoozed",
    unblocked: "Unblocked",
    unsnoozed: "Unsnoozed",
  };

  return labels[action];
}
