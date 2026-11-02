import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireManagedProfileLease } from "../../lib/production-assurance/profile-lease.mjs";

// Each reproduction owns only a disposable profile and a short-lived child. A failed cleanup must
// not strand Vitest itself; the parent stops only that fixture and checks its real lock is released.
async function reproduce(mode) {
  const temporary = await mkdtemp(join(tmpdir(), "pmi-cleanup-test-"));
  const profile = join(temporary, "profile");
  await mkdir(profile);
  const leaseUrl = new URL(
    "../../lib/production-assurance/profile-lease.mjs",
    import.meta.url,
  ).href;
  const browserUrl = new URL(
    "../../lib/production-assurance/guarded-browser.ts",
    import.meta.url,
  ).href;
  const code = `
    import {acquireManagedProfileLease} from ${JSON.stringify(leaseUrl)};
    const browserModule=await import(${JSON.stringify(browserUrl)}); const {launchGuardedManagedBrowser, closeGuardedManagedBrowser, forceCloseGuardedManagedBrowser}=browserModule.default??browserModule;
    const profile=${JSON.stringify(profile)}, mode=${JSON.stringify(mode)};
    let forceCalls=0, gracefulCalls=0, closeError=null;
    async function assertStillOwned() {
      const lease=await acquireManagedProfileLease(profile,{waitMs:0}).catch(error=>error);
      if(lease?.code!=='profile_in_use') {
        await lease?.release?.();
        throw new Error('fixture_ownership_released_before_browser_ack');
      }
    }
    const context={
      route:async()=>{}, pages:()=>[], serviceWorkers:()=>[], setOffline:async()=>{},
      close:async()=>{gracefulCalls++; if(mode!=='graceful-retry'||gracefulCalls===1) throw new Error('fixture_context_close_failed');},
      browser:()=>mode==='graceful-retry'?null:{close:async()=>{
        forceCalls++; await assertStillOwned();
        if(mode==='force-retry'&&forceCalls===1) throw new Error('fixture_force_close_failed');
      }}
    };
    try {
      await launchGuardedManagedBrowser({profile,executablePath:'/fixture/chrome',headless:true,viewport:{width:100,height:100},launchTimeoutMs:2000,onMutationAttempt:()=>{},launchPersistentContext:async()=>context});
      try {await closeGuardedManagedBrowser(context);} catch(error) {closeError=error.message;}
      if(!closeError) throw new Error('fixture_cleanup_failure_was_hidden');
      if(mode==='force-retry') {
        await assertStillOwned();
        await forceCloseGuardedManagedBrowser(context);
      }
      if(mode==='graceful-retry') {
        await assertStillOwned();
        await closeGuardedManagedBrowser(context);
      }
      const next=await acquireManagedProfileLease(profile,{label:'auth-after-cleanup',waitMs:0});
      await next.release();
      console.log(JSON.stringify({result:'ok',mode,forceCalls,gracefulCalls,closeError}));
    } catch(error) {
      console.log(JSON.stringify({result:'failed',mode,code:error.code??error.message,forceCalls,gracefulCalls}));
      process.exitCode=1;
    }
  `;
  let child,
    timer,
    timedOut = false,
    stdout = "",
    stderr = "";
  try {
    child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", code],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const exitCode = await new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, 4000);
      child.once("error", reject);
      child.once("close", resolve);
    });
    clearTimeout(timer);
    const afterExit = await acquireManagedProfileLease(profile, {
      label: "fixture-parent-cleanup",
      waitMs: 2000,
    });
    await afterExit.release();
    const lines = stdout.trim().split("\n");
    const result = lines.at(-1) ? JSON.parse(lines.at(-1)) : null;
    return { exitCode, timedOut, result, stderr };
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await rm(temporary, { recursive: true, force: true });
  }
}

describe.skipIf(process.platform !== "linux")(
  "assurance cleanup owns the actual kernel profile lease",
  () => {
    it("releases after rejecting context cleanup only once the owned browser acknowledges close", async () => {
      const actual = await reproduce("force-success");
      expect(actual, JSON.stringify(actual)).toMatchObject({
        exitCode: 0,
        timedOut: false,
        result: { result: "ok", forceCalls: 1, gracefulCalls: 1 },
      });
    }, 10_000);
    it("keeps ownership and the recovery handle when both closes reject, then permits an explicit owned-browser retry", async () => {
      const actual = await reproduce("force-retry");
      expect(actual, JSON.stringify(actual)).toMatchObject({
        exitCode: 0,
        timedOut: false,
        result: { result: "ok", forceCalls: 2, gracefulCalls: 1 },
      });
    }, 10_000);
    it("retains the lease for a later graceful retry when no browser handle is available", async () => {
      const actual = await reproduce("graceful-retry");
      expect(actual, JSON.stringify(actual)).toMatchObject({
        exitCode: 0,
        timedOut: false,
        result: { result: "ok", forceCalls: 0, gracefulCalls: 2 },
      });
    }, 10_000);
  },
);
