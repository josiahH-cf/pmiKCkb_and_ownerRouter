import { describe, expect, it, vi } from "vitest";

import type { ExternalActionInput } from "@/lib/external-execution/types";
import {
  QuickBooksDraftBillExecutor,
  type QuickBooksDraftBillProvider,
  type QuickBooksDraftBillState,
} from "@/lib/maintenance/execution/providers";

const base = {
  workflowId: "ticket-synthetic",
  actionId: "bill-1",
  actionKey: "quickbooks.bill.create_draft",
  values: {
    vendor: "vendor-synthetic",
    account: "account-synthetic-repairs",
    rentvine_work_order_number: "wo-synthetic",
    property_unit: "unit-synthetic-101",
    amount: 12_500,
    currency: "USD",
  },
  sourceRefs: ["source:synthetic"],
} satisfies ExternalActionInput;

function state(patch: Partial<QuickBooksDraftBillState> = {}): QuickBooksDraftBillState {
  return {
    billRef: "bill-1",
    status: "Draft",
    vendorRef: "vendor-synthetic",
    accountRef: "account-synthetic-repairs",
    workOrderRef: "wo-synthetic",
    propertyUnitRef: "unit-synthetic-101",
    amountCents: 12_500,
    currency: "USD",
    ...patch,
  };
}

describe("QuickBooks draft Bill executor", () => {
  it("creates exactly one Draft and verifies every reviewed reference", async () => {
    const createDraftBill = vi
      .fn()
      .mockResolvedValue({ billRef: "bill-1", status: "Draft" });
    const provider: QuickBooksDraftBillProvider = {
      createDraftBill,
      readDraftBill: vi.fn().mockResolvedValue(state()),
    };
    const result = await new QuickBooksDraftBillExecutor(provider).execute(base);
    expect(result.providerRef).toBe("bill-1");
    expect(createDraftBill).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorRef: "vendor-synthetic",
        accountRef: "account-synthetic-repairs",
        workOrderRef: "wo-synthetic",
        propertyUnitRef: "unit-synthetic-101",
        amountCents: 12_500,
        currency: "USD",
      }),
    );
    expect(provider).not.toHaveProperty("postBill");
    expect(provider).not.toHaveProperty("payBill");
  });

  it.each([
    { amount: 0 },
    { amount: 12.5 },
    { account: "" },
    { vendor: "" },
    { property_unit: "" },
    { currency: "EUR" },
  ])("blocks invalid reviewed values before provider", async (patch) => {
    const createDraftBill = vi.fn();
    const executor = new QuickBooksDraftBillExecutor({
      createDraftBill,
      readDraftBill: vi.fn(),
    });
    const input = { ...base, values: { ...base.values, ...patch } };
    expect(executor.validate(input)).toBeTruthy();
    await expect(executor.execute(input)).rejects.toBeDefined();
    expect(createDraftBill).not.toHaveBeenCalled();
  });

  it.each([
    { vendorRef: "vendor-drifted" },
    { accountRef: "account-drifted" },
    { workOrderRef: "wo-drifted" },
    { propertyUnitRef: "unit-drifted" },
    { amountCents: 12_501 },
    { currency: "CAD" },
    { status: "Posted" },
  ])("marks exact readback drift ambiguous", async (patch) => {
    const provider: QuickBooksDraftBillProvider = {
      createDraftBill: vi.fn().mockResolvedValue({ billRef: "bill-1", status: "Draft" }),
      readDraftBill: vi.fn().mockResolvedValue(state(patch)),
    };
    await expect(
      new QuickBooksDraftBillExecutor(provider).execute(base),
    ).rejects.toMatchObject({ code: "ambiguous" });
  });

  it("returns a reconciled receipt for the exact Draft Bill", async () => {
    const executor = new QuickBooksDraftBillExecutor({
      createDraftBill: vi.fn(),
      readDraftBill: vi.fn().mockResolvedValue(state()),
    });

    await expect(executor.reconcile(base)).resolves.toMatchObject({
      providerRef: "bill-1",
      reconciled: true,
    });
  });

  it("rejects a blank provider reference as ambiguous", async () => {
    const executor = new QuickBooksDraftBillExecutor({
      createDraftBill: vi.fn().mockResolvedValue({ billRef: "", status: "Draft" }),
      readDraftBill: vi.fn().mockResolvedValue(state({ billRef: "" })),
    });

    await expect(executor.execute(base)).rejects.toMatchObject({
      code: "ambiguous",
    });
  });
});
