import { describe, expect, it, vi } from "vitest";

import {
  closeGuardedManagedBrowser,
  forceCloseGuardedManagedBrowser,
  GUARDED_BROWSER_BACKGROUND_ARGS,
  launchGuardedManagedBrowser,
  withAssuranceTimeout,
  type GuardedBrowserRoute,
  type GuardedManagedBrowserContext,
  type GuardedManagedBrowserLaunchOptions,
} from "@/lib/production-assurance";

interface FakeContext extends GuardedManagedBrowserContext {
  handler: ((route: GuardedBrowserRoute) => Promise<void>) | null;
}

function fakeContext(
  events: string[],
  options: {
    readonly workers?: readonly unknown[];
    readonly routeFails?: boolean;
    readonly closeWaitsFor?: Promise<unknown>;
  } = {},
): FakeContext {
  const context: FakeContext = {
    handler: null,
    async route(_pattern, handler) {
      events.push("route");
      if (options.routeFails) throw new Error("route_failed");
      context.handler = handler;
    },
    pages() {
      events.push("pages");
      return [
        {
          async close() {
            events.push("close_bootstrap");
          },
        },
      ];
    },
    serviceWorkers() {
      events.push("workers");
      return options.workers ?? [];
    },
    browser() {
      return {
        async close() {
          events.push("force_close_browser");
        },
      };
    },
    async setOffline(offline) {
      events.push(`offline:${String(offline)}`);
    },
    async close() {
      events.push("close_context");
      await options.closeWaitsFor;
    },
  };
  return context;
}

function fakeRoute(method: string) {
  return {
    route: {
      request: () => ({ method: () => method }),
      abort: vi.fn(async () => undefined),
      continue: vi.fn(async () => undefined),
    } satisfies GuardedBrowserRoute,
  };
}

describe("offline-first managed assurance browser", () => {
  it("arms the firewall and rejects workers before bringing the context online", async () => {
    const events: string[] = [];
    const context = fakeContext(events);
    const captured: { options?: GuardedManagedBrowserLaunchOptions } = {};
    const result = await launchGuardedManagedBrowser({
      profile: "/outside/managed-admin",
      executablePath: "/browser",
      headless: true,
      viewport: { width: 1440, height: 1000 },
      launchTimeoutMs: 12_345,
      onMutationAttempt: vi.fn(),
      launchPersistentContext: async (_profile, options) => {
        events.push("launch");
        captured.options = options;
        return context;
      },
    });

    expect(result).toBe(context);
    expect(events).toEqual([
      "launch",
      "route",
      "pages",
      "close_bootstrap",
      "workers",
      "offline:false",
    ]);
    expect(captured.options).toMatchObject({
      executablePath: "/browser",
      headless: true,
      offline: true,
      serviceWorkers: "block",
      timeout: 12_345,
      viewport: { width: 1440, height: 1000 },
    });
    expect(captured.options?.args).toEqual([...GUARDED_BROWSER_BACKGROUND_ARGS]);
  });

  it("continues GET/HEAD and aborts every other method", async () => {
    const events: string[] = [];
    const context = fakeContext(events);
    const onMutationAttempt = vi.fn();
    await launchGuardedManagedBrowser({
      profile: "/outside/managed-editor",
      executablePath: "/browser",
      headless: true,
      viewport: { width: 1440, height: 1000 },
      launchTimeoutMs: 12_345,
      onMutationAttempt,
      launchPersistentContext: async () => context,
    });

    for (const method of ["GET", " head "]) {
      const { route } = fakeRoute(method);
      await context.handler?.(route);
      expect(route.continue).toHaveBeenCalledOnce();
      expect(route.abort).not.toHaveBeenCalled();
    }
    for (const method of ["POST", "PATCH", "PUT", "DELETE", "OPTIONS"]) {
      const { route } = fakeRoute(method);
      await context.handler?.(route);
      expect(route.abort).toHaveBeenCalledWith("blockedbyclient");
      expect(route.continue).not.toHaveBeenCalled();
    }
    expect(onMutationAttempt).toHaveBeenCalledTimes(5);
  });

  it("still aborts when the diagnostic callback throws", async () => {
    const context = fakeContext([]);
    await launchGuardedManagedBrowser({
      profile: "/outside/managed-admin",
      executablePath: "/browser",
      headless: true,
      viewport: { width: 1440, height: 1000 },
      launchTimeoutMs: 12_345,
      onMutationAttempt: () => {
        throw new Error("diagnostic_failed");
      },
      launchPersistentContext: async () => context,
    });
    const { route } = fakeRoute("POST");
    await expect(context.handler?.(route)).rejects.toThrow("diagnostic_failed");
    expect(route.abort).toHaveBeenCalledWith("blockedbyclient");
  });

  it("never goes online when a worker survives startup", async () => {
    const events: string[] = [];
    const context = fakeContext(events, { workers: [{}] });
    await expect(
      launchGuardedManagedBrowser({
        profile: "/outside/managed-admin",
        executablePath: "/browser",
        headless: true,
        viewport: { width: 1440, height: 1000 },
        launchTimeoutMs: 12_345,
        onMutationAttempt: vi.fn(),
        launchPersistentContext: async () => context,
      }),
    ).rejects.toThrow("managed_browser_service_worker_present");
    expect(events).not.toContain("offline:false");
    expect(events.at(-1)).toBe("close_context");
  });

  it("closes the still-offline context when firewall installation fails", async () => {
    const events: string[] = [];
    const context = fakeContext(events, { routeFails: true });
    await expect(
      launchGuardedManagedBrowser({
        profile: "/outside/managed-admin",
        executablePath: "/browser",
        headless: true,
        viewport: { width: 1440, height: 1000 },
        launchTimeoutMs: 12_345,
        onMutationAttempt: vi.fn(),
        launchPersistentContext: async () => context,
      }),
    ).rejects.toThrow("route_failed");
    expect(events).toEqual(["route", "close_context"]);
  });

  it("closes a browser that finishes launching after the shared deadline aborts", async () => {
    const events: string[] = [];
    const context = fakeContext(events);
    const controller = new AbortController();
    let finishLaunch!: (context: FakeContext) => void;
    const launched = new Promise<FakeContext>((resolve) => {
      finishLaunch = resolve;
    });
    const result = launchGuardedManagedBrowser({
      profile: "/outside/managed-admin",
      executablePath: "/browser",
      headless: true,
      viewport: { width: 1440, height: 1000 },
      launchTimeoutMs: 12_345,
      abortSignal: controller.signal,
      onMutationAttempt: vi.fn(),
      launchPersistentContext: async () => launched,
    });
    controller.abort();
    finishLaunch(context);

    const outcome = result.then(
      () => new Error("unexpected_success"),
      (error: unknown) => error,
    );
    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("assurance_deadline_exceeded");
    expect(events).toEqual(["force_close_browser"]);
  });

  it("arms abort handling before invoking Playwright", async () => {
    const events: string[] = [];
    const context = fakeContext(events);
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, "addEventListener");

    const result = await launchGuardedManagedBrowser({
      profile: "/outside/managed-admin",
      executablePath: "/browser",
      headless: true,
      viewport: { width: 1440, height: 1000 },
      launchTimeoutMs: 12_345,
      abortSignal: controller.signal,
      onMutationAttempt: vi.fn(),
      launchPersistentContext: async () => {
        expect(addListener).toHaveBeenCalledWith("abort", expect.any(Function), {
          once: true,
        });
        return context;
      },
    });

    await closeGuardedManagedBrowser(result);
  });

  it("detaches the deadline listener and closes a returned context exactly once", async () => {
    const events: string[] = [];
    const context = fakeContext(events);
    const controller = new AbortController();
    const result = await launchGuardedManagedBrowser({
      profile: "/outside/managed-admin",
      executablePath: "/browser",
      headless: true,
      viewport: { width: 1440, height: 1000 },
      launchTimeoutMs: 12_345,
      abortSignal: controller.signal,
      onMutationAttempt: vi.fn(),
      launchPersistentContext: async () => context,
    });

    await closeGuardedManagedBrowser(result);
    controller.abort();
    await Promise.resolve();
    expect(events.filter((event) => event === "close_context")).toHaveLength(1);
  });

  it("force-quits instead of awaiting the same stalled graceful close promise", async () => {
    const events: string[] = [];
    const neverCloses = new Promise<never>(() => undefined);
    const context = fakeContext(events, { closeWaitsFor: neverCloses });
    const result = await launchGuardedManagedBrowser({
      profile: "/outside/managed-admin",
      executablePath: "/browser",
      headless: true,
      viewport: { width: 1440, height: 1000 },
      launchTimeoutMs: 12_345,
      onMutationAttempt: vi.fn(),
      launchPersistentContext: async () => context,
    });

    vi.useFakeTimers();
    try {
      const closing = withAssuranceTimeout(
        () => closeGuardedManagedBrowser(result),
        "canary_context_close_timeout",
        25,
        { onTimeout: () => forceCloseGuardedManagedBrowser(result) },
      );
      const rejection = expect(closing).rejects.toThrow("canary_context_close_timeout");
      await vi.advanceTimersByTimeAsync(25);
      await rejection;
      expect(events.slice(-2)).toEqual(["close_context", "force_close_browser"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses an exhausted launch budget before invoking Playwright", async () => {
    const launchPersistentContext = vi.fn(async () => fakeContext([]));
    await expect(
      launchGuardedManagedBrowser({
        profile: "/outside/managed-admin",
        executablePath: "/browser",
        headless: true,
        viewport: { width: 1440, height: 1000 },
        launchTimeoutMs: 0,
        onMutationAttempt: vi.fn(),
        launchPersistentContext,
      }),
    ).rejects.toThrow("assurance_deadline_exceeded");
    expect(launchPersistentContext).not.toHaveBeenCalled();
  });

  it("refuses an already-aborted run before invoking Playwright", async () => {
    const controller = new AbortController();
    controller.abort();
    const launchPersistentContext = vi.fn(async () => fakeContext([]));
    await expect(
      launchGuardedManagedBrowser({
        profile: "/outside/managed-admin",
        executablePath: "/browser",
        headless: true,
        viewport: { width: 1440, height: 1000 },
        launchTimeoutMs: 12_345,
        abortSignal: controller.signal,
        onMutationAttempt: vi.fn(),
        launchPersistentContext,
      }),
    ).rejects.toThrow("assurance_deadline_exceeded");
    expect(launchPersistentContext).not.toHaveBeenCalled();
  });
});
