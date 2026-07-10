import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock only the I/O readers hub.ts touches; the pure builders (feed, standing, review digest, decision
// metrics) run for real. app-state-context is mocked so the coverage/connections resolvers return no
// gaps (their own behavior is tested elsewhere) and never reach Firestore here.
const mocks = vi.hoisted(() => ({
  listApprovalQueueNotifications: vi.fn(),
  listMaintenanceTicketNotifications: vi.fn(),
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
}));

vi.mock("@/lib/firestore/approval-queue-notifications", () => ({
  listApprovalQueueNotifications: mocks.listApprovalQueueNotifications,
}));
vi.mock("@/lib/firestore/maintenance-ticket-notifications", () => ({
  listMaintenanceTicketNotifications: mocks.listMaintenanceTicketNotifications,
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

import { loadNotificationHub } from "@/lib/notifications/hub";

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
    mocks.getNotificationPreferences.mockResolvedValue(prefs());
    // One High corrected_value override + two returned write-backs → a non-empty digest.
    mocks.listAllLeaseRenewalResolutions.mockResolvedValue([
      { resolution_kind: "corrected_value", severity: "High" },
    ]);
    mocks.listAllWritebackApprovals.mockResolvedValue([
      { state: "Returned for Revision" },
      { state: "Returned for Revision" },
    ]);
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

  it("skips the review digest + standing reads for the lightweight bell (no full)", async () => {
    seedReviewData();
    const feed = await loadNotificationHub(admin, { full: false });

    expect(feed.review).toBeNull();
    expect(feed.standing).toEqual([]);
    // Bell path never issues the coverage / decision-metrics reads.
    expect(mocks.resolveCoverageState).not.toHaveBeenCalled();
    expect(mocks.listAllLeaseRenewalResolutions).not.toHaveBeenCalled();
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

  it("hub.ts imports no RentVine, Sheet, or Gmail client", () => {
    const source = stripComments(read("../../lib/notifications/hub.ts"));
    expect(source).not.toMatch(/rentvine/i);
    expect(source).not.toMatch(/google-sheets|googleapis|sheets-read/i);
    expect(source).not.toMatch(/gmail/i);
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
