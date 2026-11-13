// S280 R-S280-5: notifications show staff work. Setup and Space coverage notices go to Admins
// only; the retired maintenance families are neither offered nor emitted, and stored maintenance
// records are untouched. BEH-S280-4 and AC-S280-5 against the served family rule and the one hub
// assembly path, with its I/O readers mocked. Synthetic records only.
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listApprovalQueueNotifications: vi.fn(async () => []),
  listMaintenanceTicketNotifications: vi.fn(async () => []),
  listGmailWorkflowNotifications: vi.fn(async () => [] as unknown[]),
  getNotificationPreferences: vi.fn(async () => ({
    uid: "x",
    muted_families: [],
    lane_thresholds: {},
    snoozed_lanes: {},
    digest_lanes: [],
    email_enabled: false as const,
  })),
  resolveConnectionsState: vi.fn(() => ({
    query: "connections",
    title: "",
    summary: "",
    items: [],
  })),
  resolveCoverageState: vi.fn(async () => ({
    query: "coverage",
    title: "",
    summary: "",
    items: [],
  })),
  listAllLeaseRenewalResolutions: vi.fn(async () => []),
  listAllWritebackApprovals: vi.fn(async () => []),
  listSupportReports: vi.fn(async () => []),
  gatherNeedsDecisionInbox: vi.fn(async () => ({
    rows: [],
    counts: { total: 0, renewalFlags: 0, writebacksAwaiting: 0, queueItems: 0 },
  })),
}));

vi.mock("@/lib/firestore/approval-queue-notifications", () => ({
  listApprovalQueueNotifications: mocks.listApprovalQueueNotifications,
}));
vi.mock("@/lib/firestore/maintenance-ticket-notifications", () => ({
  listMaintenanceTicketNotifications: mocks.listMaintenanceTicketNotifications,
}));
vi.mock("@/lib/gmail-hub/notifications", () => ({
  listGmailWorkflowNotifications: mocks.listGmailWorkflowNotifications,
}));
vi.mock("@/lib/firestore/notification-preferences", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getNotificationPreferences: mocks.getNotificationPreferences,
}));
vi.mock("@/lib/ask/app-state-context", () => ({
  resolveConnectionsState: mocks.resolveConnectionsState,
  resolveCoverageState: mocks.resolveCoverageState,
}));
vi.mock("@/lib/firestore/lease-renewal-resolutions", () => ({
  listAllLeaseRenewalResolutions: mocks.listAllLeaseRenewalResolutions,
}));
vi.mock("@/lib/firestore/lease-renewal-writeback-approvals", () => ({
  listAllWritebackApprovals: mocks.listAllWritebackApprovals,
}));
vi.mock("@/lib/approval/needs-decision-gather", () => ({
  gatherNeedsDecisionInbox: mocks.gatherNeedsDecisionInbox,
}));
vi.mock("@/lib/firestore/support-reports", () => ({
  listSupportReports: mocks.listSupportReports,
}));

import { loadNotificationHub } from "@/lib/notifications/hub";
import {
  NOTIFICATION_FAMILY_KEYS,
  servedNotificationFamilyKeys,
} from "@/lib/notifications/families";

afterEach(() => vi.clearAllMocks());

const base = { email: "staff@pmikcmetro.com", hd: "pmikcmetro.com" };
const editor = { ...base, uid: "editor-1", role: "Editor" as const };
const approver = { ...base, uid: "approver-1", role: "Approver" as const };
const admin = { ...base, uid: "admin-1", role: "Admin" as const };

const STAFF_FAMILIES = ["approval_queue", "renewal_communications"];

describe("S280 BEH-S280-4: the served family set per role", () => {
  it("BEH-S280-4 / AC-S280-5: an Editor and an Approver are offered staff work only; an Admin keeps the setup notices", () => {
    const scope = { canReadRenewals: true, canReadMaintenance: true };
    expect(servedNotificationFamilyKeys({ ...scope, isAdmin: false })).toEqual(
      STAFF_FAMILIES,
    );
    expect(servedNotificationFamilyKeys({ ...scope, isAdmin: true })).toEqual([
      "approval_queue",
      "connections_setup",
      "space_coverage",
      "team_review",
      "renewal_communications",
      "support_reports",
    ]);
    // The catalog is unchanged; only serving changes.
    expect(NOTIFICATION_FAMILY_KEYS).toContain("maintenance_tickets");
  });

  it("AC-S280-5: for Editor, Approver and Admin the hub offers that set and emits no maintenance item", async () => {
    mocks.listGmailWorkflowNotifications.mockResolvedValue([
      {
        id: "gmail:maint-1",
        source: "gmail_workflow",
        family: "maintenance_communications",
        lane: "decision",
        severity: "medium",
        title: "Maintenance communication needs review",
        message: "Value-free attention.",
        href: "/maintenance",
        created_at: "2026-11-12T18:00:00.000Z",
      },
      {
        id: "gmail:renewal-1",
        source: "gmail_workflow",
        family: "renewal_communications",
        lane: "decision",
        severity: "medium",
        title: "Owner replied",
        message: "101 Sample Pl",
        href: "/lease-renewal/live/desk/lease/101?step=ask-owner",
        created_at: "2026-11-12T18:10:00.000Z",
      },
    ]);
    for (const [user, families] of [
      [editor, STAFF_FAMILIES],
      [approver, STAFF_FAMILIES],
    ] as const) {
      const feed = await loadNotificationHub(user, { full: true });
      expect(feed.families.map((family) => family.key)).toEqual(families);
      expect(feed.standing).toEqual([]);
      expect(feed.notifications.map((item) => item.family)).toEqual([
        "renewal_communications",
      ]);
    }
    expect(mocks.resolveCoverageState).not.toHaveBeenCalled();

    const adminFeed = await loadNotificationHub(admin, { full: true });
    expect(adminFeed.families.map((family) => family.key)).toContain("connections_setup");
    expect(adminFeed.families.map((family) => family.key)).toContain("space_coverage");
    expect(adminFeed.families.map((family) => family.key)).not.toContain(
      "maintenance_tickets",
    );
    expect(adminFeed.notifications.map((item) => item.family)).toEqual([
      "renewal_communications",
    ]);
    expect(mocks.resolveCoverageState).toHaveBeenCalledTimes(1);
  });

  it("AC-S280-5: stored maintenance records are never read or changed by serving the feed", async () => {
    await loadNotificationHub(editor, { full: true });
    await loadNotificationHub(admin, { full: true });
    await loadNotificationHub(editor, { full: false, unreadOnly: true });
    expect(mocks.listMaintenanceTicketNotifications).not.toHaveBeenCalled();
  });
});
