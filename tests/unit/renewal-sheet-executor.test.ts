import { describe, expect, it, vi } from "vitest";

import { RenewalSheetExecutor } from "@/lib/lease-renewal/execution/providers";

function input() {
  return {
    workflowId: "renewal-1",
    actionId: "sheet-1",
    actionKey: "google_sheets.renewal_checklist.writeback",
    values: {
      tab: "Lease Renewal",
      row_key: "lease-synthetic",
      column: "Status",
      before_value: "old",
      after_value: "new",
      source_of_value: "fixture:decision",
      verification_link: "https://example.invalid/verification",
    },
    sourceRefs: ["source:synthetic"],
  };
}

describe("Renewal Sheet executor", () => {
  it("compare-and-sets exactly one re-anchored cell and reads it back", async () => {
    let value = "old";
    const compareAndSetCell = vi.fn(async ({ expectedValue, value: next }) => {
      if (value !== expectedValue) return { applied: false };
      value = next;
      return { applied: true };
    });
    const result = await new RenewalSheetExecutor({
      resolveCell: async () => ({ cell: "Lease Renewal!AA10", value }),
      readCell: async () => value,
      compareAndSetCell,
    }).execute(input());
    expect(compareAndSetCell).toHaveBeenCalledTimes(1);
    expect(compareAndSetCell).toHaveBeenCalledWith(
      expect.objectContaining({
        cell: "Lease Renewal!AA10",
        expectedValue: "old",
        value: "new",
      }),
    );
    expect(result.resultHash).toHaveLength(64);
  });

  it("refuses drift with zero writes", async () => {
    const compareAndSetCell = vi.fn();
    await expect(
      new RenewalSheetExecutor({
        resolveCell: async () => ({ cell: "Lease Renewal!AA10", value: "drift" }),
        readCell: async () => "drift",
        compareAndSetCell,
      }).execute(input()),
    ).rejects.toBeDefined();
    expect(compareAndSetCell).not.toHaveBeenCalled();
  });

  it("refuses a concurrent change at the provider conditional-write boundary", async () => {
    let value = "old";
    const compareAndSetCell = vi.fn(async () => {
      value = "concurrent";
      return { applied: false };
    });
    await expect(
      new RenewalSheetExecutor({
        resolveCell: async () => ({ cell: "Lease Renewal!AA10", value }),
        readCell: async () => value,
        compareAndSetCell,
      }).execute(input()),
    ).rejects.toMatchObject({ code: "provider" });
    expect(value).toBe("concurrent");
    expect(compareAndSetCell).toHaveBeenCalledWith(
      expect.objectContaining({ expectedValue: "old", value: "new" }),
    );
  });
});
