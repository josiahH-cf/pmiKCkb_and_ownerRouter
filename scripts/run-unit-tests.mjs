#!/usr/bin/env node

import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CACHE_VERSION = "v1";
const SHADOW_OVERRIDE = "PMIKC_TEST_SHADOW";
const KEEP_SHADOW = "PMIKC_TEST_KEEP_SHADOW";
const RUN_PREFIX = "pmi-kc-vitest-run-";
const CACHE_PREFIX = `pmi-kc-vitest-native-${CACHE_VERSION}`;
const INSTALL_WAIT_MS = 6 * 60 * 1_000;

function readProcVersion() {
  try {
    return readFileSync("/proc/version", "utf8");
  } catch {
    return "";
  }
}

export function recommendedWorkers(parallelism = availableParallelism()) {
  const usable = Math.max(1, Number(parallelism) - 1);
  return Math.min(8, usable);
}

export function shouldUseNativeShadow({
  platform = process.platform,
  cwd = ROOT,
  procVersion = readProcVersion(),
  env = process.env,
} = {}) {
  if (env[SHADOW_OVERRIDE] === "1") return true;
  if (env[SHADOW_OVERRIDE] === "0") return false;

  return (
    platform === "linux" &&
    /microsoft|wsl/i.test(procVersion) &&
    /^\/mnt\/[a-z](?:\/|$)/i.test(resolve(cwd))
  );
}

export function isSafeUntrackedPath(input) {
  const path = String(input).replaceAll("\\", "/").replace(/^\.\//, "");
  if (!path || isAbsolute(path) || path === ".." || path.startsWith("../")) {
    return false;
  }

  const blockedExact = new Set([".claude/settings.local.json"]);
  const blockedRoots = [
    ".git/",
    ".next/",
    "coverage/",
    "docs/client_docs/",
    "docs/context_and_calls/",
    "docs/temp/",
    "node_modules/",
    "output/",
    "secrets/",
    "temp/",
  ];

  return (
    !blockedExact.has(path) &&
    !path.startsWith(".env") &&
    !blockedRoots.some((root) => path.startsWith(root))
  );
}

function installRelevantPackageText(packageText) {
  try {
    const manifest = JSON.parse(String(packageText));
    return JSON.stringify({
      dependencies: manifest.dependencies ?? {},
      devDependencies: manifest.devDependencies ?? {},
      optionalDependencies: manifest.optionalDependencies ?? {},
      peerDependencies: manifest.peerDependencies ?? {},
      overrides: manifest.overrides ?? {},
      engines: manifest.engines ?? {},
      packageManager: manifest.packageManager ?? null,
    });
  } catch {
    return String(packageText);
  }
}

export function dependencyCacheKey({
  lockText,
  packageText,
  platform = process.platform,
  arch = process.arch,
  modules = process.versions.modules,
} = {}) {
  return createHash("sha256")
    .update(CACHE_VERSION)
    .update("\0")
    .update(platform)
    .update("\0")
    .update(arch)
    .update("\0")
    .update(String(modules))
    .update("\0")
    .update(installRelevantPackageText(packageText))
    .update("\0")
    .update(String(lockText))
    .digest("hex")
    .slice(0, 20);
}

function splitNull(text) {
  return String(text)
    .split("\0")
    .map((value) => value.trim())
    .filter(Boolean);
}

function gitOutput(args, cwd = ROOT) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${basename(command)} exited ${result.status ?? `from signal ${result.signal}`}.`,
    );
  }
  return result;
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function assertDescendant(parent, candidate) {
  const rel = relative(resolve(parent), resolve(candidate));
  if (
    !rel ||
    rel === ".." ||
    rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new Error(`Refusing an unsafe cache/worktree target: ${candidate}`);
  }
}

function removeExact(parent, candidate) {
  assertDescendant(parent, candidate);
  rmSync(candidate, { recursive: true, force: true });
}

function nativeRoot() {
  return shouldUseNativeShadow() ? "/tmp" : realpathSync(tmpdir());
}

function npmInvocation() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && existsSync(npmExecPath)) {
    return { command: process.execPath, prefix: [npmExecPath] };
  }
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    prefix: [],
  };
}

function dependenciesReady(dependencyRoot) {
  return (
    existsSync(join(dependencyRoot, ".ready")) &&
    existsSync(join(dependencyRoot, "node_modules", "vitest", "vitest.mjs"))
  );
}

function ensureDependencies(cacheRoot, tempRoot) {
  const packageText = readFileSync(join(ROOT, "package.json"), "utf8");
  const lockText = readFileSync(join(ROOT, "package-lock.json"), "utf8");
  const key = dependencyCacheKey({ packageText, lockText });
  const dependencyRoot = join(cacheRoot, `deps-${key}`);
  const lockRoot = `${dependencyRoot}.installing`;

  if (dependenciesReady(dependencyRoot)) return dependencyRoot;

  mkdirSync(cacheRoot, { recursive: true });
  let ownsLock = false;
  try {
    mkdirSync(lockRoot);
    ownsLock = true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  if (!ownsLock) {
    const started = Date.now();
    while (Date.now() - started < INSTALL_WAIT_MS) {
      if (dependenciesReady(dependencyRoot)) return dependencyRoot;
      sleep(500);
    }
    throw new Error("Timed out waiting for the native Vitest dependency cache.");
  }

  try {
    if (existsSync(dependencyRoot)) removeExact(cacheRoot, dependencyRoot);
    mkdirSync(dependencyRoot, { recursive: true });
    copyFileSync(join(ROOT, "package.json"), join(dependencyRoot, "package.json"));
    copyFileSync(
      join(ROOT, "package-lock.json"),
      join(dependencyRoot, "package-lock.json"),
    );

    console.log(`[unit-test] Preparing native dependency cache ${key}...`);
    const npm = npmInvocation();
    run(npm.command, [...npm.prefix, "ci", "--no-audit", "--no-fund"], {
      cwd: dependencyRoot,
      env: {
        ...process.env,
        TMPDIR: tempRoot,
        TMP: tempRoot,
        TEMP: tempRoot,
      },
    });
    writeFileSync(join(dependencyRoot, ".ready"), `${key}\n`, "utf8");
    return dependencyRoot;
  } catch (error) {
    if (existsSync(dependencyRoot)) removeExact(cacheRoot, dependencyRoot);
    throw error;
  } finally {
    if (existsSync(lockRoot)) removeExact(cacheRoot, lockRoot);
  }
}

function copyPaths(paths, targetRoot) {
  const unique = [...new Set(paths)].filter(Boolean);
  if (unique.length === 0) return;

  const rsync = spawnSync(
    "rsync",
    ["-a", "--from0", "--files-from=-", `${ROOT}/`, `${targetRoot}/`],
    {
      input: `${unique.join("\0")}\0`,
      stdio: ["pipe", "inherit", "inherit"],
    },
  );

  if (!rsync.error && rsync.status === 0) return;
  if (rsync.error && rsync.error.code !== "ENOENT") throw rsync.error;

  for (const path of unique) {
    const source = join(ROOT, path);
    const target = join(targetRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true, dereference: false, force: true });
  }
}

function overlayWorkingChanges(targetRoot) {
  const changed = splitNull(
    gitOutput([
      "diff",
      "--no-renames",
      "--name-only",
      "--diff-filter=ACMRTUXB",
      "-z",
      "HEAD",
      "--",
    ]),
  );
  const untracked = splitNull(
    gitOutput(["ls-files", "--others", "--exclude-standard", "-z"]),
  ).filter(isSafeUntrackedPath);
  copyPaths([...changed, ...untracked], targetRoot);

  const deleted = splitNull(
    gitOutput([
      "diff",
      "--no-renames",
      "--name-only",
      "--diff-filter=D",
      "-z",
      "HEAD",
      "--",
    ]),
  );
  for (const path of deleted) {
    const target = join(targetRoot, path);
    assertDescendant(targetRoot, target);
    rmSync(target, { recursive: true, force: true });
  }
}

function createShadow(tempRoot, dependencyRoot) {
  const runRoot = mkdtempSync(join(tempRoot, RUN_PREFIX));
  const worktreeRoot = join(runRoot, "worktree");
  let registered = false;

  try {
    run("git", ["worktree", "add", "--detach", "--force", worktreeRoot, "HEAD"], {
      cwd: ROOT,
    });
    registered = true;
    overlayWorkingChanges(worktreeRoot);
    symlinkSync(
      join(dependencyRoot, "node_modules"),
      join(worktreeRoot, "node_modules"),
      "dir",
    );
    return { runRoot, worktreeRoot };
  } catch (error) {
    if (registered) {
      spawnSync("git", ["worktree", "remove", "--force", worktreeRoot], {
        cwd: ROOT,
        stdio: "ignore",
      });
    }
    if (existsSync(runRoot)) removeExact(tempRoot, runRoot);
    throw error;
  }
}

function cleanupShadow(tempRoot, shadow) {
  if (!shadow) return;
  if (process.env[KEEP_SHADOW] === "1") {
    console.log(`[unit-test] Preserved native shadow at ${shadow.worktreeRoot}`);
    return;
  }

  spawnSync("git", ["worktree", "remove", "--force", shadow.worktreeRoot], {
    cwd: ROOT,
    stdio: "ignore",
  });
  if (existsSync(shadow.runRoot)) removeExact(tempRoot, shadow.runRoot);
}

function runVitest(cwd, nodeModulesRoot, forwardedArgs, tempRoot) {
  const entry = join(nodeModulesRoot, "vitest", "vitest.mjs");
  const started = performance.now();
  const result = spawnSync(process.execPath, [entry, "run", ...forwardedArgs], {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      TMPDIR: tempRoot,
      TMP: tempRoot,
      TEMP: tempRoot,
      PWD: cwd,
      INIT_CWD: cwd,
      PMIKC_TEST_SHADOW_ACTIVE: cwd === ROOT ? "0" : "1",
    },
  });
  const seconds = ((performance.now() - started) / 1_000).toFixed(2);
  console.log(`[unit-test] Vitest wall time: ${seconds}s`);

  if (result.error) throw result.error;
  if (result.signal) {
    console.error(`[unit-test] Vitest stopped by ${result.signal}.`);
    return 1;
  }
  return result.status ?? 1;
}

export function main(forwardedArgs = process.argv.slice(2)) {
  const workers = recommendedWorkers();
  console.log(
    `[unit-test] Isolated thread pool capped at ${workers} worker${workers === 1 ? "" : "s"} by config; ${availableParallelism()} logical CPUs available.`,
  );

  if (!shouldUseNativeShadow()) {
    return runVitest(
      ROOT,
      join(ROOT, "node_modules"),
      forwardedArgs,
      realpathSync(tmpdir()),
    );
  }

  const tempRoot = nativeRoot();
  const repositoryKey = createHash("sha256")
    .update(realpathSync(ROOT))
    .digest("hex")
    .slice(0, 12);
  const cacheRoot = join(tempRoot, `${CACHE_PREFIX}-${repositoryKey}`);
  let shadow;

  try {
    console.log(
      `[unit-test] WSL mounted workspace detected; staging a native Linux shadow under ${tempRoot}.`,
    );
    const dependencyRoot = ensureDependencies(cacheRoot, tempRoot);
    shadow = createShadow(tempRoot, dependencyRoot);
    return runVitest(
      shadow.worktreeRoot,
      join(dependencyRoot, "node_modules"),
      forwardedArgs,
      tempRoot,
    );
  } catch (error) {
    console.warn(
      `[unit-test] Native shadow unavailable (${error instanceof Error ? error.message : String(error)}); running directly.`,
    );
    return runVitest(ROOT, join(ROOT, "node_modules"), forwardedArgs, tempRoot);
  } finally {
    cleanupShadow(tempRoot, shadow);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
