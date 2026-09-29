import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";
const fixture = vi.hoisted(() => ({
  progress: vi.fn(),
  sheet: vi.fn(),
  project: vi.fn(),
  snapshot: vi.fn(),
  packets: vi.fn(),
  getAdminFirestore: vi.fn(),
}));
vi.mock("@/lib/firestore/admin", () => ({
  getAdminFirestore: fixture.getAdminFirestore,
}));
vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRenewalConfig: () => ({
    ok: true,
    rentvineClient: {},
    sheetsReader: {},
    spreadsheetId: "isolated-fixture-sheet",
  }),
}));
// This suite owns orchestration scheduling; the real admitted reader and its stronger
// post-write barrier are exercised by the separate cache/cross-runtime/backend suites.
vi.mock("@/lib/lease-renewal/admitted-notice-source", () => ({
  readCoherentRenewalDisplaySource: fixture.snapshot,
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
vi.mock("@/lib/firestore/renewal-work-status", () => ({
  listRenewalWorkStatuses: async () => new Map(),
}));
vi.mock("@/lib/firestore/lease-renewal-notice-rules", () => ({
  readNoticeRuleSnapshot: async () => ({ state: "current" }),
}));
// S125: the reviewed notice timing basis is one more independent supporting read.
vi.mock("@/lib/firestore/lease-renewal-move-out-timing-basis", () => ({
  readMoveOutTimingBasisSnapshot: async () => ({
    state: "missing",
    basis: null,
    version: null,
    updatedAtIso: null,
  }),
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
  listCurrentRenewalPacketSnapshots: fixture.packets,
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
const snapshot: Awaited<
  ReturnType<
    typeof import("@/lib/lease-renewal/admitted-notice-source").readCoherentRenewalDisplaySource
  >
> = {
  snapshot: {
    views: [{ leaseID: "9001" }],
    complete: true,
    detailComplete: true,
    detailUnavailableCount: 0,
    readAtMs: Date.parse("2026-09-10T16:00:00Z"),
  },
  currency: {
    state: "fresh",
    ageMs: 0,
    readAtMs: Date.parse("2026-09-10T16:00:00Z"),
    refreshing: false,
    lastError: false,
  },
  statusTable: {
    status: "available",
    statuses: [],
    readAtMs: Date.parse("2026-09-10T16:00:00Z"),
  },
};
const sheet = {
  tables: [],
  tableJoinIds: [],
  tableRentvineSourceUrls: [],
  titles: ["Lease Renewal"],
};
let store: FakeTransactionalFirestore;
afterEach(() => {
  // The mocked coherent-read seam owns scheduling only: constructing the real admission wrapper
  // must not itself admit a source generation or persist records.
  expect(store.store.size).toBe(0);
  vi.resetAllMocks();
});
function setup() {
  store = new FakeTransactionalFirestore();
  fixture.getAdminFirestore.mockReturnValue(store);
  fixture.snapshot.mockResolvedValue(snapshot);
  fixture.packets.mockResolvedValue(new Map());
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
      expect(fixture.project).not.toHaveBeenCalled();
    } finally {
      finish?.();
    }
    expect((await result).outcome.status).toBe("ok");
    // The prepared Sheet read is the loader's thirteenth argument (S125 appended the timing basis).
    expect(fixture.project.mock.calls[0][12]).toBe(sheet);
    expect(fixture.project.mock.calls[0][8]).toBe(snapshot);
    expect(fixture.project.mock.calls[0][15]).toBe(snapshot.statusTable);
    expect(fixture.snapshot).toHaveBeenCalledOnce();
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
      expect(fixture.project).not.toHaveBeenCalled();
      expect(fixture.packets).not.toHaveBeenCalled();
    } finally {
      finish();
    }
    expect((await result).outcome.status).toBe("ok");
    expect(fixture.project.mock.calls[0][8]).toBe(snapshot);
    expect(fixture.project.mock.calls[0][15]).toBe(snapshot.statusTable);
    expect(fixture.packets).toHaveBeenCalledExactlyOnceWith(actor, ["9001"]);
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
    expect(fixture.snapshot).toHaveBeenCalledExactlyOnceWith(
      actor,
      expect.any(Object),
      now.getTime(),
      { sourceRefreshAfter: floor },
    );
    // These callbacks are supplied through a Proxy get trap, not enumerable own properties.
    expect(fixture.snapshot.mock.calls[0][1].beforeLeaseSourceRead).toBeTypeOf(
      "function",
    );
    expect(fixture.snapshot.mock.calls[0][1].beforeStatusSourceRead).toBeTypeOf(
      "function",
    );
    expect(fixture.packets).toHaveBeenCalledExactlyOnceWith(actor, ["9001"]);
    expect(JSON.stringify(result)).not.toContain("private provider body");
  });
});
