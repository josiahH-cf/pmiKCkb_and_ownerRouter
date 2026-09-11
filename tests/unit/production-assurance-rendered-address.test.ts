import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright-core";
import { readRenderedLeaseAddress } from "../../scripts/run-production-reconciliation";

function cell(linkCount: number, spanCount: number) {
  const readLink = vi.fn(async () => {
    if (linkCount === 0) throw new Error("absent_locator_would_timeout");
    return "  Linked address  ";
  });
  const readPlain = vi.fn(async () => "  Plain address  ");
  const locator = {
    locator: (selector: string) => ({
      count: async () => {
        if (selector === ".renewal-lease-link") return linkCount;
        // Every real row also contains a secondary property/lease-id span.
        if (selector === ":scope > span") return spanCount + 1;
        if (selector === ":scope > span:not(.renewal-td-secondary)") return spanCount;
        throw new Error("unexpected_identity_selector");
      },
      first: () => ({
        textContent: selector === ".renewal-lease-link" ? readLink : readPlain,
      }),
    }),
  } as unknown as ReturnType<Page["locator"]>;
  return { locator, readLink, readPlain };
}
describe("complete-cohort rendered lease identity", () => {
  it("reads the skipped lease's plain address without waiting on its intentionally absent link", async () => {
    const skipped = cell(0, 1);
    expect(await readRenderedLeaseAddress(skipped.locator)).toBe("Plain address");
    expect(skipped.readLink).not.toHaveBeenCalled();
    const active = cell(1, 0);
    expect(await readRenderedLeaseAddress(active.locator)).toBe("Linked address");
    expect(active.readPlain).not.toHaveBeenCalled();
  });
  it("refuses missing and duplicate identity elements", async () => {
    for (const [links, spans] of [
      [0, 0],
      [2, 1],
      [0, 2],
    ])
      await expect(readRenderedLeaseAddress(cell(links, spans).locator)).rejects.toThrow(
        "rendered_lease_identity_invalid",
      );
  });
});
