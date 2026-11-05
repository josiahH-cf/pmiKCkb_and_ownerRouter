import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dependencyCacheKey,
  hasWorkerOverride,
  isSafeUntrackedPath,
  recommendedWorkers,
  resolveGitDirectories,
  shouldUseNativeShadow,
  workersForCheckout,
  wslPathFromWindows,
} from "../../scripts/run-unit-tests.mjs";

describe("accelerated unit-test runner", () => {
  it("uses a native shadow only for WSL Windows mounts unless explicitly overridden", () => {
    const wsl = {
      platform: "linux",
      cwd: "/mnt/c/work/repo",
      procVersion: "microsoft-standard-WSL2",
      env: {},
    };
    expect(shouldUseNativeShadow(wsl)).toBe(true);
    expect(shouldUseNativeShadow({ ...wsl, cwd: "/home/operator/repo" })).toBe(false);
    expect(shouldUseNativeShadow({ ...wsl, platform: "darwin" })).toBe(false);
    expect(shouldUseNativeShadow({ ...wsl, env: { PMIKC_TEST_SHADOW: "0" } })).toBe(
      false,
    );
    expect(
      shouldUseNativeShadow({
        platform: "linux",
        cwd: "/home/operator/repo",
        procVersion: "ordinary-linux",
        env: { PMIKC_TEST_SHADOW: "1" },
      }),
    ).toBe(true);
  });

  it("uses all logical CPUs but one, at most eight, within the machine's memory", () => {
    const GiB = 1024 ** 3;
    expect(recommendedWorkers(1, 16 * GiB)).toBe(1);
    expect(recommendedWorkers(2, 16 * GiB)).toBe(1);
    // GitHub's hosted Linux runner: four CPUs and 16 GB.
    expect(recommendedWorkers(4, 16 * GiB)).toBe(3);
    // The development host: 32 logical CPUs and an 11.6 GB WSL machine.
    expect(recommendedWorkers(32, 11.6 * GiB)).toBe(8);
    // A small container is bounded by memory (2 GB base plus 0.5 GB per worker), not CPUs.
    expect(recommendedWorkers(16, 3 * GiB)).toBe(2);
    expect(recommendedWorkers(16, 1 * GiB)).toBe(1);
  });

  it("keeps two workers when files are read straight from a WSL Windows mount", () => {
    const GiB = 1024 ** 3;
    const wsl = { platform: "linux", procVersion: "microsoft-standard-WSL2" };
    expect(
      workersForCheckout({
        ...wsl,
        cwd: "/mnt/c/work/repo",
        parallelism: 32,
        memoryBytes: 12 * GiB,
      }),
    ).toBe(2);
    expect(
      workersForCheckout({
        ...wsl,
        cwd: "/tmp/shadow/worktree",
        parallelism: 32,
        memoryBytes: 12 * GiB,
      }),
    ).toBe(8);
    expect(
      workersForCheckout({
        platform: "linux",
        procVersion: "ordinary-linux",
        cwd: "/home/runner/work/repo",
        parallelism: 4,
        memoryBytes: 16 * GiB,
      }),
    ).toBe(3);
  });

  it("leaves an explicit --maxWorkers to the caller", () => {
    expect(hasWorkerOverride(["tests/unit/a.test.ts", "--maxWorkers=1"])).toBe(true);
    expect(hasWorkerOverride(["--maxWorkers", "3"])).toBe(true);
    expect(hasWorkerOverride(["--shard=1/2", "--reporter=verbose"])).toBe(false);
  });

  it("opens a Windows-created linked worktree through its WSL drive mount", () => {
    const root = mkdtempSync(join(tmpdir(), "pmi-runner-gitdir-"));
    try {
      const common = join(root, "repo", ".git");
      const admin = join(common, "worktrees", "feature");
      const checkout = join(root, "repo", ".claude", "worktrees", "feature");
      mkdirSync(admin, { recursive: true });
      mkdirSync(checkout, { recursive: true });
      writeFileSync(join(admin, "commondir"), "../..\n");
      writeFileSync(join(checkout, ".git"), `gitdir: ${admin}\n`);
      expect(resolveGitDirectories(checkout, "linux")).toEqual({
        gitDir: admin,
        commonDir: common,
      });
      mkdirSync(join(root, "no-repository"));
      expect(resolveGitDirectories(join(root, "no-repository"), "linux")).toBeNull();
      mkdirSync(join(root, "repo", "plain", ".git"), { recursive: true });
      expect(resolveGitDirectories(join(root, "repo", "plain"), "linux")).toEqual({
        gitDir: join(root, "repo", "plain", ".git"),
        commonDir: join(root, "repo", "plain", ".git"),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    expect(
      wslPathFromWindows("C:/Users/josia/repo/.git/worktrees/feature", "linux"),
    ).toBe("/mnt/c/Users/josia/repo/.git/worktrees/feature");
    expect(wslPathFromWindows("D:\\work\\repo\\.git", "linux")).toBe(
      "/mnt/d/work/repo/.git",
    );
    expect(wslPathFromWindows("C:/Users/josia/repo/.git", "win32")).toBe(
      "C:/Users/josia/repo/.git",
    );
    expect(wslPathFromWindows("/home/operator/repo/.git", "linux")).toBe(
      "/home/operator/repo/.git",
    );
  });

  it("never mirrors ignored local settings, outputs, client data, scratch, secrets, or env files", () => {
    for (const path of [
      ".claude/settings.local.json",
      ".env.local",
      "docs/client_docs/export.csv",
      "docs/context_and_calls/call.md",
      "docs/temp/local-proof.md",
      "docs/specs/private.md",
      "golden-data/captured/source.json",
      "output/report.pdf",
      "secrets/token.txt",
      "temp/audit.json",
      "../outside.txt",
    ]) {
      expect(isSafeUntrackedPath(path), path).toBe(false);
    }
    expect(isSafeUntrackedPath("scripts/new-check.mjs")).toBe(true);
    expect(isSafeUntrackedPath("tests/unit/new-check.test.mjs")).toBe(true);
  });

  it("invalidates dependency reuse on install-manifest, lockfile, platform, architecture, or ABI drift", () => {
    const base = {
      lockText: "lock-a",
      packageText: JSON.stringify({
        scripts: { test: "old command" },
        dependencies: { react: "1" },
      }),
      platform: "linux",
      arch: "x64",
      modules: "137",
    };
    const key = dependencyCacheKey(base);
    expect(dependencyCacheKey(base)).toBe(key);
    for (const change of [
      { lockText: "lock-b" },
      {
        packageText: JSON.stringify({
          scripts: { test: "old command" },
          dependencies: { react: "2" },
        }),
      },
      { platform: "win32" },
      { arch: "arm64" },
      { modules: "138" },
    ]) {
      expect(dependencyCacheKey({ ...base, ...change })).not.toBe(key);
    }
    expect(
      dependencyCacheKey({
        ...base,
        packageText: JSON.stringify({
          scripts: { test: "new command" },
          dependencies: { react: "1" },
        }),
      }),
    ).toBe(key);
  });
});
