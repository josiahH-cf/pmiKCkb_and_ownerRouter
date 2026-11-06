import { afterEach, describe, expect, it, vi } from "vitest";

// S246 R-S246-5: the lease page reads this lease's keep-working choice so it carries the desk's
// target verdict. The page is the release canary's renewal workspace route, so that one optional
// read starts with the page's other independent reads and has the same bounded wait: a choice
// read that stalls degrades to no recorded choice and never holds the page. Values are synthetic.

const fixture = vi.hoisted(() => ({
  project: vi.fn(),
  snapshot: vi.fn(),
  access: vi.fn(),
  progress: vi.fn(),
  decision: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth/page-guards", () => ({
  requirePageSpaceAccess: async () => {},
  requirePageCapability: fixture.access,
}));
vi.mock("@/components/layout/AppShell", () => ({ AppShell: () => null }));
vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRenewalConfig: () => ({ ok: true, rentvineClient: {}, sheetsReader: {} }),
}));
vi.mock("@/lib/lease-renewal/live-lease-cache", async (original) => ({
  ...(await original<object>()),
  getLiveLeaseSnapshot: fixture.snapshot,
  getLiveLeaseSnapshotAtOrAfter: fixture.snapshot,
}));
vi.mock("@/lib/lease-renewal/live-desk", () => ({
  loadLiveRenewalLeaseWorkspace: fixture.project,
}));
vi.mock("@/lib/lease-renewal/sheet-writeback/workspace-resolution", () => ({
  resolveFreshOperatingSheetLeaseContext: async () => null,
}));
vi.mock("@/lib/firestore/renewal-workspace", () => ({
  getRenewalWorkspace: async () => null,
}));
vi.mock("@/lib/firestore/lease-renewal-progress", () => ({
  getRenewalProgress: fixture.progress,
}));
vi.mock("@/lib/firestore/renewal-cycle-date-decisions", async (original) => ({
  ...(await original<object>()),
  getRenewalCycleDateDecision: fixture.decision,
}));
vi.mock("@/lib/firestore/lease-document-packet-snapshots", () => ({
  getCurrentPacketSnapshot: async () => null,
}));
vi.mock("@/lib/firestore/lease-renewal-notice-rules", () => ({
  readNoticeRuleSnapshot: async () => ({ state: "current" }),
}));
vi.mock("@/lib/gmail-hub/dependencies", () => ({
  createGmailHubService: () => ({ listCommunications: async () => [] }),
}));
vi.mock("@/lib/firestore/lease-renewal-follow-up-attention", () => ({
  listDismissedRenewalFollowUpKeys: async () => [],
}));
vi.mock("@/lib/lease-renewal/comp-screenshot-action", () => ({
  getRenewalCompScreenshotActionView: async () => ({ executable: false }),
}));
vi.mock("@/lib/firestore/lease-renewal-resolutions", () => ({
  listResolutionsForRun: async () => [],
}));
vi.mock("@/lib/firestore/lease-renewal-term-reviews", () => ({
  getLeaseTermReview: async () => null,
}));
vi.mock("@/lib/firestore/renewal-discrepancy-dispositions", () => ({
  listRenewalDiscrepancyDispositions: async () => [],
}));
vi.mock("@/lib/lease-renewal/writeback/proposal-store", () => ({
  getRenewalWritebackProposal: async () => null,
}));
vi.mock("@/lib/lease-renewal/writeback/charge-inventory", () => ({
  loadRenewalChargeInventory: async () => null,
}));
vi.mock("@/lib/firestore/renewal-resource-locations", () => ({
  getRenewalResourceLocations: async () => ({ version: 0, entries: {} }),
}));
vi.mock("@/lib/lease-renewal/sheet-writeback/live", () => ({
  OPERATING_SHEET_TAB: "Lease Renewal",
  liveOperatingSheetId: () => "isolated-sheet",
}));
vi.mock("@/lib/lease-renewal/sheet-writeback/workspace-context", () => ({
  mintSheetWorkspaceContext: () => "isolated-context",
}));
vi.mock("@/lib/lease-renewal/sheet-writeback/proposal-store", () => ({
  getSheetWritebackProposal: async () => null,
}));
vi.mock("@/lib/firestore/lease-renewal-rent-suggestion-approvals", () => ({
  getApprovedRentSuggestion: async () => null,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => ({}) }));
vi.mock("@/lib/firestore/external-action-executions", () => ({
  FirestoreExternalExecutionStore: class {},
}));
vi.mock("@/lib/lease-renewal/execution/workspace-continuation", () => ({
  projectWorkspaceAttemptSummary: async () => null,
  loadWorkspaceAttemptState: async () => null,
}));

import Page from "@/app/lease-renewal/live/desk/lease/[leaseId]/page";
import { SOURCE_READ_WAIT_MS } from "@/lib/observability/read-lifetime";

const KEPT = {
  schemaVersion: "renewal-cycle-date-decision/v1",
  leaseId: "81",
  cycleId: "5b0c1d2e-3f40-4a51-8b62-7c8d9e0f1a2b",
  recordedDateIso: "2026-12-31",
  sourceDateIso: "2027-12-31",
  decision: "keep_working",
  revision: 1,
  recordedAt: "2026-11-04T16:00:00.000Z",
  recordedByUid: "synthetic-operator",
  recordedByLabel: "operator@example.invalid",
  eventId: "7d2e3f40-5162-4c73-8d84-9e0f1a2b3c4d",
} as const;

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

function setup() {
  fixture.access.mockResolvedValue({
    uid: "fixture-reader",
    email: "fixture-reader@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  });
  fixture.snapshot.mockResolvedValue({
    snapshot: { views: [], complete: true },
    currency: { state: "fresh" },
  });
  fixture.project.mockResolvedValue({ status: "not_found" });
  fixture.progress.mockResolvedValue(null);
  fixture.decision.mockResolvedValue(KEPT);
}

/**
 * The keep-working choice the page handed to the lease projection. S248 appends one argument
 * after it (the lease's renewal message evidence) and S249 one more (the preparation read), so
 * the choice is the third from the end.
 */
const decisionPassed = () => fixture.project.mock.calls[0]?.at(-3);

describe("S246 the lease page's keep-working choice read", () => {
  it("starts with the page's other independent reads, while they are still pending", async () => {
    setup();
    let release!: () => void;
    fixture.progress.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(null);
        }),
    );
    const rendering = Page({ params: Promise.resolve({ leaseId: "81" }) });
    try {
      await vi.waitFor(() => expect(fixture.decision).toHaveBeenCalledTimes(1), {
        timeout: 500,
      });
      expect(fixture.decision.mock.calls[0]?.[1]).toBe("81");
      expect(fixture.project).not.toHaveBeenCalled();
    } finally {
      release?.();
      await rendering;
    }
    // The choice it read reaches the lease projection unchanged.
    expect(decisionPassed()).toEqual(KEPT);
  });

  it("a choice read that never answers degrades to no recorded choice within the read deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    setup();
    fixture.decision.mockImplementation(() => new Promise(() => {}));
    const rendering = Page({ params: Promise.resolve({ leaseId: "81" }) });
    await vi.advanceTimersByTimeAsync(SOURCE_READ_WAIT_MS);
    await rendering;
    expect(fixture.project).toHaveBeenCalledTimes(1);
    expect(decisionPassed()).toBeNull();
  });

  it("a failed choice read is no recorded choice", async () => {
    setup();
    fixture.decision.mockRejectedValue(new Error("synthetic decision store outage"));
    await Page({ params: Promise.resolve({ leaseId: "81" }) });
    expect(decisionPassed()).toBeNull();
  });
});
