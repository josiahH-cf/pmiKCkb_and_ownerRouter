import { describe, expect, it, vi } from "vitest";

import { BoomRenewalExecutor } from "@/lib/lease-renewal/execution/providers";

const base = {
  workflowId: "renewal-1",
  actionId: "boom-1",
  actionKey: "boom.resident.enroll",
  values: { resident_ref: "resident-synthetic", applicable: false },
  sourceRefs: ["source:synthetic"],
  mappingRef: "mapping:synthetic",
};

describe("Boom renewal executor", () => {
  it("records explicit not-applicable without a provider call", async () => {
    const enroll = vi.fn();
    const result = await new BoomRenewalExecutor({ enroll, reconcile: vi.fn() }).execute(
      base,
    );
    expect(result.outcome).toBe("not_applicable");
    expect(enroll).not.toHaveBeenCalled();
  });

  it("requires explicit applicability and resident identity", async () => {
    const enroll = vi.fn();
    const executor = new BoomRenewalExecutor({ enroll, reconcile: vi.fn() });
    await expect(
      executor.execute({ ...base, values: { resident_ref: "resident-synthetic" } }),
    ).rejects.toBeDefined();
    await expect(
      executor.execute({ ...base, values: { resident_ref: "", applicable: true } }),
    ).rejects.toBeDefined();
    expect(enroll).not.toHaveBeenCalled();
  });
});
