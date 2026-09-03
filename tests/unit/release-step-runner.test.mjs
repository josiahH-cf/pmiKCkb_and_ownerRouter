import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import {
  RELEASE_STEP_TIMEOUT_MS,
  RELEASE_TREE_TERMINATION_TIMEOUT_MS,
  run,
  terminateReleaseProcessTree,
} from "@/scripts/release.mjs";

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
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null);
    await assertion;
    vi.useRealTimers();
  });

  it("reports a nonzero exit as a failure rather than hanging", async () => {
    const child = fakeChild();
    const promise = run("gcloud", ["describe"], { spawnFn: () => child });
    child.emit("close", 1);

    await expect(promise).rejects.toThrow(/exited with code 1/);
  });

  it("does not settle the timeout until the killed child has closed", async () => {
    vi.useFakeTimers();
    const child = fakeChild();

    const promise = run("gcloud", ["deploy"], { timeoutMs: 500, spawnFn: () => child });
    let settled = false;
    void promise.then(
      () => (settled = true),
      () => (settled = true),
    );
    const assertion = expect(promise).rejects.toThrow(/produced no result within/);
    vi.advanceTimersByTime(501);
    await Promise.resolve();
    expect(settled).toBe(false);
    child.emit("close", null);
    await assertion;
    expect(settled).toBe(true);

    vi.useRealTimers();
  });

  it("kills the POSIX process group rather than only its shell", async () => {
    const child = fakeChild();
    child.pid = 4242;
    const killProcess = vi.fn();
    const termination = terminateReleaseProcessTree(child, {
      platform: "linux",
      killProcess,
      timeoutMs: 1000,
    });
    expect(killProcess).toHaveBeenCalledWith(-4242, "SIGKILL");
    expect(child.kill).not.toHaveBeenCalled();
    child.emit("close", null);
    await expect(termination).resolves.toBeUndefined();
  });

  it("uses Windows taskkill tree mode and waits for its result", async () => {
    const child = fakeChild();
    child.pid = 4242;
    const treeKiller = fakeChild();
    const spawnTreeKiller = vi.fn(() => treeKiller);
    const termination = terminateReleaseProcessTree(child, {
      platform: "win32",
      spawnTreeKiller,
      timeoutMs: 1000,
    });
    expect(spawnTreeKiller).toHaveBeenCalledWith(
      "taskkill",
      ["/PID", "4242", "/T", "/F"],
      expect.objectContaining({ shell: false }),
    );
    treeKiller.emit("close", 0);
    await expect(termination).resolves.toBeUndefined();
  });

  it("bounds process-tree termination when the child never confirms close", async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    child.pid = 4242;
    const termination = terminateReleaseProcessTree(child, {
      platform: "linux",
      killProcess: vi.fn(),
      timeoutMs: 500,
    });
    const assertion = expect(termination).rejects.toThrow(
      "release_process_tree_termination_unconfirmed",
    );
    vi.advanceTimersByTime(501);
    await assertion;
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    vi.useRealTimers();
  });

  it("bounds every step by default", () => {
    expect(RELEASE_STEP_TIMEOUT_MS).toBeGreaterThan(0);
    expect(RELEASE_STEP_TIMEOUT_MS).toBeLessThanOrEqual(60 * 60 * 1000);
    expect(RELEASE_TREE_TERMINATION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(RELEASE_TREE_TERMINATION_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});
