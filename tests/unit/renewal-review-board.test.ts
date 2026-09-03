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
    mocks.loadLiveRenewalReview.mockResolvedValue({
      status: "ok",
      view: liveView,
      run: liveRun,
    });
  });

  it("projects only the ordinary Live review with its saved overlays", async () => {
    await expect(loadRenewalRunViews(actor)).resolves.toEqual([liveView]);
    expect(mocks.listResolutionsForRun).toHaveBeenCalledWith(actor, "live-review");
    expect(mocks.listWritebackApprovalsForRun).toHaveBeenCalledWith(actor, "live-review");
    expect(mocks.loadLiveRenewalReview).toHaveBeenCalledWith(expect.any(String), {
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

    await expect(loadRenewalRunViews(actor)).resolves.toEqual([liveView]);
    expect(mocks.loadLiveRenewalReview).toHaveBeenCalledWith(expect.any(String), {
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
    await expect(loadRenewalRunViews(actor)).resolves.toEqual([]);
    await expect(loadRenewalRunViewContext(actor)).resolves.toMatchObject({
      views: [],
      runs: [],
      sourceStatus: "read_error",
    });
  });
});
