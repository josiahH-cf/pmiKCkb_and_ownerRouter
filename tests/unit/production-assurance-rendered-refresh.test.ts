import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page } from "playwright-core";
import { waitForFreshRenderedRenewalDesk } from "../../scripts/run-production-reconciliation";

const fresh = {
  currency: "fresh",
  complete: "true",
  refreshing: "false",
  failed: "false",
};
const pending = { ...fresh, currency: "stale", refreshing: "true" };
function fixture(
  states: (typeof fresh)[],
  options: { failReload?: boolean; advanceMs?: number; roots?: number } = {},
) {
  let index = 0;
  const root = {
    count: async () => options.roots ?? 1,
    first: () => root,
    getAttribute: async (name: string) => {
      const state = states[Math.min(index, states.length - 1)];
      return (
        (
          {
            "data-source-currency-state": state.currency,
            "data-source-read-complete": state.complete,
            "data-source-refreshing": state.refreshing,
            "data-source-refresh-failed": state.failed,
          } as Record<string, string>
        )[name] ?? null
      );
    },
  };
  const reload = vi.fn(async (navigation: { waitUntil: string; timeout: number }) => {
    if (navigation.waitUntil !== "domcontentloaded" || navigation.timeout <= 0)
      throw new Error("invalid_navigation_options");
    index += 1;
    vi.setSystemTime(Date.now() + (options.advanceMs ?? 100));
    return { ok: () => !options.failReload };
  });
  const page = {
    locator: () => root,
    waitForFunction: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async (ms: number) => {
      vi.setSystemTime(Date.now() + ms);
    }),
    reload,
  } as unknown as Page;
  return { page, reload };
}

afterEach(() => vi.useRealTimers());
describe("bounded rendered source revalidation", () => {
  it("reads the fresh server render after demand-driven refresh without accepting stale data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { page, reload } = fixture([pending, pending, pending, fresh]);
    expect(await waitForFreshRenderedRenewalDesk(page, 60_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(3);
    expect(reload.mock.calls.map(([options]) => options)).toEqual([
      { waitUntil: "domcontentloaded", timeout: 59_000 },
      { waitUntil: "domcontentloaded", timeout: 57_900 },
      { waitUntil: "domcontentloaded", timeout: 56_800 },
    ]);
    const ready = fixture([fresh]);
    expect(await waitForFreshRenderedRenewalDesk(ready.page, 60_000)).toBe(true);
    expect(ready.reload).not.toHaveBeenCalled();
  });

  it("refuses expired, incomplete, failed, unknown and non-refreshing sources without retry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    for (const state of [
      { ...pending, currency: "expired" },
      { ...pending, complete: "false" },
      { ...pending, failed: "true" },
      { ...pending, currency: "unknown" },
      { ...pending, refreshing: "false" },
    ]) {
      const { page, reload } = fixture([state]);
      expect(await waitForFreshRenderedRenewalDesk(page, 60_000)).toBe(false);
      expect(reload).not.toHaveBeenCalled();
    }
    expect(
      await waitForFreshRenderedRenewalDesk(fixture([fresh], { roots: 2 }).page, 60_000),
    ).toBe(false);
  });

  it("retains the original deadline, bounded attempts and failed-navigation refusal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const unchanged = fixture([pending]);
    expect(await waitForFreshRenderedRenewalDesk(unchanged.page, 60_000)).toBe(false);
    expect(unchanged.reload).toHaveBeenCalledTimes(12);
    vi.setSystemTime(0);
    const expired = fixture([pending], { advanceMs: 60_000 });
    expect(await waitForFreshRenderedRenewalDesk(expired.page, 60_000)).toBe(false);
    expect(expired.reload).toHaveBeenCalledTimes(1);
    vi.setSystemTime(0);
    const failed = fixture([pending, fresh], { failReload: true });
    expect(await waitForFreshRenderedRenewalDesk(failed.page, 60_000)).toBe(false);
    expect(failed.reload).toHaveBeenCalledTimes(1);
  });
});
