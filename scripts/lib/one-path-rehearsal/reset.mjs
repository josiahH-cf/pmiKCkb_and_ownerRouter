// S252 R-S252-2: put a running one-path rehearsal back to its starting state, so the journey
// driver (tests/browser/one-path-journey-driver.mjs) can run each builder's named, self-checking
// steps from the state those steps were written for, on the same server and in the same run.
//
// It clears what the rehearsal itself holds and nothing else: the stand-ins' kept mail, requests
// and modes, the RentVine control flags and outage file in the private run directory, and every
// document in the rehearsal's own Firestore emulator (127.0.0.1, a *-test project). Then it runs
// the same seed steps the harness runs at start (seeds.mjs), through the served app's routes, with
// the recorded cycle dates served while they run, exactly as scripts/one-path-rehearsal.mjs does.
// The Auth emulator's local demo accounts are kept. Nothing here reaches beyond this machine.
import { join } from "node:path";

import {
  clearEmulatorDocuments,
  clearRentvineFlags,
  resetStandIns,
  setRecordingCycles,
  setRentvineOutage,
} from "./control.mjs";
import {
  loadNovember5Mix,
  NOVEMBER_5_MIX_PATH,
  readNovember5Mix,
} from "./november-5-mix.mjs";
import { runSeeds } from "./seeds.mjs";

/** The mix as the running rehearsal loaded it (the same business date). */
export function rehearsalMix(rehearsal) {
  return loadNovember5Mix(
    readNovember5Mix(join(process.cwd(), NOVEMBER_5_MIX_PATH)),
    rehearsal.businessDate,
  );
}

/**
 * Reset and seed again. `browser` is a Playwright browser of the calling driver; a context of its
 * own is used and closed. Resolves with the seed results, in the shape rehearsal.json records.
 */
export async function resetRehearsalState({ rehearsal, browser }) {
  const origin = rehearsal.origin;
  await resetStandIns(rehearsal);
  await clearEmulatorDocuments(rehearsal);
  clearRentvineFlags(rehearsal);
  setRentvineOutage(rehearsal, null);
  setRecordingCycles(rehearsal, true);
  const context = await browser.newContext({ timezoneId: "America/Chicago" });
  try {
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort("blockedbyclient"),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(120_000);
    page.setDefaultNavigationTimeout(180_000);
    await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
    const signedIn = await page.evaluate(() =>
      fetch("/api/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "Editor" }),
      }).then((response) => response.ok),
    );
    if (!signedIn) throw new Error("Local demo Editor sign-in failed after the reset.");
    return await runSeeds({ page, mix: rehearsalMix(rehearsal), rehearsal, origin });
  } finally {
    // Whatever the seeds did, the desk is left reading the current RentVine dates.
    setRecordingCycles(rehearsal, false);
    await context.close().catch(() => undefined);
  }
}
