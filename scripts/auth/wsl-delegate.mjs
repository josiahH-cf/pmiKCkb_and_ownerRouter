// Windows compatibility for the S112 local contract. The approved CLI/ADC store lives in WSL, so a
// Windows shell (a Claude Code or Codex session hosted on Windows) runs the same ensure command inside
// WSL and relays its result instead of assessing the unused Windows store. No credential, token or
// provider output crosses this boundary; the WSL command prints only its own redacted status.

import { spawnSync } from "node:child_process";

/** Session-start hooks stay bounded; attended canary sign-in may wait on a person. */
export const HOOK_DELEGATION_TIMEOUT_MS = 150_000;

/**
 * Map a Windows checkout path to the path WSL sees. Drive paths map under /mnt/<drive>; a
 * \\wsl.localhost\<distro>\ or \\wsl$\<distro>\ path maps to that distro's own root. Anything else
 * (another UNC share, a relative path) has no WSL equivalent and returns null.
 */
export function windowsPathToWsl(path) {
  const value = String(path ?? "").replace(/^\\\\\?\\(?:UNC\\)?/i, (prefix) =>
    /UNC/i.test(prefix) ? "\\\\" : "",
  );
  const drive = /^([A-Za-z]):[\\/](.*)$/.exec(value);
  if (drive) {
    const rest = drive[2].replaceAll("\\", "/").replace(/\/+$/, "");
    return `/mnt/${drive[1].toLowerCase()}${rest ? `/${rest}` : ""}`;
  }
  const distro = /^\\\\(?:wsl\.localhost|wsl\$)\\[^\\]+\\?(.*)$/i.exec(value);
  if (distro) return `/${distro[1].replaceAll("\\", "/").replace(/\/+$/, "")}`;
  return null;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

/** The exact wsl.exe invocation: same repository, same script, same arguments. */
export function buildWslDelegation({ root, argv }) {
  const wslRoot = windowsPathToWsl(root);
  if (!wslRoot) return null;
  const command = [
    `cd ${shellQuote(wslRoot)}`,
    ["node", "scripts/auth/ensure.mjs", ...argv].map(shellQuote).join(" "),
  ].join(" && ");
  return { file: "wsl.exe", args: ["-e", "bash", "-lc", command] };
}

/**
 * Run the delegated command with inherited stdio so attended steps keep their live output.
 * Returns `{ delegated: true, status }` when WSL ran it, otherwise `{ delegated: false, reason }`
 * without retrying; a failed or timed-out delegation is never reported as a credential state.
 */
export function delegateToWsl({ root, argv, hook = false, spawn = spawnSync }) {
  const invocation = buildWslDelegation({ root, argv });
  if (!invocation)
    return { delegated: false, reason: "checkout path has no WSL equivalent" };
  const result = spawn(invocation.file, invocation.args, {
    stdio: "inherit",
    windowsHide: true,
    ...(hook ? { timeout: HOOK_DELEGATION_TIMEOUT_MS } : {}),
  });
  if (result.error) {
    return {
      delegated: false,
      reason:
        result.error.code === "ENOENT"
          ? "wsl.exe is unavailable"
          : result.error.code === "ETIMEDOUT"
            ? "the WSL check timed out"
            : "the WSL check could not start",
    };
  }
  if (result.status === null)
    return { delegated: false, reason: "the WSL check was stopped" };
  return { delegated: true, status: result.status };
}
