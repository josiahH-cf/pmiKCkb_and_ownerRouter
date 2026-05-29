import type { AuthenticatedUser } from "@/lib/auth/session";
import type { PlaceholderRecord, SopRecord, TemplateRecord } from "@/lib/firestore/types";
import {
  notifyApprovalQueueChange,
  type ApprovalNotificationItem,
} from "@/lib/notifications/approval";
import { launchSpaces } from "@/lib/spaces";

export async function notifySopQueueChange(
  actor: AuthenticatedUser,
  record: Pick<SopRecord, "id" | "space_id" | "status" | "title">,
  previousStatus?: string,
) {
  const event = eventForReviewableStatus(record.status, previousStatus);

  if (!event) {
    return;
  }

  await notifyApprovalQueueChange(actor, {
    entityId: record.id,
    entityType: "sop",
    event,
    spaceId: record.space_id,
    spaceName: spaceNameFor(record.space_id),
    status: record.status,
    title: record.title,
  });
}

export async function notifyTemplateQueueChange(
  actor: AuthenticatedUser,
  record: Pick<TemplateRecord, "id" | "name" | "space_id" | "status">,
  previousStatus?: string,
) {
  const event = eventForReviewableStatus(record.status, previousStatus);

  if (!event) {
    return;
  }

  await notifyApprovalQueueChange(actor, {
    entityId: record.id,
    entityType: "template",
    event,
    spaceId: record.space_id,
    spaceName: spaceNameFor(record.space_id),
    status: record.status,
    title: record.name,
  });
}

export async function notifyPlaceholderQueueChange(
  actor: AuthenticatedUser,
  record: Pick<PlaceholderRecord, "id" | "missing_detail" | "space_id" | "status">,
  previousStatus?: string,
) {
  const event = eventForPlaceholderStatus(record.status, previousStatus);

  if (!event) {
    return;
  }

  await notifyApprovalQueueChange(actor, {
    entityId: record.id,
    entityType: "placeholder",
    event,
    spaceId: record.space_id,
    spaceName: spaceNameFor(record.space_id),
    status: record.status,
    title: record.missing_detail,
  });
}

function eventForReviewableStatus(
  status: string,
  previousStatus?: string,
): ApprovalNotificationItem["event"] | null {
  if (status === "In Review" && previousStatus !== "In Review") {
    return "entered_queue";
  }

  if (status === "Approved" && previousStatus !== "Approved") {
    return "approved";
  }

  if (status === "Draft" && previousStatus === "In Review") {
    return "returned";
  }

  return null;
}

function eventForPlaceholderStatus(
  status: string,
  previousStatus?: string,
): ApprovalNotificationItem["event"] | null {
  if ((status === "Open" || status === "In Review") && previousStatus !== status) {
    return "entered_queue";
  }

  if (status === "Resolved" && previousStatus !== "Resolved") {
    return "resolved";
  }

  return null;
}

function spaceNameFor(spaceId: string) {
  return launchSpaces.find((space) => space.id === spaceId)?.name ?? spaceId;
}
