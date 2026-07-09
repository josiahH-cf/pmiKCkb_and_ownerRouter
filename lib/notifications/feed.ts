// Pure notification feed builder (console overhaul Slice 3b). Merges the per-user approval-queue and
// maintenance-ticket notifications into one unified, newest-first feed, drops muted families, and
// returns the per-family views for the menu. Pure and client-safe: it accepts already-fetched records
// and imports the record shapes with `import type` only, so no firebase-admin module reaches a client
// bundle.

import type { ApprovalQueueNotificationRecord } from "@/lib/firestore/types";
import type { MaintenanceTicketNotificationRecord } from "@/lib/firestore/maintenance-ticket-notifications";
import {
  buildFamilyViews,
  type NotificationFamilyKey,
  type NotificationFamilyView,
  type UnifiedNotification,
} from "@/lib/notifications/families";

export interface BuildNotificationFeedInput {
  approval: readonly ApprovalQueueNotificationRecord[];
  maintenance: readonly MaintenanceTicketNotificationRecord[];
  mutedFamilies?: readonly NotificationFamilyKey[];
  limit?: number;
}

export interface NotificationFeed {
  notifications: UnifiedNotification[];
  families: NotificationFamilyView[];
}

export function buildNotificationFeed(
  input: BuildNotificationFeedInput,
): NotificationFeed {
  const muted = new Set(input.mutedFamilies ?? []);
  const limit = input.limit ?? 25;

  const notifications = [
    ...input.approval.map(toUnifiedFromApproval),
    ...input.maintenance.map(toUnifiedFromMaintenance),
  ]
    .filter((notification) => !muted.has(notification.family))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit);

  return {
    notifications,
    families: buildFamilyViews([...muted]),
  };
}

function toUnifiedFromApproval(
  record: ApprovalQueueNotificationRecord,
): UnifiedNotification {
  return {
    id: record.id,
    source: "approval_queue",
    family: "approval_queue",
    title: record.title,
    message: record.message,
    href: `/approval-queue?item_id=${encodeURIComponent(record.item_id)}`,
    created_at: record.created_at,
    ...(record.read_at ? { read_at: record.read_at } : {}),
  };
}

function toUnifiedFromMaintenance(
  record: MaintenanceTicketNotificationRecord,
): UnifiedNotification {
  return {
    id: record.id,
    source: "maintenance_ticket",
    family: "maintenance_tickets",
    title: record.title,
    message: record.message,
    href: record.href,
    created_at: record.created_at,
    ...(record.read_at ? { read_at: record.read_at } : {}),
  };
}
