import { spawn } from "node:child_process";
import { readFile, readlink, realpath } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export class ManagedProfileError extends Error {
  constructor(code, detail, owner = null) {
    super(detail);
    this.name = "ManagedProfileError";
    this.code = code;
    this.owner = owner;
  }
}

/** Inspect only process ownership and native lock metadata, never cookies or credential values. */
export async function inspectChromiumProfile(profile) {
  const resolved = await realpath(profile);
  let target;
  try {
    target = await readlink(join(resolved, "SingletonLock"));
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EINVAL") return { state: "free" };
    throw new ManagedProfileError(
      "profile_ownership_unknown",
      "The browser profile ownership could not be inspected.",
    );
  }
  const match = /^(.*)-(\d+)$/.exec(target);
  if (!match || match[1] !== hostname()) {
    return { state: "unknown_owner", pid: match ? Number(match[2]) : null };
  }
  const pid = Number(match[2]);
  try {
    const command = (await readFile(`/proc/${pid}/cmdline`)).toString().split("\0");
    const profileArgument = command
      .find((arg) => arg.startsWith("--user-data-dir="))
      ?.slice("--user-data-dir=".length);
    if (profileArgument) {
      try {
        if ((await realpath(profileArgument)) === resolved)
          return { state: "active", pid };
      } catch {
        return { state: "unknown_owner", pid };
      }
    }
    // A reused PID is not the browser that wrote the marker. Chromium owns stale-marker recovery.
    return { state: "stale", pid, pid_reused: true };
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ESRCH")
      return { state: "stale", pid, pid_reused: false };
    return { state: "unknown_owner", pid };
  }
}

/** A cooperating caller owns the kernel lock until it releases or exits, including after a crash. */
export async function acquireManagedProfileLease(profile, options = {}) {
  if (process.platform !== "linux") {
    throw new ManagedProfileError(
      "profile_coordination_requires_linux",
      "Managed PMI browser sessions run in WSL.",
    );
  }
  const waitMs = options.waitMs ?? 15_000;
  if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > 600_000)
    throw new RangeError("A bounded profile wait is required.");
  const label = options.label ?? "pmi-browser";
  if (!/^[a-z0-9_.:-]{1,80}$/.test(label))
    throw new RangeError("A fixed profile owner label is required.");
  if (options.signal?.aborted)
    throw new ManagedProfileError(
      "profile_wait_cancelled",
      "Browser ownership wait was cancelled.",
    );
  const resolved = await realpath(profile);
  const child = spawn(
    "python3",
    [
      fileURLToPath(new URL("./profile-lease.py", import.meta.url)),
      resolved,
      String(waitMs),
      String(process.pid),
      label,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let released = false;
  let settled = false;
  let buffer = "";
  let releasePromise;
  let onAbort;
  const exited = new Promise((resolve) => child.once("close", resolve));
  const release = () => {
    if (!releasePromise) {
      released = true;
      if (onAbort) options.signal?.removeEventListener("abort", onAbort);
      child.stdin.end("release\n");
      releasePromise = exited.then(() => undefined);
    }
    return releasePromise;
  };
  const acquired = new Promise((resolve, reject) => {
    const fail = (error) => {
      if (!settled) {
        settled = true;
        void release();
        reject(error);
      }
    };
    onAbort = () =>
      fail(
        new ManagedProfileError(
          "profile_wait_cancelled",
          "Browser ownership wait was cancelled.",
        ),
      );
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", () =>
      fail(
        new ManagedProfileError(
          "profile_coordinator_unavailable",
          "The WSL profile coordinator could not start.",
        ),
      ),
    );
    child.once("exit", () => {
      if (!settled)
        fail(
          new ManagedProfileError(
            "profile_coordinator_unavailable",
            "The WSL profile coordinator ended before ownership was established.",
          ),
        );
    });
    child.stdin.on("error", () => {});
    child.stderr.resume();
    child.stdout.on("data", (data) => {
      buffer += data.toString();
      if (buffer.length > 32_768)
        return fail(
          new ManagedProfileError(
            "profile_coordinator_unavailable",
            "The profile coordinator returned an invalid response.",
          ),
        );
      let boundary;
      while ((boundary = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 1);
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          return fail(
            new ManagedProfileError(
              "profile_coordinator_unavailable",
              "The profile coordinator returned an invalid response.",
            ),
          );
        }
        if (event.state === "waiting") options.onWait?.(event.owner);
        if (event.state === "busy")
          return fail(
            new ManagedProfileError(
              "profile_in_use",
              "The managed browser profile is in use. Wait for its current owner to finish, then run the same command again.",
              event.owner,
            ),
          );
        if (event.state === "error")
          return fail(
            new ManagedProfileError(
              event.code,
              "The managed profile ownership could not be established.",
            ),
          );
        if (event.state === "acquired" && !settled) {
          settled = true;
          resolve({ owner: event.owner, release });
        }
      }
    });
  });
  const lease = await acquired;
  try {
    const native = await inspectChromiumProfile(resolved);
    if (native.state === "active" || native.state === "unknown_owner") {
      throw new ManagedProfileError(
        "profile_in_use",
        "Chromium already owns this managed profile. Close its existing PMI window or wait for its verification to finish; no browser was terminated.",
        native,
      );
    }
    if (released)
      throw new ManagedProfileError(
        "profile_wait_cancelled",
        "Browser ownership wait was cancelled.",
      );
    return { ...lease, nativeState: native.state };
  } catch (error) {
    await release();
    throw error;
  }
}
