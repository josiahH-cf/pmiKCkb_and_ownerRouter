import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listLeaseTestRuns: vi.fn(),
  listResolutionsForRun: vi.fn(),
  listWritebackApprovalsForRun: vi.fn(),
}));

vi.mock("@/lib/firestore/lease-renewal-test-runs", () => ({
  listLeaseTestRuns: mocks.listLeaseTestRuns,
}));
vi.mock("@/lib/firestore/lease-renewal-resolutions", () => ({
  listResolutionsForRun: mocks.listResolutionsForRun,
}));
vi.mock("@/lib/firestore/lease-renewal-writeback-approvals", () => ({
  listWritebackApprovalsForRun: mocks.listWritebackApprovalsForRun,
}));

import { loadRenewalRunViews } from "@/lib/lease-renewal/renewal-review-board";
import type { AuthenticatedUser } from "@/lib/auth/session";

const actor: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

describe("renewal review board gather", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listResolutionsForRun.mockResolvedValue([]);
    mocks.listWritebackApprovalsForRun.mockResolvedValue([]);
  });

  it("projects the exact persistent Test run identity into Approval", async () => {
    mocks.listLeaseTestRuns.mockResolvedValue([
      {
        id: "test-renewal-persisted-1",
        status: "Executing",
      },
    ]);

    const views = await loadRenewalRunViews(actor);

    expect(views.map((view) => view.runId)).toEqual([
      "sim-renewal-001",
      "test-renewal-persisted-1",
    ]);
    expect(views[1].label).toBe("TEST · Executing · test-renewal-persisted-1");
    expect(mocks.listResolutionsForRun).toHaveBeenCalledWith(
      actor,
      "test-renewal-persisted-1",
    );
    expect(mocks.listWritebackApprovalsForRun).toHaveBeenCalledWith(
      actor,
      "test-renewal-persisted-1",
    );
  });

  it("fails closed to the sample projection when Test persistence is unavailable", async () => {
    mocks.listLeaseTestRuns.mockRejectedValue(new Error("Firestore unavailable"));

    const views = await loadRenewalRunViews(actor);

    expect(views.map((view) => view.runId)).toEqual(["sim-renewal-001"]);
    expect(views.some((view) => view.label.includes("TEST ·"))).toBe(false);
  });
});
