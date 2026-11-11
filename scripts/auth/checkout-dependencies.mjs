// Auth commands load this checkout's installed packages (google-auth-library). A checkout without
// them, such as a Windows worktree read through /mnt/c or a checkout whose node_modules was emptied,
// runs the same command from the registered WSL release checkout that the pmi-auth operator command
// already uses. This module reads only package locations and that checkout registration; it never
// reads, copies or changes a credential, store, identity or policy.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const REPOSITORY = "josiahH-cf/pmiKCkb_and_ownerRouter";

/** The package the Google credential checks load; unresolvable means no installed dependencies. */
export const AUTH_PACKAGE = "google-auth-library";

export const NOT_INSTALLED =
  "NOT READY: this checkout has no installed packages and the registered WSL checkout is unavailable. Install this checkout's dependencies in WSL (npm ci), then retry.";

/** True when the auth scripts in `root` resolve their Google package, installed there or above. */
export function authPackagesInstalled(root) {
  try {
    createRequire(join(root, "scripts", "auth", "ensure.mjs")).resolve(AUTH_PACKAGE);
    return true;
  } catch {
    return false;
  }
}

/** The registered WSL release checkout, read from the same record the pmi-auth command uses. */
export function registeredCheckout(home = homedir()) {
  try {
    const pair = JSON.parse(
      readFileSync(
        join(home, ".local", "state", "pmi-kc-release", "checkout-pair.json"),
        "utf8",
      ),
    );
    if (pair?.schemaVersion !== 1 || pair.repository !== REPOSITORY) return null;
    if (typeof pair.nativeRoot !== "string" || !isAbsolute(pair.nativeRoot)) return null;
    return realpathSync(pair.nativeRoot);
  } catch {
    return null;
  }
}

/**
 * The checkout an auth command runs from: this one when its packages resolve, otherwise the
 * registered checkout when it has its own auth scripts and packages. Null when neither can run.
 */
export function selectAuthCheckout({
  root = ROOT,
  home = homedir(),
  installed = authPackagesInstalled,
} = {}) {
  const here = realpathSync(root);
  if (installed(here)) return { root: here, handoff: false };
  const registered = registeredCheckout(home);
  if (
    registered &&
    registered !== here &&
    existsSync(join(registered, "scripts", "auth", "ensure.mjs")) &&
    installed(registered)
  )
    return { root: registered, handoff: true };
  return null;
}

/** Prints the checkout to run from (enroll.sh reads it), or the not-installed line and exit 2. */
export function main({
  root = ROOT,
  home = homedir(),
  write = (line) => process.stdout.write(`${line}\n`),
  warn = (line) => process.stderr.write(`${line}\n`),
} = {}) {
  const selected = selectAuthCheckout({ root, home });
  if (!selected) {
    warn(NOT_INSTALLED);
    return 2;
  }
  write(selected.root);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main();
