import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ATTENTION_LANES, toAttentionSignal } from "@/lib/attention/lanes";
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
    expect(feed.decisions).toEqual({ count: 0, signals: [] });
  });

  it("keeps the actionable decision backlog distinct from unread event notifications", () => {
    const decision = toAttentionSignal({
      lane: "decision",
      severity: "high",
      label: "Current rent",
      detail: "Synthetic renewal run",
      href: "/lease-renewal/runs/run-1",
      signalKey: "decision:run-1:rent",
    });
    const feed = buildNotificationFeed({
      approval: [],
      maintenance: [],
      decisions: { count: 1, signals: [decision] },
    });

    expect(feed.notifications).toEqual([]);
    expect(feed.decisions).toEqual({ count: 1, signals: [decision] });
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

  // AC-S17-2: the catalog exposes exactly SEVEN families — three new AVAILABLE (connections_setup,
  // space_coverage, team_review) plus the two stubbed Gmail-dependent ones.
  it("returns exactly seven families (three new available, two Gmail-stubbed)", () => {
    const feed = buildNotificationFeed({ approval: [], maintenance: [] });

    expect(feed.families.map((family) => family.key)).toEqual([
      "approval_queue",
      "maintenance_tickets",
      "connections_setup",
      "space_coverage",
      "team_review",
      "rentvine_replies",
      "owner_process_replies",
    ]);
    const stubbed = feed.families.filter((family) => !family.available);
    expect(stubbed.map((f) => f.key)).toEqual([
      "rentvine_replies",
      "owner_process_replies",
    ]);
    for (const family of stubbed) {
      expect(family.unavailableReason).toBe("Waiting on Gmail access");
    }
  });

  // AC-S17-4: every event carries a lane from the closed ATTENTION_LANES enum.
  it("stamps every event notification with a lane from the closed ATTENTION_LANES enum", () => {
    const feed = buildNotificationFeed({
      approval: [approval()],
      maintenance: [maintenance()],
    });
    for (const notification of feed.notifications) {
      expect(ATTENTION_LANES).toContain(notification.lane);
      expect(notification.severity).toBe("medium");
    }
  });

  // AC-S17-2/B2: the standing setup signals (connection + coverage) flow through the feed and the review
  // digest is passed through, so the hub is a true superset of the deck.
  it("carries standing signals and the review digest through to the feed", () => {
    const connectionSignal = toAttentionSignal({
      lane: "connection",
      severity: "medium",
      label: "RentVine",
      detail: "Needs setup",
      href: "/connections#connector-rentvine",
      signalKey: "connection:/connections#connector-rentvine",
    });
    const reviewSignal = toAttentionSignal({
      lane: "review",
      severity: "high",
      label: "Team review",
      detail: "2 high-risk overrides, 1 self-correction this period",
      href: "/approval-queue",
      signalKey: "team_review:digest",
    });
    const feed = buildNotificationFeed({
      approval: [],
      maintenance: [],
      standing: [connectionSignal],
      review: reviewSignal,
    });
    expect(feed.standing).toEqual([connectionSignal]);
    expect(feed.review).toEqual(reviewSignal);
  });

  // AC-S17-5 (feed integration): a digested lane collapses its N event rows to ONE digest row.
  it("collapses a digested lane's rows into one digest row", () => {
    const feed = buildNotificationFeed({
      approval: [
        approval({ id: "a-1", created_at: "2026-07-09T01:00:00.000Z" }),
        approval({
          id: "a-2",
          item_id: "item-2",
          created_at: "2026-07-09T03:00:00.000Z",
        }),
      ],
      maintenance: [maintenance({ id: "m-1", created_at: "2026-07-09T02:00:00.000Z" })],
      preferences: { digest_lanes: ["decision"] },
    });
    // All three events are in the decision lane, so they collapse to exactly one digest row.
    expect(feed.notifications).toHaveLength(1);
    expect(feed.notifications[0].id).toBe("digest:decision");
    expect(feed.notifications[0].title).toContain("3");
  });

  // AC-S17-5 (feed integration): a lane threshold hides a standing signal below it; a snoozed lane is
  // silent until it expires.
  it("applies lane thresholds and snooze to standing signals", () => {
    const connection = toAttentionSignal({
      lane: "connection",
      severity: "medium",
      label: "RentVine",
      detail: "Needs setup",
      href: "/connections#connector-rentvine",
      signalKey: "connection:rentvine",
    });
    const coverage = toAttentionSignal({
      lane: "coverage",
      severity: "medium",
      label: "Owner Email",
      detail: "Needs a process",
      href: "/spaces/owner-email",
      signalKey: "coverage:owner-email",
    });

    const thresholded = buildNotificationFeed({
      approval: [],
      maintenance: [],
      standing: [connection, coverage],
      preferences: { lane_thresholds: { connection: "high" } },
    });
    // connection (medium) is below the "high" threshold and hidden; coverage (medium) survives.
    expect(thresholded.standing.map((s) => s.lane)).toEqual(["coverage"]);

    const snoozed = buildNotificationFeed({
      approval: [],
      maintenance: [],
      standing: [connection, coverage],
      preferences: { snoozed_lanes: { coverage: "2026-07-10T00:00:00.000Z" } },
      now: "2026-07-09T00:00:00.000Z",
    });
    // coverage is snoozed until tomorrow; only connection survives.
    expect(snoozed.standing.map((s) => s.lane)).toEqual(["connection"]);
  });

  // AC-S17-8: the pure feed builder makes ZERO external calls — it imports no RentVine / Sheet / Gmail
  // client. Guarded by a source scan so a future edit that pulls one in trips this test.
  it("imports no RentVine, Sheet, or Gmail client (zero external calls)", () => {
    const raw = readFileSync(
      fileURLToPath(new URL("../../lib/notifications/feed.ts", import.meta.url)),
      "utf8",
    );
    // Strip comments so only CODE (imports) is scanned, not a header comment naming these clients.
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/rentvine/i);
    expect(source).not.toMatch(/google-sheets|googleapis|sheets-read/i);
    expect(source).not.toMatch(/gmail/i);
  });
});
