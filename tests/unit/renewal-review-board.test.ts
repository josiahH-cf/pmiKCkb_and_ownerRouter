import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listResolutionsForRun: vi.fn(),
  listWritebackApprovalsForRun: vi.fn(),
  loadLiveRenewalReview: vi.fn(),
}));

vi.mock("@/lib/firestore/lease-renewal-resolutions", () => ({
  listResolutionsForRun: mocks.listResolutionsForRun,
}));
vi.mock("@/lib/firestore/lease-renewal-writeback-approvals", () => ({
  listWritebackApprovalsForRun: mocks.listWritebackApprovalsForRun,
}));
vi.mock("@/lib/lease-renewal/live-review", () => ({
  LIVE_REVIEW_RUN_ID: "live-review",
  loadLiveRenewalReview: mocks.loadLiveRenewalReview,
}));

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  loadRenewalRunViewContext,
  loadRenewalRunViews,
} from "@/lib/lease-renewal/renewal-review-board";

const actor: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

const liveView = { runId: "live-review", label: "Live renewal review" };
const liveRun = { runId: "live-review", flags: [] };

describe("renewal review board gather", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listResolutionsForRun.mockResolvedValue([{ id: "resolution-1" }]);
    mocks.listWritebackApprovalsForRun.mockResolvedValue([{ id: "approval-1" }]);
    mocks.loadLiveRenewalReview.mockImplementation(async (_actor, _at, overlay) => {
      await overlay;
      return {
        status: "ok",
        view: liveView,
        run: liveRun,
        meta: { currencyState: "fresh" },
      };
    });
  });

  it("projects only the ordinary Live review with its saved overlays", async () => {
    await expect(loadRenewalRunViews(actor)).resolves.toEqual([liveView]);
    expect(mocks.listResolutionsForRun).toHaveBeenCalledWith(actor, "live-review");
    expect(mocks.listWritebackApprovalsForRun).toHaveBeenCalledWith(actor, "live-review");
    expect(mocks.loadLiveRenewalReview).toHaveBeenCalledWith(
      actor,
      expect.any(String),
      expect.any(Promise),
    );
    await expect(mocks.loadLiveRenewalReview.mock.calls[0][2]).resolves.toEqual({
      resolutions: [{ id: "resolution-1" }],
      approvals: [{ id: "approval-1" }],
    });
  });

  it("returns the exact current-source run alongside its projection", async () => {
    await expect(loadRenewalRunViewContext(actor)).resolves.toEqual({
      views: [liveView],
      runs: [liveRun],
      sourceStatus: "available",
      overlayStatus: "available",
    });
  });

  it("keeps the Live read useful when decision overlays are unavailable", async () => {
    mocks.listResolutionsForRun.mockRejectedValue(new Error("Firestore unavailable"));

    await expect(loadRenewalRunViews(actor)).rejects.toMatchObject({ status: 409 });
    await expect(mocks.loadLiveRenewalReview.mock.calls[0][2]).resolves.toEqual({
      resolutions: [],
      approvals: [],
    });
    await expect(loadRenewalRunViewContext(actor)).resolves.toMatchObject({
      sourceStatus: "available",
      overlayStatus: "unavailable",
    });
  });

  it("returns no rows when the Live read is unavailable and never substitutes fixtures", async () => {
    mocks.loadLiveRenewalReview.mockResolvedValue({ status: "read_error" });
    await expect(loadRenewalRunViews(actor)).rejects.toMatchObject({ status: 409 });
    await expect(loadRenewalRunViewContext(actor)).resolves.toMatchObject({
      views: [],
      runs: [],
      sourceStatus: "read_error",
    });
  });

  it.each(["stale", "expired"])(
    "keeps %s retained rows readable but refuses to report them as current attention",
    async (currencyState) => {
      mocks.loadLiveRenewalReview.mockResolvedValue({
        status: "ok",
        view: liveView,
        run: liveRun,
        meta: { currencyState },
      });
      await expect(loadRenewalRunViewContext(actor)).resolves.toMatchObject({
        sourceStatus: currencyState,
        views: [liveView],
      });
      await expect(loadRenewalRunViews(actor)).rejects.toMatchObject({ status: 409 });
    },
  );

  it("starts the independent source read before a pending saved overlay and waits to project it", async () => {
    let release!: (rows: { id: string }[]) => void;
    mocks.listResolutionsForRun.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    let settled = false;
    const pending = loadRenewalRunViewContext(actor).then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(mocks.loadLiveRenewalReview).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    release([{ id: "synthetic-delayed-resolution" }]);
    await expect(pending).resolves.toMatchObject({
      sourceStatus: "available",
      overlayStatus: "available",
      views: [liveView],
    });
    await expect(mocks.loadLiveRenewalReview.mock.calls[0][2]).resolves.toEqual({
      resolutions: [{ id: "synthetic-delayed-resolution" }],
      approvals: [{ id: "approval-1" }],
    });
  });
});
