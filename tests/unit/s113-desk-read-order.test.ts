import { afterEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  progress: vi.fn(),
  sheet: vi.fn(),
  project: vi.fn(),
  snapshot: vi.fn(),
  freshSnapshot: vi.fn(),
}));
vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRenewalConfig: () => ({
    ok: true,
    rentvineClient: {},
    sheetsReader: {},
    spreadsheetId: "isolated-fixture-sheet",
  }),
}));
vi.mock("@/lib/lease-renewal/live-lease-cache", () => ({
  getLiveLeaseSnapshot: fixture.snapshot,
  getLiveLeaseSnapshotAtOrAfter: fixture.freshSnapshot,
}));
vi.mock("@/lib/lease-renewal/sheet-links", () => ({
  readRenewalSheetGridsWithLinks: fixture.sheet,
}));
vi.mock("@/lib/lease-renewal/live-desk", () => ({
  loadLiveRenewalDesk: fixture.project,
}));
vi.mock("@/lib/firestore/lease-renewal-progress", () => ({
  listAllRenewalProgress: fixture.progress,
}));
vi.mock("@/lib/firestore/renewal-workspace", () => ({
  listRenewalWorkspaces: async () => new Map(),
}));
vi.mock("@/lib/firestore/lease-renewal-notice-rules", () => ({
  readNoticeRuleSnapshot: async () => ({ state: "current" }),
}));
vi.mock("@/lib/firestore/lease-renewal-follow-up-attention", () => ({
  listDismissedRenewalFollowUpKeys: async () => [],
}));
vi.mock("@/lib/firestore/lease-renewal-resolutions", () => ({
  listResolutionsForRun: async () => [],
}));
vi.mock("@/lib/firestore/lease-renewal-term-reviews", () => ({
  listLeaseTermReviews: async () => new Map(),
}));
vi.mock("@/lib/firestore/lease-document-packet-snapshots", () => ({
  listCurrentRenewalPacketSnapshots: async () => new Map(),
}));
vi.mock("@/lib/gmail-hub/dependencies", () => ({
  createGmailHubService: () => ({ listCommunications: async () => [] }),
}));
import { runRenewalAssistantSource } from "@/lib/lease-renewal/assistant-source";
const actor = {
  uid: "fixture-reader",
  email: "fixture-reader@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
const snapshot = { snapshot: { views: [], complete: true } };
const sheet = {
  tables: [],
  tableJoinIds: [],
  tableRentvineSourceUrls: [],
  titles: ["Lease Renewal"],
};
afterEach(() => vi.resetAllMocks());
function setup() {
  fixture.snapshot.mockResolvedValue(snapshot);
  fixture.freshSnapshot.mockResolvedValue(snapshot);
  fixture.sheet.mockResolvedValue(sheet);
  fixture.project.mockResolvedValue({ status: "ok" });
  fixture.progress.mockResolvedValue(new Map());
}
describe("S113 fresh desk read scheduling", () => {
  it("starts the current Sheet read while supporting state is pending and projects those exact bytes once", async () => {
    setup();
    let finish!: () => void;
    fixture.progress.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(new Map());
        }),
    );
    const result = runRenewalAssistantSource(actor, new Date("2026-09-10T16:00:00Z"));
    try {
      await vi.waitFor(() => expect(fixture.sheet).toHaveBeenCalledTimes(1), {
        timeout: 1000,
      });
    } finally {
      finish?.();
    }
    expect((await result).outcome.status).toBe("ok");
    expect(fixture.project.mock.calls[0].at(-1)).toBe(sheet);
    expect(fixture.sheet).toHaveBeenCalledTimes(1);
  });
  it("starts independent supporting reads before the lease snapshot settles", async () => {
    setup();
    let finish!: () => void;
    fixture.snapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(snapshot);
        }),
    );
    const result = runRenewalAssistantSource(actor, new Date("2026-09-10T16:00:00Z"));
    try {
      await vi.waitFor(() => expect(fixture.progress).toHaveBeenCalledOnce(), {
        timeout: 1000,
      });
    } finally {
      finish();
    }
    expect((await result).outcome.status).toBe("ok");
    expect(fixture.project.mock.calls[0][8]).toBe(snapshot);
  });
  it("keeps failed primary Sheet reads as read_error and preserves the requested lease freshness floor", async () => {
    setup();
    fixture.sheet.mockRejectedValue(new Error("private provider body"));
    const now = new Date("2026-09-10T16:00:00Z"),
      floor = now.getTime() - 500;
    const result = await runRenewalAssistantSource(actor, now, floor);
    expect(result.outcome).toEqual({ status: "read_error" });
    expect(fixture.project).not.toHaveBeenCalled();
    expect(fixture.sheet).toHaveBeenCalledTimes(1);
    expect(fixture.snapshot).not.toHaveBeenCalled();
    expect(fixture.freshSnapshot).toHaveBeenCalledWith({}, now.getTime(), floor);
    expect(JSON.stringify(result)).not.toContain("private provider body");
  });
});
