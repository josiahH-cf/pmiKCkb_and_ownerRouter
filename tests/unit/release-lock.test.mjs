import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  acquireWatcherLock,
  assertReleaseProcessLock,
} from "../../scripts/release-lock.mjs";
import { command } from "../../scripts/release-watcher.mjs";

const lockModule = pathToFileURL(resolve("scripts/release-lock.mjs")).href;
const releaseModule = pathToFileURL(resolve("scripts/release.mjs")).href;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => {
  try {
    const value = readFileSync(`/proc/${pid}/stat`, "utf8");
    return !["Z", "X"].includes(value.slice(value.lastIndexOf(")") + 2).split(" ")[0]);
  } catch {
    return false;
  }
};
async function eventually(read, timeout = 10_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      const result = read();
      if (result) return result;
    } catch {
      /* wait for exact child state */
    }
    await delay(20);
  }
  throw new Error("synthetic_process_state_timeout");
}
function killGroup(child) {
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

describe.skipIf(process.platform !== "linux")(
  "real kernel release lock and child lifetime",
  () => {
    it("serializes real owners and closes idempotently", async () => {
      const root = mkdtempSync(join(tmpdir(), "release-lock-"));
      const unlock = await acquireWatcherLock(root);
      try {
        unlock.assertHeld();
        await expect(acquireWatcherLock(root)).rejects.toThrow(
          "release_watcher_already_running",
        );
        await Promise.all([unlock(), unlock()]);
        expect(unlock.signal.aborted).toBe(true);
        expect(() => unlock.assertHeld()).toThrow("release_lock_lost");
        const next = await acquireWatcherLock(root);
        await next();
      } finally {
        await unlock();
        rmSync(root, { recursive: true, force: true });
      }
    });
    it("refuses a boolean environment claim and a descriptor for a different inode", async () => {
      const root = mkdtempSync(join(tmpdir(), "release-lock-"));
      const wrong = mkdtempSync(join(tmpdir(), "release-lock-wrong-"));
      const unlock = await acquireWatcherLock(root);
      const wrongUnlock = await acquireWatcherLock(wrong);
      try {
        expect(() => assertReleaseProcessLock({ stateRoot: root, env: {} })).toThrow(
          "release_kernel_lock_required",
        );
        const result = await command(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `import {assertReleaseProcessLock} from ${JSON.stringify(lockModule)}; assertReleaseProcessLock({stateRoot:${JSON.stringify(root)}});`,
          ],
          { lockFd: wrongUnlock.fd },
        );
        expect(result.status).not.toBe(0);
        const valid = await command(
          process.execPath,
          [
            "--import=tsx",
            "--input-type=module",
            "-e",
            `import {assertReleaseProcessLock} from ${JSON.stringify(lockModule)}; process.stdout.write(String(assertReleaseProcessLock({stateRoot:${JSON.stringify(root)}})));`,
          ],
          { lockFd: unlock.fd },
        );
        expect(valid).toMatchObject({ status: 0, stdout: "3" });
      } finally {
        await unlock();
        await wrongUnlock();
        rmSync(root, { recursive: true, force: true });
        rmSync(wrong, { recursive: true, force: true });
      }
    });
    it("retains the lock across a real parent crash until its inherited nested child exits", async () => {
      const root = mkdtempSync(join(tmpdir(), "release-lock-crash-"));
      const marker = join(root, "nested.pid");
      const nested = `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000);`;
      const code = `import {spawn} from 'node:child_process'; import {acquireWatcherLock} from ${JSON.stringify(lockModule)}; const lock=await acquireWatcherLock(${JSON.stringify(root)}); spawn(process.execPath,['-e',${JSON.stringify(nested)}],{stdio:['ignore','ignore','ignore',lock.fd],detached:false}); setInterval(()=>{},1000);`;
      const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
        detached: true,
        stdio: "ignore",
      });
      try {
        const nestedPid = await eventually(() => Number(readFileSync(marker, "utf8")));
        process.kill(child.pid, "SIGKILL");
        await eventually(() => !alive(child.pid));
        expect(alive(nestedPid)).toBe(true);
        await expect(acquireWatcherLock(root)).rejects.toThrow(
          "release_watcher_already_running",
        );
        killGroup(child);
        await eventually(() => !alive(nestedPid));
        const next = await acquireWatcherLock(root);
        await next();
      } finally {
        killGroup(child);
        rmSync(root, { recursive: true, force: true });
      }
    }, 20_000);
    it("watcher cancellation kills a real nested release command in the same process group", async () => {
      const root = mkdtempSync(join(tmpdir(), "release-lock-cancel-"));
      const marker = join(root, "provider.pid");
      const unlock = await acquireWatcherLock(root);
      const controller = new AbortController();
      const nested = `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000);`;
      const code = `import {run} from ${JSON.stringify(releaseModule)}; await run(process.execPath,['-e',${JSON.stringify(nested)}],{lockFd:3,timeoutMs:60000});`;
      const pending = command(process.execPath, ["--input-type=module", "-e", code], {
        lockFd: unlock.fd,
        signal: controller.signal,
        timeoutMs: 15000,
      });
      try {
        const pid = await eventually(() => Number(readFileSync(marker, "utf8")));
        controller.abort();
        const result = await pending;
        expect(result.status).not.toBe(0);
        await eventually(() => !alive(pid));
        await expect(acquireWatcherLock(root)).rejects.toThrow(
          "release_watcher_already_running",
        );
        await unlock();
        const next = await acquireWatcherLock(root);
        await next();
      } finally {
        controller.abort();
        await pending;
        await unlock();
        rmSync(root, { recursive: true, force: true });
      }
    }, 25_000);
    it("nested release timeout terminates its enclosing script group and the provider child", async () => {
      const root = mkdtempSync(join(tmpdir(), "release-lock-timeout-"));
      const marker = join(root, "provider.pid");
      const unlock = await acquireWatcherLock(root);
      const nested = `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000);`;
      const code = `import {run} from ${JSON.stringify(releaseModule)}; await run(process.execPath,['-e',${JSON.stringify(nested)}],{lockFd:3,timeoutMs:500});`;
      try {
        const result = await command(
          process.execPath,
          ["--input-type=module", "-e", code],
          { lockFd: unlock.fd, timeoutMs: 15000 },
        );
        const pid = Number(readFileSync(marker, "utf8"));
        expect(result.status).not.toBe(0);
        await eventually(() => !alive(pid));
      } finally {
        await unlock();
        rmSync(root, { recursive: true, force: true });
      }
    }, 20_000);
  },
);
