import { describe, expect, it, vi } from "vitest";

import { QuickBooksDraftBillExecutor } from "@/lib/maintenance/execution/providers";

const base = {
  workflowId: "ticket-1",
  actionId: "bill-1",
  actionKey: "quickbooks.bill.create_draft",
  values: {
    vendor_ref: "vendor-synthetic",
    account_ref: "account-synthetic",
    work_order_ref: "wo-synthetic",
    property_ref: "property-synthetic",
    amount_cents: 12500,
  },
  sourceRefs: ["source:synthetic"],
};

describe("QuickBooks draft Bill executor", () => {
  it("creates exactly one Draft with required references", async () => {
    const createDraftBill = vi
      .fn()
      .mockResolvedValue({ billRef: "bill-1", status: "Draft" });
    const provider = { createDraftBill, readDraftBill: vi.fn() };
    const result = await new QuickBooksDraftBillExecutor(provider).execute(base);
    expect(result.providerRef).toBe("bill-1");
    expect(createDraftBill).toHaveBeenCalledTimes(1);
    expect(provider).not.toHaveProperty("postBill");
    expect(provider).not.toHaveProperty("payBill");
  });

  it("blocks amount/account/vendor drift before provider", async () => {
    const createDraftBill = vi.fn();
    const executor = new QuickBooksDraftBillExecutor({
      createDraftBill,
      readDraftBill: vi.fn(),
    });
    await expect(
      executor.execute({ ...base, values: { ...base.values, amount_cents: 0 } }),
    ).rejects.toBeDefined();
    await expect(
      executor.execute({ ...base, values: { ...base.values, account_ref: "" } }),
    ).rejects.toBeDefined();
    expect(createDraftBill).not.toHaveBeenCalled();
  });
});
