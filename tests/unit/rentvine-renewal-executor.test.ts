import { describe, expect, it, vi } from "vitest";

import { RentvineRenewalExecutor } from "@/lib/lease-renewal/execution/providers";

const base = {
  workflowId: "renewal-1",
  actionId: "rentvine-1",
  actionKey: "rentvine.lease.renewal_writeback",
  values: { lease_ref: "lease-synthetic", rent: 1000 },
  sourceRefs: ["source:synthetic"],
};

describe("Rentvine renewal executor", () => {
  it("blocks undocumented contract with zero provider mutation", async () => {
    const mutate = vi.fn();
    await expect(
      new RentvineRenewalExecutor({ mutate, read: vi.fn() }).execute(base),
    ).rejects.toThrow("vendor contract");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("proves documented fake mutation and read-after-write", async () => {
    const mutate = vi.fn().mockResolvedValue({ providerRef: "lease-synthetic" });
    const result = await new RentvineRenewalExecutor({
      mutate,
      read: vi.fn().mockResolvedValue({ status: "renewed" }),
    }).execute({ ...base, contractRef: "documented:fake:rentvine-v1" });
    expect(result.providerRef).toBe("lease-synthetic");
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
