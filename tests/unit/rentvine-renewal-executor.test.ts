import { describe, expect, it, vi } from "vitest";

import { RentvineRenewalExecutor } from "@/lib/lease-renewal/execution/providers";

const base = {
  workflowId: "renewal-1",
  actionId: "rentvine-1",
  actionKey: "rentvine.lease.renewal_writeback",
  values: {
    lease_ref: "lease-synthetic",
    current_rent: 1000,
    new_rent: 1050,
    effective_date: "2026-09-01",
    lease_end_date: "2027-08-31",
    fee_cents: 0,
  },
  sourceRefs: ["source:synthetic"],
};

describe("Rentvine renewal executor", () => {
  it("blocks malformed authoritative values with zero provider mutation", async () => {
    const compareAndSetRenewal = vi.fn();
    await expect(
      new RentvineRenewalExecutor({
        compareAndSetRenewal,
        read: vi.fn(),
        findByIdempotencyKey: vi.fn(),
      }).execute({
        ...base,
        values: { ...base.values, effective_date: "" },
      }),
    ).rejects.toThrow("effective_date");
    expect(compareAndSetRenewal).not.toHaveBeenCalled();
  });

  it("proves documented fake mutation and read-after-write", async () => {
    const compareAndSetRenewal = vi.fn().mockResolvedValue({
      providerRef: "lease-synthetic",
      applied: true,
    });
    const read = vi
      .fn()
      .mockResolvedValueOnce({ lease_ref: "lease-synthetic", current_rent: 1000 })
      .mockResolvedValueOnce({
        lease_ref: "lease-synthetic",
        new_rent: 1050,
        effective_date: "2026-09-01",
        lease_end_date: "2027-08-31",
        fee_cents: 0,
      });
    const result = await new RentvineRenewalExecutor({
      compareAndSetRenewal,
      read,
      findByIdempotencyKey: vi.fn(),
    }).execute({ ...base, contractRef: "documented:fake:rentvine-v1" });
    expect(result.providerRef).toBe("lease-synthetic");
    expect(compareAndSetRenewal).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedLeaseRef: "lease-synthetic",
        expectedCurrentRent: 1000,
      }),
    );
  });

  it("checks current rent before mutation and consumes zero provider writes on drift", async () => {
    const compareAndSetRenewal = vi.fn();
    const executor = new RentvineRenewalExecutor({
      compareAndSetRenewal,
      read: vi.fn().mockResolvedValue({
        lease_ref: "lease-synthetic",
        current_rent: 999,
      }),
      findByIdempotencyKey: vi.fn(),
    });
    await expect(executor.execute(base)).rejects.toThrow(/current rent drifted/i);
    expect(compareAndSetRenewal).not.toHaveBeenCalled();
  });

  it("refuses a concurrent change at the provider conditional-write boundary", async () => {
    const compareAndSetRenewal = vi.fn().mockResolvedValue({
      providerRef: "lease-synthetic",
      applied: false,
    });
    const executor = new RentvineRenewalExecutor({
      compareAndSetRenewal,
      read: vi.fn().mockResolvedValue({
        lease_ref: "lease-synthetic",
        current_rent: 1000,
      }),
      findByIdempotencyKey: vi.fn(),
    });
    await expect(executor.execute(base)).rejects.toMatchObject({ code: "provider" });
    expect(compareAndSetRenewal).toHaveBeenCalledTimes(1);
  });

  it("reconciles through the idempotency lookup when provider ref differs from lease ref", async () => {
    const executor = new RentvineRenewalExecutor({
      compareAndSetRenewal: vi.fn(),
      read: vi.fn(),
      findByIdempotencyKey: vi.fn().mockResolvedValue({
        providerRef: "renewal-write-42",
        values: { ...base.values },
      }),
    });
    await expect(executor.reconcile(base)).resolves.toMatchObject({
      providerRef: "renewal-write-42",
      reconciled: true,
    });
  });
});
