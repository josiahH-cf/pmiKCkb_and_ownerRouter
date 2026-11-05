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
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, tmpdir, totalmem } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CACHE_VERSION = "v1";
const SHADOW_OVERRIDE = "PMIKC_TEST_SHADOW";
const KEEP_SHADOW = "PMIKC_TEST_KEEP_SHADOW";
const RUN_PREFIX = "pmi-kc-vitest-run-";
const CACHE_PREFIX = `pmi-kc-vitest-native-${CACHE_VERSION}`;
const INSTALL_WAIT_MS = 6 * 60 * 1_000;
// Measured 2026-11-05 on the native lane (1,096 files): 554 s and 1.7 GB peak at 2 workers,
// 214 s and 3.3 GB at 8, with identical results. Past eight the gain is small and memory grows.
const MAX_WORKERS = 8;
const BASE_MEMORY_BYTES = 2 * 1024 ** 3;
const WORKER_MEMORY_BYTES = 512 * 1024 ** 2;
// Direct reads from a Windows drive mount return stale or partial files under wide concurrency
// (2026-08-25), so a run that cannot use the native shadow keeps the old two-worker ceiling.
const MOUNTED_DIRECT_WORKERS = 2;

function readProcVersion() {
  try {
    return readFileSync("/proc/version", "utf8");
  } catch {
    return "";
  }
}

/** One worker per logical CPU but one, bounded by memory and by the measured useful maximum. */
export function recommendedWorkers(
  parallelism = availableParallelism(),
  memoryBytes = totalmem(),
) {
  const byCpu = Math.max(1, Math.floor(Number(parallelism)) - 1);
  const byMemory = Math.max(
    1,
    Math.floor((Number(memoryBytes) - BASE_MEMORY_BYTES) / WORKER_MEMORY_BYTES),
  );
  return Math.min(MAX_WORKERS, byCpu, byMemory);
}

export function isWslWindowsMount({
  platform = process.platform,
  cwd = ROOT,
  procVersion = readProcVersion(),
} = {}) {
  return (
    platform === "linux" &&
    /microsoft|wsl/i.test(procVersion) &&
    /^\/mnt\/[a-z](?:\/|$)/i.test(resolve(cwd))
  );
}

/** Workers for a Vitest process whose files are read from `cwd`. */
export function workersForCheckout({
  cwd = ROOT,
  platform = process.platform,
  procVersion = readProcVersion(),
  parallelism = availableParallelism(),
  memoryBytes = totalmem(),
} = {}) {
  const workers = recommendedWorkers(parallelism, memoryBytes);
  return isWslWindowsMount({ platform, cwd, procVersion })
    ? Math.min(MOUNTED_DIRECT_WORKERS, workers)
    : workers;
}

export function hasWorkerOverride(args) {
  return args.some(
    (arg) => arg === "--maxWorkers" || String(arg).startsWith("--maxWorkers="),
  );
}

export function shouldUseNativeShadow({
  platform = process.platform,
  cwd = ROOT,
  procVersion = readProcVersion(),
  env = process.env,
} = {}) {
  if (env[SHADOW_OVERRIDE] === "1") return true;
  if (env[SHADOW_OVERRIDE] === "0") return false;

  return isWslWindowsMount({ platform, cwd, procVersion });
}

/** Map a Windows `C:\x` or `C:/x` path to its WSL drive mount; other paths are unchanged. */
export function wslPathFromWindows(path, platform = process.platform) {
  const drive = /^([A-Za-z]):[\\/](.*)$/.exec(String(path).trim());
  if (!drive || platform === "win32") return String(path).trim();
  return `/mnt/${drive[1].toLowerCase()}/${drive[2].replaceAll("\\", "/")}`;
}

/**
 * The checkout's own Git directory and the shared repository directory. A linked worktree made by
 * Windows Git records `gitdir: C:/...`, which Linux Git cannot open; the path is mapped to its
 * drive mount so the shadow can be created from any Claude or Codex worktree.
 */
export function resolveGitDirectories(root = ROOT, platform = process.platform) {
  const marker = join(root, ".git");
  try {
    if (statSync(marker).isDirectory()) return { gitDir: marker, commonDir: marker };
    const pointer = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(marker, "utf8"));
    if (!pointer) return null;
    const mapped = wslPathFromWindows(pointer[1], platform);
    const gitDir = isAbsolute(mapped) ? mapped : resolve(root, mapped);
    const commonFile = join(gitDir, "commondir");
    const commonDir = existsSync(commonFile)
      ? resolve(gitDir, readFileSync(commonFile, "utf8").trim())
      : gitDir;
    return { gitDir, commonDir };
  } catch {
    return null;
  }
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
    "docs/specs/",
    "golden-data/captured/",
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

let listingGitCommand;

/**
 * Git for reading this checkout's index. Windows Git owns the index of a Windows-mounted checkout;
 * Linux Git re-hashes every file through the drive mount instead (measured 2026-11-05 on a Claude
 * worktree: 1.9 s through WSL interop against 124 s), so Windows Git is used when it is reachable.
 */
function listingGit() {
  if (listingGitCommand) return listingGitCommand;
  listingGitCommand = { command: "git", prefix: [] };
  if (isWslWindowsMount({ cwd: ROOT })) {
    const probe = spawnSync("git.exe", ["rev-parse", "--is-inside-work-tree"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (!probe.error && probe.status === 0 && probe.stdout.trim() === "true") {
      listingGitCommand = { command: "git.exe", prefix: [] };
    } else {
      const directories = resolveGitDirectories(ROOT);
      if (directories) {
        listingGitCommand = {
          command: "git",
          prefix: [`--git-dir=${directories.gitDir}`, `--work-tree=${ROOT}`],
        };
      }
    }
  }
  return listingGitCommand;
}

function gitOutput(args, cwd = ROOT) {
  const git = listingGit();
  return execFileSync(git.command, [...git.prefix, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 ** 2,
    stdio: ["ignore", "pipe", "pipe"],
    // Linux Git must never rewrite an index that Windows Git owns.
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
}

/** Add a detached native worktree of this checkout's HEAD, from a Windows worktree as well. */
export function addNativeWorktree(target, root = ROOT) {
  const directories = resolveGitDirectories(root);
  if (!directories) throw new Error("This checkout has no readable Git directory.");
  const head = execFileSync(
    "git",
    [`--git-dir=${directories.gitDir}`, "rev-parse", "--verify", "HEAD^{commit}"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  run(
    "git",
    [
      `--git-dir=${directories.commonDir}`,
      "worktree",
      "add",
      "--detach",
      "--force",
      target,
      head,
    ],
    { cwd: root },
  );
  return directories.commonDir;
}

export function removeNativeWorktree(target, commonDir, root = ROOT) {
  spawnSync("git", [`--git-dir=${commonDir}`, "worktree", "remove", "--force", target], {
    cwd: root,
    stdio: "ignore",
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

export function overlayWorkingChanges(targetRoot) {
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
  let commonDir;

  try {
    commonDir = addNativeWorktree(worktreeRoot);
    overlayWorkingChanges(worktreeRoot);
    symlinkSync(
      join(dependencyRoot, "node_modules"),
      join(worktreeRoot, "node_modules"),
      "dir",
    );
    return { runRoot, worktreeRoot, commonDir };
  } catch (error) {
    if (commonDir) removeNativeWorktree(worktreeRoot, commonDir);
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

  removeNativeWorktree(shadow.worktreeRoot, shadow.commonDir);
  if (existsSync(shadow.runRoot)) removeExact(tempRoot, shadow.runRoot);
}

function runVitest(cwd, nodeModulesRoot, forwardedArgs, tempRoot) {
  const entry = join(nodeModulesRoot, "vitest", "vitest.mjs");
  // A lane with a CPU-heavy service beside it (the Firestore emulator) reserves CPUs for it.
  const reserved = Math.max(
    0,
    Math.floor(Number(process.env.PMIKC_TEST_RESERVED_CPUS) || 0),
  );
  const workers = workersForCheckout({
    cwd,
    parallelism: Math.max(1, availableParallelism() - reserved),
  });
  const workerArgs = hasWorkerOverride(forwardedArgs) ? [] : [`--maxWorkers=${workers}`];
  console.log(
    hasWorkerOverride(forwardedArgs)
      ? "[unit-test] Using the caller's --maxWorkers."
      : `[unit-test] Thread pool: ${workers} worker${workers === 1 ? "" : "s"}; ${availableParallelism()} logical CPUs available.`,
  );
  const started = performance.now();
  const result = spawnSync(
    process.execPath,
    [entry, "run", ...forwardedArgs, ...workerArgs],
    {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        TMPDIR: tempRoot,
        TMP: tempRoot,
        TEMP: tempRoot,
        PWD: cwd,
        INIT_CWD: cwd,
        ...(existsSync(join(ROOT, "golden-data", "captured"))
          ? {
              PMIKC_VERIFIED_CAPTURE_DIR:
                process.env.PMIKC_VERIFIED_CAPTURE_DIR ||
                join(ROOT, "golden-data", "captured"),
            }
          : {}),
        PMIKC_TEST_SHADOW_ACTIVE: cwd === ROOT ? "0" : "1",
      },
    },
  );
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
  if (!shouldUseNativeShadow()) {
    return runVitest(
      ROOT,
      join(ROOT, "node_modules"),
      forwardedArgs,
      realpathSync(tmpdir()),
    );
  }

  const tempRoot = nativeRoot();
  // Content-keyed (lockfile, install manifest, platform, ABI), so every checkout and worktree of
  // the repository shares one installation instead of installing once per checkout path.
  const cacheRoot = join(tempRoot, CACHE_PREFIX);
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
