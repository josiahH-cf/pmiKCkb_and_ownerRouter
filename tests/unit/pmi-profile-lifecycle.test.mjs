import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { acquireManagedProfileLease } from "../../lib/production-assurance/profile-lease.mjs";
import {
  launchGuardedManagedBrowser,
  closeGuardedManagedBrowser,
} from "../../lib/production-assurance/guarded-browser.ts";

const temporary = [];
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function profile() {
  const root = await mkdtemp(join(tmpdir(), "pmi-lifecycle-test-"));
  temporary.push(root);
  const result = join(root, "profile");
  await mkdir(result);
  return result;
}
async function stopOwnedFixture(child) {
  if (child.exitCode === null && child.signalCode === null) {
    const done = once(child, "exit");
    child.kill("SIGKILL");
    await done;
  }
}
async function lineFrom(child) {
  let timer;
  try {
    return await Promise.race([
      once(child.stdout, "data"),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("fixture_did_not_start")), 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe.skipIf(process.platform !== "linux")(
  "managed profile restart/concurrency lifecycle",
  () => {
    it("does not delete a live Chromium-style owner's native marker or terminate it", async () => {
      const path = await profile();
      const child = spawn(
        process.execPath,
        ["-e", "setInterval(()=>{},1000)", "--", `--user-data-dir=${path}`],
        { stdio: "ignore" },
      );
      await once(child, "spawn");
      try {
        const target = `${hostname()}-${child.pid}`;
        await symlink(target, join(path, "SingletonLock"));
        await expect(
          acquireManagedProfileLease(path, { waitMs: 0 }),
        ).rejects.toMatchObject({ code: "profile_in_use", owner: { pid: child.pid } });
        expect(await readlink(join(path, "SingletonLock"))).toBe(target);
        expect(child.exitCode).toBe(null);
      } finally {
        await stopOwnedFixture(child);
      }
    });
    it("releases after an interrupted caller and permits a fresh process without deleting metadata", async () => {
      const path = await profile();
      const leaseModuleUrl = new URL(
        "../../lib/production-assurance/profile-lease.mjs",
        import.meta.url,
      ).href;
      const code = `import {acquireManagedProfileLease} from ${JSON.stringify(leaseModuleUrl)}; await acquireManagedProfileLease(${JSON.stringify(path)}, {label:'interrupted-fixture'}); console.log('owned'); setInterval(()=>{},1000);`;
      const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      try {
        await lineFrom(child);
        await expect(
          acquireManagedProfileLease(path, { waitMs: 0 }),
        ).rejects.toMatchObject({ code: "profile_in_use" });
      } finally {
        await stopOwnedFixture(child);
      }
      const fresh = await acquireManagedProfileLease(path, {
        label: "fresh-process",
        waitMs: 2000,
      });
      await fresh.release();
    });
    it("ignores stale coordination JSON after a simulated previous boot because the kernel lock is free", async () => {
      const path = await profile();
      await writeFile(
        `${path}.pmi-session.lock`,
        JSON.stringify({ pid: 123, label: "old-boot", boot_id: "previous-boot" }),
      );
      const lease = await acquireManagedProfileLease(path, {
        label: "new-boot-simulation",
        waitMs: 0,
      });
      expect(lease.owner.label).toBe("new-boot-simulation");
      await lease.release();
    });
    it("cancels a waiting owner without releasing the actual holder's lock", async () => {
      const path = await profile();
      const holder = await acquireManagedProfileLease(path, {
        label: "holder",
        waitMs: 0,
      });
      try {
        const controller = new AbortController();
        const waiting = acquireManagedProfileLease(path, {
          waitMs: 1000,
          signal: controller.signal,
          onWait: () => controller.abort(),
        });
        await expect(waiting).rejects.toMatchObject({ code: "profile_wait_cancelled" });
        await expect(
          acquireManagedProfileLease(path, { waitMs: 0 }),
        ).rejects.toMatchObject({ code: "profile_in_use", owner: { label: "holder" } });
      } finally {
        await holder.release();
      }
    });
    it("uses one ownership contract across actual assurance and auth entry points", async () => {
      const path = await profile();
      const context = {
        route: async () => {},
        pages: () => [],
        serviceWorkers: () => [],
        browser: () => null,
        setOffline: async () => {},
        close: async () => {},
      };
      await launchGuardedManagedBrowser({
        profile: path,
        executablePath: "/fixture/chrome",
        headless: true,
        viewport: { width: 100, height: 100 },
        launchTimeoutMs: 2000,
        onMutationAttempt: () => {},
        launchPersistentContext: async () => context,
      });
      try {
        await expect(
          acquireManagedProfileLease(path, { waitMs: 0 }),
        ).rejects.toMatchObject({
          code: "profile_in_use",
          owner: { label: "production-assurance" },
        });
      } finally {
        await closeGuardedManagedBrowser(context);
      }
      const auth = await acquireManagedProfileLease(path, {
        label: "auth-session",
        waitMs: 0,
      });
      await auth.release();
    });
  },
);
