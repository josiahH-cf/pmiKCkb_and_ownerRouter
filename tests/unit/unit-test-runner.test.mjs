import { describe, expect, it } from "vitest";
import {
  dependencyCacheKey,
  isSafeUntrackedPath,
  recommendedWorkers,
  shouldUseNativeShadow,
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

  it("bounds thread concurrency while leaving one logical CPU free", () => {
    expect(recommendedWorkers(1)).toBe(1);
    expect(recommendedWorkers(4)).toBe(3);
    expect(recommendedWorkers(32)).toBe(8);
  });

  it("never mirrors ignored local settings, outputs, client data, scratch, secrets, or env files", () => {
    for (const path of [
      ".claude/settings.local.json",
      ".env.local",
      "docs/client_docs/export.csv",
      "docs/context_and_calls/call.md",
      "docs/temp/local-proof.md",
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
