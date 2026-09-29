import { execFileSync, spawn } from "node:child_process";
import { closeSync, fstatSync, mkdirSync, openSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const RELEASE_LOCK_FD_ENV = "PMI_KC_RELEASE_LOCK_FD";
const defaultRoot = () => join(homedir(), ".local", "state", "pmi-kc-release");

function assertDescriptor(fd, root) {
  try {
    if (!Number.isSafeInteger(fd) || fd < 3) throw new Error();
    const inherited = fstatSync(fd);
    const expected = statSync(join(root, "release.lock"));
    if (
      !inherited.isFile() ||
      inherited.dev !== expected.dev ||
      inherited.ino !== expected.ino
    )
      throw new Error();
  } catch {
    throw new Error("release_kernel_lock_required");
  }
}

// fd3 is a real inherited open-file description, not a boolean admission claim. flock on that
// description either preserves its existing kernel lock or fails against another lock owner.
// A renamed/replaced file or an ordinary pipe cannot stand in for the exact release lock.
export function assertReleaseProcessLock({
  stateRoot = defaultRoot(),
  env = process.env,
} = {}) {
  const raw = env[RELEASE_LOCK_FD_ENV];
  if (raw !== "3") throw new Error("release_kernel_lock_required");
  const fd = 3;
  assertDescriptor(fd, stateRoot);
  try {
    execFileSync("flock", ["--nonblock", "3"], {
      stdio: ["ignore", "ignore", "ignore", fd],
    });
  } catch {
    throw new Error("release_kernel_lock_required");
  }
  assertDescriptor(fd, stateRoot);
  return fd;
}

// The parent owns the open descriptor. Its children inherit that SAME description so a parent
// crash cannot free the kernel lock while an in-flight provider process is still alive.
export async function acquireWatcherLock(root, { spawnLock = spawn } = {}) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const fd = openSync(join(root, "release.lock"), "a+", 0o600);
  try {
    await new Promise((resolve, reject) => {
      const child = spawnLock("flock", ["--nonblock", "3"], {
        stdio: ["ignore", "ignore", "ignore", fd],
      });
      child.once("error", () => reject(new Error("release_lock_unavailable")));
      child.once("close", (code) =>
        code === 0 ? resolve() : reject(new Error("release_watcher_already_running")),
      );
    });
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  let closed = false;
  const controller = new AbortController();
  const unlock = async () => {
    if (closed) return;
    closed = true;
    controller.abort(new Error("release_lock_lost"));
    closeSync(fd);
  };
  unlock.assertHeld = () => {
    if (closed) throw new Error("release_lock_lost");
    try {
      assertDescriptor(fd, root);
    } catch {
      controller.abort(new Error("release_lock_lost"));
      throw new Error("release_lock_lost");
    }
  };
  unlock.signal = controller.signal;
  unlock.fd = fd;
  return unlock;
}
