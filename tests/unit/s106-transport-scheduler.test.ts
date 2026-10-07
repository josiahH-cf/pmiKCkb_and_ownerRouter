// S106 ARCH-S106-3 / AC-S106-8 (fail-first): the production client really waits on a documented
// rejection, shares the 100-per-minute accounting across callers, bounds every wait, and never
// redispatches a mutating request whose outcome is unknown.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DotloopClient, DotloopClientError } from "@/lib/integrations/dotloop/client";
import {
  DotloopRequestScheduler,
  resetSharedDotloopRequestSchedulerForTests,
} from "@/lib/integrations/dotloop/request-scheduler";

function response(
  status: number,
  headers: Record<string, string> = {},
  body: unknown = {},
) {
  return { status, headers, json: async () => body };
}

const tokens = {
  accessToken: async () => "access-1",
  refresh: async () => null,
};

beforeEach(() => {
  resetSharedDotloopRequestSchedulerForTests();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("S106 rate handling waits real time (AC-S106-8)", () => {
  it("does not resend a rejected read until the provider's Retry-After has elapsed", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(429, { "retry-after": "2" }))
      .mockResolvedValue(
        response(200, {}, { data: [{ id: 1, name: "P", type: "INDIVIDUAL" }] }),
      );
    // The production construction: no injected sleep or scheduler.
    const client = new DotloopClient({ transport: { fetch }, tokens });
    const pending = client.listProfiles();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual([
      expect.objectContaining({ id: "1", type: "INDIVIDUAL" }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("makes every caller of the company connection observe one caller's back-off", async () => {
    vi.useFakeTimers();
    const first = vi.fn().mockResolvedValueOnce(response(429, { "retry-after": "5" }));
    first.mockResolvedValue(response(200, {}, { data: [] }));
    const second = vi.fn().mockResolvedValue(response(200, {}, { data: [] }));
    const a = new DotloopClient({ transport: { fetch: first }, tokens });
    const b = new DotloopClient({ transport: { fetch: second }, tokens });
    const pendingA = a.listProfiles();
    await vi.advanceTimersByTimeAsync(0);
    const pendingB = b.listProfiles();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(second).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_100);
    await Promise.all([pendingA, pendingB]);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("holds the next request when the provider reports an exhausted window", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          200,
          { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "3000" },
          { data: [] },
        ),
      )
      .mockResolvedValue(response(200, {}, { data: [] }));
    const client = new DotloopClient({ transport: { fetch }, tokens });
    await client.listProfiles();
    const next = client.listProfiles();
    await vi.advanceTimersByTimeAsync(2_900);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await next;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("counts requests against one shared local budget across callers", async () => {
    let now = 0;
    const slept: number[] = [];
    const scheduler = new DotloopRequestScheduler({
      budgetPerWindow: 2,
      maxWaitMs: 120_000,
      clock: {
        now: () => now,
        sleep: async (ms) => {
          slept.push(ms);
          now += ms;
        },
      },
    });
    const fetch = vi.fn().mockResolvedValue(response(200, {}, { data: [] }));
    const a = new DotloopClient({ transport: { fetch }, tokens, scheduler });
    const b = new DotloopClient({ transport: { fetch }, tokens, scheduler });
    await a.listProfiles();
    await b.listProfiles();
    expect(slept).toEqual([]);
    await a.listProfiles();
    expect(slept).toEqual([60_000]);
  });

  it("refuses a wait longer than its bound without sending anything", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(response(429, { "retry-after": "120" }));
    const client = new DotloopClient({ transport: { fetch }, tokens });
    await expect(client.listProfiles()).rejects.toMatchObject({ kind: "rate_limited" });
    expect(fetch).toHaveBeenCalledTimes(1);
    // The shared window now refuses other callers instead of blocking them for two minutes.
    const other = vi.fn();
    await expect(
      new DotloopClient({ transport: { fetch: other }, tokens }).getAccount(),
    ).rejects.toMatchObject({ kind: "rate_limited" });
    expect(other).not.toHaveBeenCalled();
  });

  it("never redispatches a create whose response was lost", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("socket closed"));
    const client = new DotloopClient({
      transport: { fetch },
      tokens,
      sleep: async () => undefined,
    });
    const error = await client
      .createLoop({
        profileId: "1",
        name: "Renewal",
        templateId: "2",
        transactionType: "LEASE_OFFER",
        status: "PRE_OFFER",
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DotloopClientError);
    expect((error as DotloopClientError).kind).toBe("uncertain");
    expect(fetch).toHaveBeenCalledTimes(1);

    const serverError = vi.fn().mockResolvedValue(response(502));
    await expect(
      new DotloopClient({
        transport: { fetch: serverError },
        tokens,
        sleep: async () => undefined,
      }).createFolder({ profileId: "1", loopId: "2", name: "Renewal packet" }),
    ).rejects.toMatchObject({ kind: "uncertain" });
    expect(serverError).toHaveBeenCalledTimes(1);
  });
});
