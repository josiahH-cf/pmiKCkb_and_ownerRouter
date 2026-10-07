import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { PredecessorExceptionObserver } from "../../lib/production-assurance/predecessor-exception-observer";
import {
  canaryWarmUpRequired,
  warmUpCanaryTarget,
  warmUpVersionRead,
} from "../../scripts/run-production-canary";

const ORIGIN = "https://cand-r123---pmi-kc-app-hash-uc.a.run.app";
const NOW = 1_000_000;

function fakeContext(goto: () => Promise<null> = async () => null) {
  const page = { goto: vi.fn(goto), close: vi.fn(async () => undefined) };
  return { page, context: { newPage: vi.fn(async () => page) } };
}

describe("canary warm-up before checks of a possibly cold revision", () => {
  it("warms every check except the post-promotion observation and the approved exception", () => {
    expect(canaryWarmUpRequired({})).toBe(true);
    expect(canaryWarmUpRequired({ phase: "candidate" })).toBe(true);
    expect(canaryWarmUpRequired({ phase: "recovery_preparation" })).toBe(true);
    expect(canaryWarmUpRequired({ phase: "rollback" })).toBe(true);
    // The observation's first checkpoint must start within its one-minute grace.
    expect(canaryWarmUpRequired({ phase: "post_promotion" })).toBe(false);
    // The approved predecessor exception attributes every blocked request to one measured route.
    expect(
      canaryWarmUpRequired({
        phase: "rollback",
        predecessorExceptionObserver: new PredecessorExceptionObserver(),
      }),
    ).toBe(false);
  });

  it("loads the Dashboard once, unmeasured, and closes the page", async () => {
    const { page, context } = fakeContext();
    await expect(
      warmUpCanaryTarget(context, ORIGIN, NOW + 30 * 60_000, NOW),
    ).resolves.toBe(true);
    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledWith(`${ORIGIN}/`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it("decides nothing: a failed or slow load is discarded and the page still closes", async () => {
    const { page, context } = fakeContext(async () => {
      throw new Error("page.goto: Timeout 90000ms exceeded.");
    });
    await expect(
      warmUpCanaryTarget(context, ORIGIN, NOW + 30 * 60_000, NOW),
    ).resolves.toBe(true);
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it("keeps five minutes for the measured routes and never starts inside them", async () => {
    const tight = fakeContext();
    await warmUpCanaryTarget(tight.context, ORIGIN, NOW + 5 * 60_000 + 20_000, NOW);
    expect(tight.page.goto).toHaveBeenCalledWith(`${ORIGIN}/`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });

    const reserved = fakeContext();
    await expect(
      warmUpCanaryTarget(reserved.context, ORIGIN, NOW + 5 * 60_000, NOW),
    ).resolves.toBe(false);
    expect(reserved.context.newPage).not.toHaveBeenCalled();
  });

  it("reads the version once with a GET, discards the body, and ignores a failure", async () => {
    const cancel = vi.fn(async () => undefined);
    const fetchFn = vi.fn(
      async () => ({ body: { cancel } }) as unknown as Response,
    ) as unknown as typeof fetch;
    await expect(
      warmUpVersionRead(ORIGIN, NOW + 30 * 60_000, undefined, { fetchFn, nowMs: NOW }),
    ).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      `${ORIGIN}/api/version`,
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
    expect(cancel).toHaveBeenCalledTimes(1);

    const failing = vi.fn(async () => {
      throw new Error("The operation was aborted due to timeout");
    }) as unknown as typeof fetch;
    await expect(
      warmUpVersionRead(ORIGIN, NOW + 30 * 60_000, undefined, {
        fetchFn: failing,
        nowMs: NOW,
      }),
    ).resolves.toBe(true);

    const reserved = vi.fn() as unknown as typeof fetch;
    await expect(
      warmUpVersionRead(ORIGIN, NOW + 5 * 60_000, undefined, {
        fetchFn: reserved,
        nowMs: NOW,
      }),
    ).resolves.toBe(false);
    expect(reserved).not.toHaveBeenCalled();
  });

  it("stops the version warm-up when the run's own deadline aborts", async () => {
    const controller = new AbortController();
    controller.abort(new Error("assurance_deadline_exceeded"));
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new Error("aborted");
      return {} as Response;
    }) as unknown as typeof fetch;
    await expect(
      warmUpVersionRead(ORIGIN, NOW + 30 * 60_000, controller.signal, {
        fetchFn,
        nowMs: NOW,
      }),
    ).resolves.toBe(true);
    const [, init] = vi.mocked(fetchFn).mock.calls[0];
    expect(init?.signal?.aborted).toBe(true);
  });

  it("runs both warm-ups before their bounded reads, the Dashboard inside the guarded context", () => {
    const source = readFileSync("scripts/run-production-canary.ts", "utf8");
    const body = source.slice(
      source.indexOf("async function runProductionCanaryWithin("),
    );
    const gated = body.indexOf("const warmUp = canaryWarmUpRequired(options);");
    const versionWarmUp = body.indexOf(
      "if (warmUp) await warmUpVersionRead(options.origin, deadlineAtMs, abortSignal);",
    );
    const identity = body.indexOf("verifyExactVersion(options, abortSignal)");
    const launched = body.indexOf("launchGuardedManagedBrowser(");
    const dashboardWarmUp = body.indexOf(
      "if (warmUp) await warmUpCanaryTarget(context, options.origin, deadlineAtMs);",
    );
    const measured = body.indexOf("routes = await readCanaryRoutes(");
    expect(gated).toBeGreaterThan(0);
    expect(versionWarmUp).toBeGreaterThan(gated);
    expect(identity).toBeGreaterThan(versionWarmUp);
    expect(launched).toBeGreaterThan(identity);
    expect(dashboardWarmUp).toBeGreaterThan(launched);
    expect(measured).toBeGreaterThan(dashboardWarmUp);
    expect(source.match(/warmUpCanaryTarget\(context/g)).toHaveLength(1);

    const observe = readFileSync("scripts/observe-production-release.ts", "utf8");
    const baseline = observe.slice(
      observe.indexOf("async function capturePredecessorBaseline("),
    );
    const baselineWarmUp = baseline.indexOf(
      "await warmUpVersionRead(input.canonicalOrigin, input.deadlineAtMs, input.abortSignal);",
    );
    expect(baselineWarmUp).toBeGreaterThan(0);
    expect(baseline.indexOf("readProductionVersionIdentity(")).toBeGreaterThan(
      baselineWarmUp,
    );
  });
});
