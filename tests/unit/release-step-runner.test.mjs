import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { RELEASE_STEP_TIMEOUT_MS, run } from "@/scripts/release.mjs";

/**
 * Regression cover for the 2026-08-01 cutover hang: a real release run sat for 89 minutes with zero
 * output while the same `gcloud` invocation errors in under a second when run directly. The cause
 * was an INHERITED stdin, which in an unattended or backgrounded run is a handle that never delivers
 * EOF, so any provider prompt blocks forever.
 *
 * The dangerous property is not slowness. It is that "no output" is indistinguishable from
 * "working", so an operator reads a dead deploy as a progressing one. These tests pin the two
 * properties that make a step fail instead of wait.
 */

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe("release step runner never waits on input", () => {
  it("ignores stdin rather than inheriting it", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child);

    const promise = run("gcloud", ["run", "services", "list"], { spawnFn });
    child.emit("close", 0);
    await promise;

    const { stdio } = spawnFn.mock.calls[0][2];
    // stdin MUST be "ignore". Inheriting it is what allowed the 89-minute hang.
    expect(stdio[0]).toBe("ignore");
    expect(stdio[0]).not.toBe("inherit");
  });

  it("still captures stdout when asked, without opening stdin", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child);

    const promise = run("gcloud", ["describe"], { capture: true, spawnFn });
    child.stdout.emit("data", "  rev-abc  ");
    child.emit("close", 0);

    expect(await promise).toBe("rev-abc");
    const { stdio } = spawnFn.mock.calls[0][2];
    expect(stdio).toEqual(["ignore", "pipe", "inherit"]);
  });

  it("kills a step that produces no result and names it as a hang", async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const spawnFn = vi.fn(() => child);

    const promise = run("gcloud", ["run", "deploy"], { timeoutMs: 1000, spawnFn });
    const assertion = expect(promise).rejects.toThrow(/produced no result within/);
    vi.advanceTimersByTime(1001);
    await assertion;

    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    vi.useRealTimers();
  });

  it("reports a nonzero exit as a failure rather than hanging", async () => {
    const child = fakeChild();
    const promise = run("gcloud", ["describe"], { spawnFn: () => child });
    child.emit("close", 1);

    await expect(promise).rejects.toThrow(/exited with code 1/);
  });

  it("cannot settle twice when a close follows a timeout", async () => {
    vi.useFakeTimers();
    const child = fakeChild();

    const promise = run("gcloud", ["deploy"], { timeoutMs: 500, spawnFn: () => child });
    const assertion = expect(promise).rejects.toThrow(/produced no result within/);
    vi.advanceTimersByTime(501);
    // A killed child still emits close; the first settlement must win.
    child.emit("close", 0);
    await assertion;

    vi.useRealTimers();
  });

  it("bounds every step by default", () => {
    expect(RELEASE_STEP_TIMEOUT_MS).toBeGreaterThan(0);
    expect(RELEASE_STEP_TIMEOUT_MS).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});
