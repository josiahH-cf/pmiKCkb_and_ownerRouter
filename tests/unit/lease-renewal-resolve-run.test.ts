import { beforeEach, describe, expect, it, vi } from "vitest";

const rebuildLiveRenewalRun = vi.hoisted(() => vi.fn());

vi.mock("@/lib/lease-renewal/live-review", () => ({
  LIVE_REVIEW_RUN_ID: "live-review",
  rebuildLiveRenewalRun,
}));

import {
  createRenewalRunResolver,
  resolveRenewalRun,
} from "@/lib/lease-renewal/resolve-run";

describe("resolveRenewalRun", () => {
  beforeEach(() => {
    rebuildLiveRenewalRun.mockReset();
    rebuildLiveRenewalRun.mockResolvedValue({ runId: "live-review" });
  });

  it("rebuilds only the ordinary Live review id", async () => {
    await expect(resolveRenewalRun("live-review")).resolves.toMatchObject({
      runId: "live-review",
    });
    expect(rebuildLiveRenewalRun).toHaveBeenCalledOnce();
  });

  it("refuses former sample, Test, and unknown ids without a persistence read", async () => {
    await expect(resolveRenewalRun("sim-renewal-001")).resolves.toBeNull();
    await expect(resolveRenewalRun("test-renewal-persisted")).resolves.toBeNull();
    await expect(resolveRenewalRun("does-not-exist")).resolves.toBeNull();
    expect(rebuildLiveRenewalRun).not.toHaveBeenCalled();
  });

  it("returns the same Live-only resolver to the authenticated route", async () => {
    const resolve = createRenewalRunResolver();
    await expect(resolve("live-review")).resolves.toMatchObject({
      runId: "live-review",
    });
    await expect(resolve("test-renewal-persisted")).resolves.toBeNull();
  });

  it("degrades to null when the Live source cannot be rebuilt", async () => {
    rebuildLiveRenewalRun.mockResolvedValue(null);
    await expect(resolveRenewalRun("live-review")).resolves.toBeNull();
  });
});
