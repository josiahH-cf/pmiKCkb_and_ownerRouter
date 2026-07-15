import { describe, expect, it, vi } from "vitest";

import { RenewalSheetExecutor } from "@/lib/lease-renewal/execution/providers";

function input() {
  return {
    workflowId: "renewal-1",
    actionId: "sheet-1",
    actionKey: "google_sheets.renewal_checklist.writeback",
    values: { cell: "Lease Renewal!AA10", expected_value: "old", next_value: "new" },
    sourceRefs: ["source:synthetic"],
  };
}

describe("Renewal Sheet executor", () => {
  it("compare-and-sets exactly one re-anchored cell and reads it back", async () => {
    let value = "old";
    const writeCell = vi.fn(async ({ value: next }) => void (value = next));
    const result = await new RenewalSheetExecutor({
      readCell: async () => value,
      writeCell,
    }).execute(input());
    expect(writeCell).toHaveBeenCalledTimes(1);
    expect(writeCell).toHaveBeenCalledWith(
      expect.objectContaining({ cell: "Lease Renewal!AA10", value: "new" }),
    );
    expect(result.resultHash).toHaveLength(64);
  });

  it("refuses drift with zero writes", async () => {
    const writeCell = vi.fn();
    await expect(
      new RenewalSheetExecutor({ readCell: async () => "drift", writeCell }).execute(
        input(),
      ),
    ).rejects.toBeDefined();
    expect(writeCell).not.toHaveBeenCalled();
  });
});
