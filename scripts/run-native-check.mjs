#!/usr/bin/env node
// Expensive checks run in an isolated Linux checkout with physical local dependencies. The source
// worktree is only read. Private captures are referenced in place and are never mirrored/uploaded.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { overlayWorkingChanges } from "./run-unit-tests.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export function nativeCheckEnvironment(source, base = process.env) {
  const captures = join(source, "golden-data", "captured");
  return {
    ...base,
    VITEST_MAX_WORKERS: "2",
    PMIKC_TEST_SHADOW: "0",
    ...(existsSync(captures) ? { PMIKC_VERIFIED_CAPTURE_DIR: captures } : {}),
  };
}
export function main(argv = process.argv.slice(2)) {
  if (process.platform !== "linux") throw new Error("native_checks_require_linux");
  const keep = argv[0] === "--keep";
  const command = keep ? argv.slice(1) : argv;
  if (!command.length) throw new Error("Pass the exact check command after --.");
  const parent = mkdtempSync(join(realpathSync(tmpdir()), "pmi-native-check-"));
  const checkout = join(parent, "checkout");
  const run = (bin, args, cwd, env) => {
    const result = spawnSync(bin, args, { cwd, env, stdio: "inherit" });
    if (result.error) throw result.error;
    return result.status ?? 1;
  };
  if (run("git", ["worktree", "add", "--detach", checkout, "HEAD"], root, process.env))
    return 1;
  try {
    overlayWorkingChanges(checkout);
    // Verify with the caller's environment, as CI does. Importing the app's local
    // provider configuration here changes unit-test defaults and enables live
    // dependency reads. Runtime rehearsal loads its configuration explicitly.
    const env = nativeCheckEnvironment(root);
    const installsItself = command[0] === "bash" && command[1] === "scripts/verify.sh";
    if (!installsItself && run("npm", ["ci", "--no-audit", "--no-fund"], checkout, env))
      return 1;
    console.log(
      `[native-check] ${checkout}; private capture coverage is reported by the golden harness.`,
    );
    return run(command[0], command.slice(1), checkout, env);
  } finally {
    if (keep) console.log(`[native-check] Retained execution directory: ${checkout}`);
    else run("git", ["worktree", "remove", "--force", checkout], root, process.env);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch {
    console.error("Native check preparation failed; the source worktree is unchanged.");
    process.exitCode = 1;
  }
}
