#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];

/**
 * The local rehearsal surface is intentionally not configurable by ambient shell values. Local
 * development inspects Live data through the Demo environment's read-only context, and uses local
 * auth without enabling the retired Demo/Test Ask adapter.
 */
export const LOCAL_REHEARSAL_ENV = Object.freeze({
  ASK_DEMO_MODE: "false",
  DATA_CONTEXT: "live_readonly",
  ENVIRONMENT_KIND: "demo",
  LOCAL_DEMO_AUTH: "true",
  // Voice capture remains useful for UI rehearsal without a cost-bearing external STT call.
  SPEECH_PROVIDER: "stub",
});

export function buildLocalRehearsalEnv(baseEnv = {}) {
  return { ...baseEnv, ...LOCAL_REHEARSAL_ENV };
}

/** Build the exact shell-free Next invocation so tests can inspect it without starting a server. */
export function buildLocalRehearsalLaunchPlan({
  argv = [],
  baseEnv = {},
  cwd = root,
  execPath = process.execPath,
  nextBin: resolvedNextBin = nextBin,
} = {}) {
  return {
    command: execPath,
    args: [resolvedNextBin, "dev", ...argv],
    options: {
      cwd,
      env: buildLocalRehearsalEnv(baseEnv),
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    },
  };
}

/**
 * Start Next and return its native exit result. Signal mirroring is separate so importing this
 * module in tests never signals the test process.
 */
export function main(argv = process.argv.slice(2), env = process.env, dependencies = {}) {
  const processTarget = dependencies.processTarget ?? process;
  const spawnFn = dependencies.spawnFn ?? spawn;
  const plan = buildLocalRehearsalLaunchPlan({
    argv,
    baseEnv: env,
    cwd: dependencies.cwd ?? root,
    execPath: dependencies.execPath ?? process.execPath,
    nextBin: dependencies.nextBin ?? nextBin,
  });
  const child = spawnFn(plan.command, plan.args, plan.options);

  return new Promise((resolve, reject) => {
    let settled = false;
    const signalHandlers = new Map();

    const cleanup = () => {
      for (const [signal, handler] of signalHandlers) {
        processTarget.off(signal, handler);
      }
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    for (const signal of FORWARDED_SIGNALS) {
      const handler = () => child.kill(signal);
      signalHandlers.set(signal, handler);
      processTarget.on(signal, handler);
    }

    child.once("error", (error) => finish(reject, error));
    child.once("exit", (code, signal) => finish(resolve, { code, signal }));
  });
}

/** Preserve a numeric exit code or re-raise the exact child signal in the wrapper process. */
export function mirrorChildExit({ code, signal }, processTarget = process) {
  if (signal) {
    processTarget.kill(processTarget.pid, signal);
    return;
  }

  processTarget.exitCode = Number.isInteger(code) ? code : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((result) => mirrorChildExit(result))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
