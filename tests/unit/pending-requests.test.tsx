// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenewalMessagePreparation } from "@/components/lease-renewal/RenewalMessagePreparation";
import {
  createPendingRequestTracker,
  PendingRequestDrainError,
} from "../helpers/pending-requests";

vi.mock("@/components/lease-renewal/RenewalManualWorkspace", () => ({
  useRenewalManualWorkspace: () => ({
    leaseId: "701",
    state: {
      cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
      revision: 1,
      termsRevision: 1,
      preparation: null,
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("pending test request ownership", () => {
  it("preserves the original promise and blocks fixture reset until it settles", async () => {
    const tracker = createPendingRequestTracker();
    const request = deferred<string>();
    const reset = vi.fn(() => "reset complete");
    expect(tracker.track(request.promise)).toBe(request.promise);
    const cleanup = tracker.runAfterDrain(reset, 1_000);
    await Promise.resolve();
    expect(reset).not.toHaveBeenCalled();
    expect(tracker.snapshot()).toEqual({
      started: 1,
      fulfilled: 0,
      rejected: 0,
      pending: 1,
    });
    request.resolve("response");
    await expect(cleanup).resolves.toBe("reset complete");
    await expect(request.promise).resolves.toBe("response");
    expect(reset).toHaveBeenCalledTimes(1);
    expect(tracker.snapshot()).toEqual({
      started: 1,
      fulfilled: 1,
      rejected: 0,
      pending: 0,
    });
  });

  it("also drains requests issued by an in-flight route while cleanup is waiting", async () => {
    const tracker = createPendingRequestTracker();
    const first = deferred<void>();
    const nested = deferred<void>();
    const reset = vi.fn();
    tracker.track(
      first.promise.then(() => {
        tracker.track(nested.promise);
      }),
    );
    const cleanup = tracker.runAfterDrain(reset, 1_000);
    first.resolve();
    await first.promise;
    await Promise.resolve();
    expect(reset).not.toHaveBeenCalled();
    expect(tracker.snapshot().pending).toBe(1);
    nested.resolve();
    await cleanup;
    expect(reset).toHaveBeenCalledTimes(1);
    expect(tracker.snapshot()).toEqual({
      started: 2,
      fulfilled: 2,
      rejected: 0,
      pending: 0,
    });
  });

  it("rechecks a request registered between an empty drain and reset using the original deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const tracker = createPendingRequestTracker();
    const late = deferred<void>();
    const reset = vi.fn();
    const cleanup = tracker.runAfterDrain(reset, 20);
    // runAfterDrain has already observed an empty set, but its await continuation has
    // not run. Simulate another request continuation registering work in that gap.
    vi.advanceTimersByTime(15);
    tracker.track(late.promise);
    const refusal = expect(cleanup).rejects.toMatchObject({
      name: "PendingRequestDrainError",
      pendingCount: 1,
    });
    await Promise.resolve();
    expect(reset).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5);
    await refusal;
    expect(reset).not.toHaveBeenCalled();
    late.resolve();
    await late.promise;
    await tracker.drain(20);
    expect(reset).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuses reset on timeout and keeps the survivor owned until its actual completion", async () => {
    vi.useFakeTimers();
    const tracker = createPendingRequestTracker();
    const request = deferred<void>();
    const reset = vi.fn();
    tracker.track(request.promise);
    const cleanup = tracker.runAfterDrain(reset, 20);
    const refusal = expect(cleanup).rejects.toMatchObject({
      name: "PendingRequestDrainError",
      pendingCount: 1,
    });
    await vi.advanceTimersByTimeAsync(20);
    await refusal;
    expect(reset).not.toHaveBeenCalled();
    expect(tracker.snapshot().pending).toBe(1);
    request.resolve();
    await request.promise;
    await Promise.resolve();
    expect(reset).not.toHaveBeenCalled();
    expect(tracker.snapshot().pending).toBe(0);
    await tracker.runAfterDrain(reset, 20);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains a rejection that settled before drain without replacing it or leaking a rejecting derivative", async () => {
    const tracker = createPendingRequestTracker();
    const failure = new Error("Synthetic route failure");
    const request = Promise.reject(failure);
    expect(tracker.track(request)).toBe(request);
    await expect(request).rejects.toBe(failure);
    await expect(tracker.drain(1_000)).resolves.toEqual({
      started: 1,
      fulfilled: 0,
      rejected: 1,
      pending: 0,
    });
    const reset = vi.fn();
    await tracker.runAfterDrain(reset, 1_000);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(tracker.snapshot().rejected).toBe(1);
  });

  it("rejects an invalid drain budget before invoking a reset", async () => {
    const tracker = createPendingRequestTracker();
    const reset = vi.fn();
    await expect(tracker.runAfterDrain(reset, Infinity)).rejects.toThrow(
      "positive bounded timeout",
    );
    expect(reset).not.toHaveBeenCalled();
    expect(new PendingRequestDrainError(2).pendingCount).toBe(2);
  });

  it("drains the real mounted message component's deferred GET and clone parse after unmount", async () => {
    const tracker = createPendingRequestTracker();
    const route = deferred<Response>();
    const clone = deferred<void>();
    const events: string[] = [];
    const fetch = vi.fn((input: string) => {
      expect(input).toBe(
        "/api/lease-renewal/message-preparation?leaseId=701&channel=tenant",
      );
      return tracker.track(
        (async () => {
          const response = await route.promise;
          events.push("route_returned");
          await clone.promise;
          await response.clone().json();
          events.push("clone_completed");
          return response;
        })(),
      );
    });
    vi.stubGlobal("fetch", fetch);
    const mounted = render(<RenewalMessagePreparation channel="tenant" canEdit />);
    expect(fetch).toHaveBeenCalledTimes(1);
    mounted.unmount();
    const reset = vi.fn(() => events.push("fixture_reset"));
    const cleanup = tracker.runAfterDrain(reset, 1_000);
    await Promise.resolve();
    expect(reset).not.toHaveBeenCalled();
    route.resolve(
      Response.json({ error: "Synthetic unavailable source" }, { status: 503 }),
    );
    await route.promise;
    await Promise.resolve();
    expect(events).toEqual(["route_returned"]);
    expect(reset).not.toHaveBeenCalled();
    clone.resolve();
    await cleanup;
    expect(events).toEqual(["route_returned", "clone_completed", "fixture_reset"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(tracker.snapshot()).toEqual({
      started: 1,
      fulfilled: 1,
      rejected: 0,
      pending: 0,
    });
  });
});
