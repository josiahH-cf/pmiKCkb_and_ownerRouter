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
//
// What it cannot clear: the served app's own memory. The server's RentVine read is read again
// before the seeds (as the harness's first read is), but its per-address comparison result cache
// (lib/lease-renewal/rentcast-quota.ts, six hours) stays, so a lease looked up earlier in the run
// is answered from that cache without a stand-in request. The journey orders its phases so that a
// phase which counts comparison requests runs before anything else looks those leases up.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  clearEmulatorDocuments,
  clearRentvineFlags,
  REHEARSAL_FILE,
  resetStandIns,
  setRecordingCycles,
  setRentvineOutage,
  setTenantResponsePauseFault,
} from "./control.mjs";
import {
  loadNovember5Mix,
  NOVEMBER_5_MIX_PATH,
  readNovember5Mix,
} from "./november-5-mix.mjs";
import { forceSourceRefresh, runSeeds, SEED_STEPS } from "./seeds.mjs";

/**
 * The seed steps the running rehearsal started with, as scripts/one-path-rehearsal.mjs runs them:
 * a compiled synthetic-mail run leaves the replied owner message out (the S260 driver reads that
 * lease's field as absent there). S284 passes these to resetRehearsalState, so a qualification
 * replay or journey that starts again starts from the same state the run itself started from.
 */
export function startingSeedSteps(rehearsal) {
  return rehearsal?.compiledMail != null
    ? SEED_STEPS.filter(({ name }) => name !== "replied-owner-message")
    : SEED_STEPS;
}

/** The mix as the running rehearsal loaded it (the same business date). */
export function rehearsalMix(rehearsal) {
  return loadNovember5Mix(
    readNovember5Mix(join(process.cwd(), NOVEMBER_5_MIX_PATH)),
    rehearsal.businessDate,
  );
}

/**
 * Reset and seed again. `browser` is a Playwright browser of the calling driver; a context of its
 * own is used and closed. `steps` are the seed steps to run (every step when left out, as before;
 * startingSeedSteps(rehearsal) for the run's own starting state). Resolves with the seed results,
 * in the shape rehearsal.json records.
 */
export async function resetRehearsalState({ rehearsal, browser, steps = SEED_STEPS }) {
  const origin = rehearsal.origin;
  await resetStandIns(rehearsal);
  await clearEmulatorDocuments(rehearsal);
  clearRentvineFlags(rehearsal);
  setRentvineOutage(rehearsal, null);
  // S284 W12-05: a write fault one row armed never reaches the next.
  if (rehearsal.files?.firestoreFault) setTenantResponsePauseFault(rehearsal, false);
  setRecordingCycles(rehearsal, true);
  const context = await browser.newContext({
    timezoneId: "America/Chicago",
    serviceWorkers: "block",
  });
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
    // The server keeps its last RentVine read in memory, and that read showed the current dates.
    // The seeds expect the server's first read to show the recorded cycle dates, as it does when
    // the harness starts, so the server reads RentVine again now, while those dates are served.
    const refreshed = await forceSourceRefresh(page);
    const seeds = await runSeeds(
      {
        page,
        mix: rehearsalMix(rehearsal),
        rehearsal,
        origin,
      },
      steps,
    );
    // A driver reads what the seeds made (for example the replied lease's message id) from
    // rehearsal.json, so the description names this state's seeds; the first ones are kept beside.
    const file = join(rehearsal.runDir, REHEARSAL_FILE);
    const described = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(
      file,
      `${JSON.stringify({ ...described, seedsAtStart: described.seedsAtStart ?? described.seeds, seeds }, null, 2)}\n`,
    );
    return [
      {
        name: "reset",
        suite: "S252",
        state: refreshed.body?.refreshed ? "seeded" : "skipped",
        detail: refreshed.body?.refreshed
          ? "Stand-ins, RentVine controls and the emulator cleared; RentVine read again with the recorded cycle dates."
          : `RentVine was not read again before the seeds (HTTP ${refreshed.status}).`,
      },
      ...seeds,
    ];
  } finally {
    // Whatever the seeds did, the desk is left reading the current RentVine dates.
    setRecordingCycles(rehearsal, false);
    await context.close().catch(() => undefined);
  }
}
