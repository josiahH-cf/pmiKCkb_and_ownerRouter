import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  fields: vi.fn(),
  project: vi.fn(),
  snapshot: vi.fn(),
  access: vi.fn(),
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
  resolveFreshOperatingSheetLeaseContext: fixture.fields,
}));
vi.mock("@/lib/firestore/renewal-workspace", () => ({
  getRenewalWorkspace: async () => null,
}));
vi.mock("@/lib/firestore/lease-renewal-progress", () => ({
  getRenewalProgress: async () => null,
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
}));

import Page from "@/app/lease-renewal/live/desk/lease/[leaseId]/page";

afterEach(() => vi.resetAllMocks());
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
}

describe("S113 workspace source-read scheduling", () => {
  it("starts the dashboard projection while the independent full fresh Sheet rebuild remains pending", async () => {
    setup();
    let release!: () => void;
    fixture.fields.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(null);
        }),
    );
    const rendering = Page({ params: Promise.resolve({ leaseId: "81" }) });
    try {
      await vi.waitFor(() => expect(fixture.project).toHaveBeenCalledTimes(1), {
        timeout: 500,
      });
      expect(fixture.fields).toHaveBeenCalledTimes(1);
    } finally {
      release?.();
      await rendering;
    }
  });

  it("refuses every source read when the page capability guard denies access", async () => {
    setup();
    fixture.access.mockRejectedValue(new Error("forbidden"));
    await expect(Page({ params: Promise.resolve({ leaseId: "81" }) })).rejects.toThrow(
      "forbidden",
    );
    expect(fixture.fields).not.toHaveBeenCalled();
    expect(fixture.snapshot).not.toHaveBeenCalled();
    expect(fixture.project).not.toHaveBeenCalled();
  });
});
