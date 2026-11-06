// S249 release gate: a verification session never starts a lookup. Run it with
//
//   bash scripts/run-renewal-one-path-rehearsal.sh --overlay --no-mail-adapter --driver tests/browser/one-path-kickoff-verification-driver.mjs
//
// --no-mail-adapter serves the app without REHEARSAL_STAND_IN_ORIGIN, so the server is outside the
// rehearsal exemption, as a verification session's server is: resolveRehearsalStandIn() answers
// null and the desk tells the page it is not the isolated rehearsal. The comparison stand-in still
// answers through the provider boundary, so any lookup that started would be counted there.
//
// The browser is automated (navigator.webdriver is true), the reviewed setting is on (its shipped
// default) and the allowance is open. Every request the page makes goes through a guard the
// canary's guarded browser launcher mirrors (lib/production-assurance/guarded-browser.ts): a
// request that is not GET, HEAD or OPTIONS is aborted before it leaves the browser and counted.
// The driver opens the working batch and the prepared lease, waits past the automatic start's
// visible-and-idle delay, and checks: zero comparison requests at the stand-in, zero mutation
// attempts, and no refused connection. The result goes to kickoff-verification.json.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";

import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import {
  readRehearsal,
  refusedConnections,
  resetComparisonLog,
  setComparisonAllowance,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";

const fetchGuarded = globalThis.fetch?.name === "guardedFetch";
const socketGuarded = net.Socket.prototype.connect.name === "guardedConnect";
if (!fetchGuarded || !socketGuarded) {
  process.stderr.write(
    "The rehearsal network boundary is not loaded in the driver process; nothing was run.\n",
  );
  process.exit(2);
}

const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
assert.ok(runDir, "Run through scripts/run-renewal-one-path-rehearsal.sh.");
const rehearsal = readRehearsal(runDir);
if (rehearsal.mailAdapter !== false) {
  process.stderr.write(
    "Run this proof with --no-mail-adapter: with the adapter the server is the isolated rehearsal and the exemption applies.\n",
  );
  process.exit(2);
}
const { prepared } = rehearsal.roles;

const checks = [];
const check = (name, passed, observed) => {
  checks.push({ name, passed: Boolean(passed), observed });
  process.stdout.write(`${passed ? "ok  " : "FAIL"} ${name}\n`);
};
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
let exitCode = 1;
try {
  await setComparisonAllowance(rehearsal, false);
  await resetComparisonLog(rehearsal);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    timezoneId: "America/Chicago",
    locale: "en-US",
  });
  // Sign-in is the one write the session needs; it happens before the guard is installed, on a
  // separate page, exactly as the canary signs in before its read-only inspection.
  const signInPage = await context.newPage();
  await signInPage.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
  assert.ok(
    await signInPage.evaluate(() =>
      fetch("/api/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "Editor" }),
      }).then((response) => response.ok),
    ),
    "Local demo Editor sign-in failed.",
  );
  await signInPage.close();

  const mutationAttempts = [];
  const offOrigin = [];
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      offOrigin.push(url.origin);
      return route.abort("blockedbyclient");
    }
    if (!SAFE_METHODS.has(request.method())) {
      mutationAttempts.push(`${request.method()} ${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(240_000);
  page.setDefaultNavigationTimeout(240_000);
  const webdriver = await page.evaluate(() => navigator.webdriver);

  await page.goto(`${origin}/lease-renewal/live/desk`, { waitUntil: "domcontentloaded" });
  const batch = page.getByRole("region", { name: "Batch preparation", exact: true });
  await batch.waitFor();
  const setting = await batch.getAttribute("data-kickoff-automatic");
  const targets = Number(await batch.getAttribute("data-kickoff-targets"));
  // Well past the visible-and-idle delay (AUTOMATIC_START_IDLE_MS) the automatic start waits for.
  await page.waitForTimeout(8000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await batch.waitFor();
  await page.waitForTimeout(8000);
  await page.goto(`${origin}/lease-renewal/live/desk/lease/${prepared}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("group", { name: "Lease view", exact: true }).waitFor();
  await page.waitForTimeout(5000);
  const comparisons = (await standInState(rehearsal)).comparison.comparisonsByLease ?? {};

  check(
    "the session is automated, the setting is on and the batch has leases with no stored comparison",
    webdriver === true && setting === "on" && targets > 0,
    { webdriver, setting, targets },
  );
  check(
    "a verification session starts no lookup: zero comparison requests at the stand-in",
    Object.keys(comparisons).length === 0,
    { comparisons },
  );
  check(
    "a verification session makes no mutation attempt (every non-GET request is aborted and counted)",
    mutationAttempts.length === 0,
    { mutationAttempts },
  );
  const refused = refusedConnections(rehearsal);
  check(
    "nothing left the machine: no off-origin request and no refused connection",
    offOrigin.length === 0 && refused.length === 0,
    { offOrigin, refused: refused.slice(0, 10) },
  );
  exitCode = checks.every((entry) => entry.passed) ? 0 : 1;
} catch (error) {
  checks.push({
    name: "driver ran to the end",
    passed: false,
    observed: String(error?.stack ?? error).slice(0, 2000),
  });
  process.stdout.write(
    `FAIL driver ran to the end: ${String(error?.message ?? error)}\n`,
  );
  exitCode = 1;
} finally {
  writeFileSync(
    join(runDir, "kickoff-verification.json"),
    `${JSON.stringify({ checks }, null, 2)}\n`,
  );
  await browser.close().catch(() => undefined);
}
process.exit(exitCode);
