// Auth commands load this checkout's installed packages (google-auth-library) and check its local
// configuration (.env.local). A checkout without them, such as a Windows worktree read through /mnt/c
// or a checkout whose node_modules was emptied, runs the same command from the registered WSL release
// checkout that the pmi-auth operator command already uses. This module reads only package
// locations, whether .env.local exists, and that checkout registration; it never reads, copies or
// changes a credential, configuration value, store, identity or policy.

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

/** True when `root` has its own local configuration file. Its values are never read here. */
export function localConfigurationPresent(root) {
  return existsSync(join(root, ".env.local"));
}

/**
 * The checkout an auth command runs from. A checkout with its packages and its own .env.local runs
 * itself; otherwise the registered checkout runs when it has both. Failing that, whichever checkout
 * can at least load the checks runs, so a missing file is reported rather than hidden. `reason`
 * names what this checkout lacked when it hands off. Null when neither can load the checks.
 */
export function selectAuthCheckout({
  root = ROOT,
  home = homedir(),
  installed = authPackagesInstalled,
  configured = localConfigurationPresent,
} = {}) {
  const here = realpathSync(root);
  const hereInstalled = installed(here);
  if (hereInstalled && configured(here)) return { root: here, handoff: false };
  const registered = registeredCheckout(home);
  const other =
    registered &&
    registered !== here &&
    existsSync(join(registered, "scripts", "auth", "ensure.mjs")) &&
    installed(registered)
      ? registered
      : null;
  const reason = hereInstalled ? "configuration" : "packages";
  if (other && configured(other)) return { root: other, handoff: true, reason };
  if (hereInstalled) return { root: here, handoff: false };
  if (other) return { root: other, handoff: true, reason };
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
