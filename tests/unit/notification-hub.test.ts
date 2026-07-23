import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock only the I/O readers hub.ts touches; the pure builders (feed, standing, review digest, decision
// metrics) run for real. app-state-context is mocked so the coverage/connections resolvers return no
// gaps (their own behavior is tested elsewhere) and never reach Firestore here.
const mocks = vi.hoisted(() => ({
  listApprovalQueueNotifications: vi.fn(),
  listMaintenanceTicketNotifications: vi.fn(),
  listGmailWorkflowNotifications: vi.fn(async () => []),
  getNotificationPreferences: vi.fn(),
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
  listAllLeaseRenewalResolutions: vi.fn(),
  listAllWritebackApprovals: vi.fn(),
  listSupportReports: vi.fn(),
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
vi.mock("@/lib/firestore/notification-preferences", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    getNotificationPreferences: mocks.getNotificationPreferences,
  };
});
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
import { gatherSupportAttention } from "@/lib/attention/support-lane";

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};
const editor = {
  ...admin,
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  role: "Editor" as const,
};

function prefs() {
  return {
    uid: "x",
    muted_families: [],
    lane_thresholds: {},
    snoozed_lanes: {},
    digest_lanes: [],
    email_enabled: false as const,
  };
}

afterEach(() => vi.clearAllMocks());

describe("loadNotificationHub — Admin-only review digest (AC-S17-6)", () => {
  function seedReviewData() {
    mocks.listApprovalQueueNotifications.mockResolvedValue([]);
    mocks.listMaintenanceTicketNotifications.mockResolvedValue([]);
    mocks.listGmailWorkflowNotifications.mockResolvedValue([]);
    mocks.getNotificationPreferences.mockResolvedValue(prefs());
    // One High corrected_value override + two returned write-backs → a non-empty digest.
    mocks.listAllLeaseRenewalResolutions.mockResolvedValue([
      { resolution_kind: "corrected_value", severity: "High" },
    ]);
    mocks.listAllWritebackApprovals.mockResolvedValue([
      { state: "Returned for Revision" },
      { state: "Returned for Revision" },
    ]);
    mocks.listSupportReports.mockResolvedValue([]);
  }

  it("serves ONE value-free review digest to an Admin in full mode", async () => {
    seedReviewData();
    const feed = await loadNotificationHub(admin, { full: true });

    expect(feed.review).not.toBeNull();
    expect(feed.review!.lane).toBe("review");
    expect(feed.review!.detail).toBe(
      "1 high-risk override, 2 self-corrections this period",
    );
    expect(Object.keys(feed.review!).sort()).toEqual([
      "detail",
      "href",
      "label",
      "lane",
      "severity",
      "signal_key",
    ]);
    expect(feed.families.map((f) => f.key)).toContain("team_review");
  });

  it("never serves the review digest OR the team_review family to an Editor", async () => {
    seedReviewData();
    const feed = await loadNotificationHub(editor, { full: true });

    expect(feed.review).toBeNull();
    expect(feed.families.map((f) => f.key)).not.toContain("team_review");
    // The Admin-only decision-metrics reads are never issued for a non-Admin.
    expect(mocks.listAllLeaseRenewalResolutions).not.toHaveBeenCalled();
    expect(mocks.listAllWritebackApprovals).not.toHaveBeenCalled();
  });

  it("serves value-free support signals + the support_reports family only to an Admin (AC-S39-1)", async () => {
    seedReviewData();
    mocks.listSupportReports.mockResolvedValue([
      { id: "r1", status: "new", created_at: "2026-07-23T00:00:00.000Z" },
      { id: "r2", status: "acknowledged", created_at: "2026-07-01T00:00:00.000Z" },
    ]);
    const feed = await loadNotificationHub(admin, {
      full: true,
      now: "2026-07-23T12:00:00.000Z",
    });

    expect(feed.support.map((s) => s.signal_key).sort()).toEqual([
      "support:follow_up_due",
      "support:new",
    ]);
    expect(feed.support.every((s) => s.lane === "support")).toBe(true);
    // Value-free: exactly the six whitelisted keys on every support signal.
    for (const signal of feed.support) {
      expect(Object.keys(signal).sort()).toEqual([
        "detail",
        "href",
        "label",
        "lane",
        "severity",
        "signal_key",
      ]);
    }
    expect(feed.families.map((f) => f.key)).toContain("support_reports");
  });

  it("both surfaces read the SAME gather: the hub's follow-up count equals the /admin panel's, byte-for-byte (AC-S39-2)", async () => {
    seedReviewData();
    const reports = [
      { id: "r1", status: "new", created_at: "2026-07-23T00:00:00.000Z" },
      { id: "r2", status: "acknowledged", created_at: "2026-07-01T00:00:00.000Z" }, // follow-up due
      { id: "r3", status: "acknowledged", created_at: "2026-06-01T00:00:00.000Z" }, // follow-up due
    ];
    mocks.listSupportReports.mockResolvedValue(reports);
    const now = "2026-07-23T12:00:00.000Z";

    const feed = await loadNotificationHub(admin, { full: true, now });
    // The /admin panel badge reads this exact gather (app/admin/page.tsx).
    const panelSource = await gatherSupportAttention(admin, { now });

    const hubFollowUp = feed.support.find(
      (s) => s.signal_key === "support:follow_up_due",
    );
    expect(hubFollowUp?.detail).toContain(`${panelSource.followUpDueCount} report`);
    expect(panelSource.followUpDueCount).toBe(2);
  });

  it("honors a muted Feedback family on the hub while the authoritative /admin gather count is unmuted (intended mute layer)", async () => {
    seedReviewData();
    // The Admin muted the Feedback notification family.
    mocks.getNotificationPreferences.mockResolvedValue({
      ...prefs(),
      muted_families: ["support_reports"],
    });
    mocks.listSupportReports.mockResolvedValue([
      { id: "r1", status: "new", created_at: "2026-07-23T00:00:00.000Z" },
    ]);
    const now = "2026-07-23T12:00:00.000Z";

    const feed = await loadNotificationHub(admin, { full: true, now });
    // Muting removes the notification from the hub feed (a notification preference)...
    expect(feed.support).toEqual([]);
    // ...but the /admin triage badge reads the SAME gather UNMUTED, so the operational count stands.
    const panelSource = await gatherSupportAttention(admin, { now });
    expect(panelSource.newCount).toBe(1);
  });

  it("never serves support signals OR the support_reports family to an Editor, and never reads them (AC-S39-8)", async () => {
    seedReviewData();
    mocks.listSupportReports.mockResolvedValue([
      { id: "r1", status: "new", created_at: "2026-07-23T00:00:00.000Z" },
    ]);
    const feed = await loadNotificationHub(editor, { full: true });

    expect(feed.support).toEqual([]);
    expect(feed.families.map((f) => f.key)).not.toContain("support_reports");
    expect(mocks.listSupportReports).not.toHaveBeenCalled();
  });

  it("counts the TRUE unread total across the full set, not a per-source preview cap (LR-01)", async () => {
    // 30 unread approvals for the caller — more than the readers' default 25-row preview cap. The hub must
    // read the sources UNCAPPED for the count, so unreadTotal reflects all 30 while the preview stays small.
    const unread = Array.from({ length: 30 }, (_, index) => ({
      id: `a-${index}`,
      item_id: `item-${index}`,
      title: `Approval ${index}`,
      message: "Review the requested approval action.",
      created_at: `2026-07-09T00:${String(index).padStart(2, "0")}:00.000Z`,
    }));
    mocks.listApprovalQueueNotifications.mockResolvedValue(unread);
    mocks.listMaintenanceTicketNotifications.mockResolvedValue([]);
    mocks.listGmailWorkflowNotifications.mockResolvedValue([]);
    mocks.getNotificationPreferences.mockResolvedValue(prefs());

    const feed = await loadNotificationHub(admin, { unreadOnly: true, limit: 8 });

    // The badge total is the true count (30), decoupled from the 8-row preview list.
    expect(feed.unreadTotal).toBe(30);
    expect(feed.notifications).toHaveLength(8);
    // The fix: the reader is asked for the uncapped set, so nothing truncates the count upstream of
    // buildNotificationFeed (which previously capped it at the reader's 25-row default).
    expect(mocks.listApprovalQueueNotifications).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ limit: Number.MAX_SAFE_INTEGER }),
    );
  });

  it("skips the review digest + standing reads for the lightweight bell (no full)", async () => {
    seedReviewData();
    const feed = await loadNotificationHub(admin, { full: false });

    expect(feed.review).toBeNull();
    expect(feed.standing).toEqual([]);
    // Bell path never issues the coverage / decision-metrics reads.
    expect(mocks.resolveCoverageState).not.toHaveBeenCalled();
    expect(mocks.listAllLeaseRenewalResolutions).not.toHaveBeenCalled();
    expect(mocks.gatherNeedsDecisionInbox).not.toHaveBeenCalled();
  });

  it("carries the same value-free needs-decision backlog even when the event log is empty", async () => {
    seedReviewData();
    mocks.gatherNeedsDecisionInbox.mockResolvedValue({
      rows: [
        {
          kind: "renewal_flag",
          key: "renewal_flag:run-1:rent",
          label: "Current rent",
          detail: "Synthetic renewal run",
          severity: "High",
          href: "/lease-renewal/runs/run-1",
          proposed_value: "$1,200",
          reason: "private reason",
        },
      ],
      counts: { total: 1, renewalFlags: 1, writebacksAwaiting: 0, queueItems: 0 },
    } as never);

    const feed = await loadNotificationHub(admin, { full: true });

    expect(feed.notifications).toEqual([]);
    expect(feed.decisions.count).toBe(1);
    expect(feed.decisions.signals[0]).toEqual({
      lane: "decision",
      severity: "high",
      label: "Current rent",
      detail: "Synthetic renewal run",
      href: "/lease-renewal/runs/run-1",
      signal_key: "decision:renewal_flag:run-1:rent",
    });
    expect(JSON.stringify(feed.decisions)).not.toMatch(/\$1,200|private reason/);
  });
});

// AC-S17-8 (correct module): the hub PAYLOAD ASSEMBLER makes zero external calls. The pure feed builder
// is scanned separately; this pins the assembler that actually imports the live readers, so a future
// edit adding a RentVine / Sheet / Gmail client to hub.ts (e.g. enriching the digest) trips this test.
describe("notification hub source guards", () => {
  function read(rel: string) {
    return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
  }

  // Strip comments so a header comment naming these clients does not false-fail the scan; what matters
  // is that no CODE (import) pulls an external client in.
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  it("hub.ts imports no RentVine, Sheet, or Gmail transport client", () => {
    const source = stripComments(read("../../lib/notifications/hub.ts"));
    expect(source).not.toMatch(/rentvine/i);
    expect(source).not.toMatch(/google-sheets|googleapis|sheets-read/i);
    expect(source).not.toMatch(/gmail-runtime|GmailRuntimeClient|gmailapis/i);
    expect(source).toMatch(/gmail-hub\/notifications/);
  });

  // AC-S17-1 (page hardening): the hub page authenticates BEFORE it loads any data, and renders under a
  // "Notifications" heading. Static guard (the page is a Next server component; a render test would need
  // the full auth + redirect harness).
  it("the /notifications page guards auth before loading, under a Notifications heading", () => {
    const source = read("../../app/notifications/page.tsx");
    const guardAt = source.indexOf("requirePageCapability");
    const loadAt = source.indexOf("loadNotificationHub");
    expect(guardAt).toBeGreaterThan(-1);
    expect(loadAt).toBeGreaterThan(-1);
    // Auth guard is awaited BEFORE the data load (an unauthenticated request never reaches the log).
    expect(guardAt).toBeLessThan(loadAt);
    expect(source).toMatch(/<h1[^>]*>Notifications<\/h1>/);
  });
});
