import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { resolveEnvironmentDescriptor } from "@/lib/environment/descriptor";
import {
  LOCAL_REHEARSAL_ENV,
  buildLocalRehearsalEnv,
  buildLocalRehearsalLaunchPlan,
  main,
  mirrorChildExit,
} from "@/scripts/run-local-rehearsal.mjs";

const PACKAGE_JSON = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);

function fakeChild() {
  const child = new EventEmitter();
  child.kill = vi.fn(() => true);
  return child;
}

function fakeProcessTarget() {
  const target = new EventEmitter();
  target.pid = 1234;
  target.kill = vi.fn();
  target.exitCode = undefined;
  return target;
}

describe("S56 local rehearsal launcher (AC-S56-6)", () => {
  it("makes npm run dev the explicit local rehearsal entry point", () => {
    expect(PACKAGE_JSON.scripts.dev).toBe("node scripts/run-local-rehearsal.mjs");
  });

  it("overlays the exact Demo + Live-read-only values over hostile ambient values", () => {
    const env = buildLocalRehearsalEnv({
      ASK_DEMO_MODE: "true",
      DATA_CONTEXT: "live",
      ENVIRONMENT_KIND: "production",
      LOCAL_DEMO_AUTH: "false",
      SPEECH_PROVIDER: "google",
      PRESERVED_VALUE: "unchanged",
    });

    expect(LOCAL_REHEARSAL_ENV).toEqual({
      ASK_DEMO_MODE: "false",
      DATA_CONTEXT: "live_readonly",
      ENVIRONMENT_KIND: "demo",
      LOCAL_DEMO_AUTH: "true",
      SPEECH_PROVIDER: "stub",
    });
    expect(env).toMatchObject({
      ...LOCAL_REHEARSAL_ENV,
      PRESERVED_VALUE: "unchanged",
    });
    expect(resolveEnvironmentDescriptor(env)).toEqual({
      ok: true,
      descriptor: {
        dataContext: "live_readonly",
        environmentKind: "demo",
        source: "explicit",
      },
    });
  });

  it("passes every CLI argument to next dev and does not invoke a shell", () => {
    const plan = buildLocalRehearsalLaunchPlan({
      argv: ["--hostname", "127.0.0.1", "--port=4010"],
      baseEnv: { KEEP_ME: "yes" },
      cwd: "/workspace",
      execPath: "/node",
      nextBin: "/workspace/node_modules/next/dist/bin/next",
    });

    expect(plan).toEqual({
      args: [
        "/workspace/node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port=4010",
      ],
      command: "/node",
      options: {
        cwd: "/workspace",
        env: { KEEP_ME: "yes", ...LOCAL_REHEARSAL_ENV },
        shell: false,
        stdio: "inherit",
        windowsHide: true,
      },
    });
  });

  it("forwards termination signals, removes listeners, and returns the child result", async () => {
    const child = fakeChild();
    const processTarget = fakeProcessTarget();
    const spawnFn = vi.fn(() => child);
    const resultPromise = main(
      ["--port=4020"],
      { ORIGINAL: "value" },
      {
        cwd: "/repo",
        execPath: "/node",
        nextBin: "/repo/node_modules/next/dist/bin/next",
        processTarget,
        spawnFn,
      },
    );

    processTarget.emit("SIGTERM");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");

    child.emit("exit", null, "SIGTERM");
    await expect(resultPromise).resolves.toEqual({ code: null, signal: "SIGTERM" });
    expect(processTarget.listenerCount("SIGINT")).toBe(0);
    expect(processTarget.listenerCount("SIGTERM")).toBe(0);
    expect(processTarget.listenerCount("SIGHUP")).toBe(0);
    expect(spawnFn).toHaveBeenCalledWith(
      "/node",
      ["/repo/node_modules/next/dist/bin/next", "dev", "--port=4020"],
      expect.objectContaining({ env: expect.objectContaining(LOCAL_REHEARSAL_ENV) }),
    );
  });

  it("mirrors numeric exits and signal exits without converting one into the other", () => {
    const numericTarget = fakeProcessTarget();
    mirrorChildExit({ code: 23, signal: null }, numericTarget);
    expect(numericTarget.exitCode).toBe(23);
    expect(numericTarget.kill).not.toHaveBeenCalled();

    const signalTarget = fakeProcessTarget();
    mirrorChildExit({ code: null, signal: "SIGINT" }, signalTarget);
    expect(signalTarget.exitCode).toBeUndefined();
    expect(signalTarget.kill).toHaveBeenCalledWith(1234, "SIGINT");
  });

  it("fails if next cannot be spawned and does not leak signal listeners", async () => {
    const child = fakeChild();
    const processTarget = fakeProcessTarget();
    const resultPromise = main(
      [],
      {},
      {
        processTarget,
        spawnFn: () => child,
      },
    );

    child.emit("error", new Error("next executable missing"));
    await expect(resultPromise).rejects.toThrow("next executable missing");
    expect(processTarget.listenerCount("SIGINT")).toBe(0);
    expect(processTarget.listenerCount("SIGTERM")).toBe(0);
    expect(processTarget.listenerCount("SIGHUP")).toBe(0);
  });
});
