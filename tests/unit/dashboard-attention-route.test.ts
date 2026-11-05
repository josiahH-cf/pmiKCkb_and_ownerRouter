// S147 + litmus 2026-11-04: the Dashboard calls GET /api/dashboard/attention only for a person's
// explicit re-read (Try again, or the refresh after an inline Approve). That re-read waits, bounded
// and well inside the browser's 60 s wait, for a lease read already in flight, so Try again does not
// repeat the stale answer it replaces. The Dashboard's first render calls the gather without it.
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gather: vi.fn(),
  requireCapability: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireCapability: mocks.requireCapability }));
vi.mock("@/lib/attention/attention-queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/attention/attention-queue")>()),
  gatherAttentionQueue: mocks.gather,
}));

import { GET } from "@/app/api/dashboard/attention/route";
import { ATTENTION_REREAD_LEASE_WAIT_MS } from "@/lib/attention/attention-queue";

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/dashboard/attention", () => {
  it("re-reads with a bounded wait for an in-flight lease refresh", async () => {
    const user = { uid: "editor-1", role: "Editor" };
    mocks.requireCapability.mockResolvedValue(user);
    mocks.gather.mockResolvedValue({
      state: "ok",
      rows: [],
      unavailableFeeds: [],
      seeAllHref: "/approval-queue",
      checkedAtIso: "2026-11-05T12:00:00.000Z",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.requireCapability).toHaveBeenCalledWith("read");
    expect(mocks.gather).toHaveBeenCalledTimes(1);
    const [calledUser, dependencies, options] = mocks.gather.mock.calls[0];
    expect(calledUser).toBe(user);
    expect(dependencies).toBeUndefined();
    expect(options).toEqual({ awaitLeaseRefreshMs: ATTENTION_REREAD_LEASE_WAIT_MS });
    expect(ATTENTION_REREAD_LEASE_WAIT_MS).toBeGreaterThan(0);
    expect(ATTENTION_REREAD_LEASE_WAIT_MS).toBeLessThanOrEqual(30_000);
  });
});
