import { describe, expect, it } from "vitest";

import type { ApprovalQueueNotificationRecord } from "@/lib/firestore/types";
import type { MaintenanceTicketNotificationRecord } from "@/lib/firestore/maintenance-ticket-notifications";
import { buildNotificationFeed } from "@/lib/notifications/feed";

function approval(
  overrides: Partial<ApprovalQueueNotificationRecord> = {},
): ApprovalQueueNotificationRecord {
  return {
    id: "a-1",
    item_id: "item-1",
    event: "created",
    recipient_uid: "editor-1",
    recipient_role: "Assignee",
    title: "New queue item: Lease Renewal",
    message: "Review the requested approval action.",
    process_run_ref: { id: "run-1", label: "Lease Renewal" },
    status: "Ready for Approval",
    risk: "High",
    direct_link: "/runs/run-1",
    created_at: "2026-07-09T01:00:00.000Z",
    ...overrides,
  };
}

function maintenance(
  overrides: Partial<MaintenanceTicketNotificationRecord> = {},
): MaintenanceTicketNotificationRecord {
  return {
    id: "m-1",
    ticket_id: "t-1",
    event: "assigned",
    recipient_uid: "editor-1",
    title: "Maintenance ticket assigned",
    message: "A maintenance ticket was assigned to you.",
    ticket_status: "Open",
    href: "/maintenance",
    created_at: "2026-07-09T02:00:00.000Z",
    ...overrides,
  };
}

describe("buildNotificationFeed", () => {
  it("merges approval + maintenance newest-first and maps hrefs per source", () => {
    const feed = buildNotificationFeed({
      approval: [approval()],
      maintenance: [maintenance()],
    });

    expect(feed.notifications.map((n) => n.id)).toEqual(["m-1", "a-1"]);
    const approvalUnified = feed.notifications.find(
      (n) => n.source === "approval_queue",
    )!;
    const maintenanceUnified = feed.notifications.find(
      (n) => n.source === "maintenance_ticket",
    )!;
    expect(approvalUnified.href).toBe("/approval-queue?item_id=item-1");
    expect(approvalUnified.family).toBe("approval_queue");
    expect(maintenanceUnified.href).toBe("/maintenance");
    expect(maintenanceUnified.family).toBe("maintenance_tickets");
  });

  it("drops notifications whose family is muted", () => {
    const feed = buildNotificationFeed({
      approval: [approval()],
      maintenance: [maintenance()],
      mutedFamilies: ["maintenance_tickets"],
    });

    expect(feed.notifications.map((n) => n.source)).toEqual(["approval_queue"]);
    const maintenanceFamily = feed.families.find(
      (family) => family.key === "maintenance_tickets",
    )!;
    expect(maintenanceFamily.muted).toBe(true);
  });

  it("respects the limit after sorting", () => {
    const feed = buildNotificationFeed({
      approval: [
        approval({ id: "a-early", created_at: "2026-07-01T00:00:00.000Z" }),
        approval({ id: "a-late", created_at: "2026-07-09T09:00:00.000Z" }),
      ],
      maintenance: [maintenance({ id: "m-mid", created_at: "2026-07-05T00:00:00.000Z" })],
      limit: 2,
    });

    expect(feed.notifications.map((n) => n.id)).toEqual(["a-late", "m-mid"]);
  });

  it("returns all four families, with the two Gmail-dependent ones stubbed", () => {
    const feed = buildNotificationFeed({ approval: [], maintenance: [] });

    expect(feed.families.map((family) => family.key)).toEqual([
      "approval_queue",
      "maintenance_tickets",
      "rentvine_replies",
      "owner_process_replies",
    ]);
    const stubbed = feed.families.filter((family) => !family.available);
    expect(stubbed).toHaveLength(2);
    for (const family of stubbed) {
      expect(family.unavailableReason).toBe("Waiting on Gmail access");
    }
  });
});
