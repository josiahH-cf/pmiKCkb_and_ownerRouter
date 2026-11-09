// Read-only rendered baseline for the November 9 contract, using the S254 loopback rehearsal.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import { readRehearsal } from "../../scripts/lib/one-path-rehearsal/control.mjs";

assert.equal(globalThis.fetch.name, "guardedFetch");
assert.equal(Socket.prototype.connect.name, "guardedConnect");
const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
const rehearsal = readRehearsal(runDir);
assert.equal(rehearsal.servedCommit, rehearsal.servedVersion);
assert.equal(rehearsal.mailAdapter, false);

const results = [];
const attempted = [];
const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
try {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1280, height: 800 },
    timezoneId: "America/Chicago",
  });
  const page = await context.newPage();
  await page.goto(origin + "/sign-in");
  assert.ok(
    await page.evaluate(() =>
      fetch("/api/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "Editor" }),
      }).then((response) => response.ok),
    ),
  );
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.continue();
    attempted.push(request.method() + " " + url.pathname);
    return route.abort("blockedbyclient");
  });
  const desk = "/lease-renewal/live/desk";
  const open = (href) => page.goto(origin + href, { waitUntil: "domcontentloaded" });
  await open(desk);
  const batch = page.getByRole("region", { name: "Working batch", exact: true });
  await batch.getByRole("table").first().waitFor({ timeout: 60_000 });
  const tables = await batch.getByRole("table").count();
  results.push({
    id: "N09-01",
    check: "one table",
    observed: tables,
    passes: tables === 1,
  });

  const prepare = batch.getByRole("region", { name: "Batch preparation", exact: true });
  const automatic = await prepare.getAttribute("data-kickoff-automatic");
  results.push({
    id: "N09-02",
    check: "no enabled automatic setting",
    observed: automatic,
    passes: automatic !== "on",
  });

  const lease = desk + "/lease/" + rehearsal.roles.prepared;
  await open(lease);
  await page
    .getByRole("region", { name: "Current renewal stage" })
    .waitFor({ timeout: 60_000 });
  const status = await page
    .getByRole("button", { name: "Work status", exact: true })
    .count();
  results.push({
    id: "N09-04",
    check: "shared Work status",
    observed: status,
    passes: status === 1,
  });
  const toggle = await page
    .getByRole("button", { name: "Full view", exact: true })
    .count();
  results.push({
    id: "N09-04",
    check: "one Full toggle",
    observed: toggle,
    passes: toggle === 1,
  });

  await open(lease + "?view=full#renewal-section-owner");
  const owner = page.locator("#renewal-section-owner");
  await owner.waitFor({ timeout: 60_000 });
  const work = await owner.locator("[data-renewal-work]").count();
  const evidence = await owner
    .locator("details[data-renewal-verification]:not([open])")
    .count();
  results.push({
    id: "N09-10",
    check: "Full outcome starts with Work and closed Verification",
    observed: { work, evidence },
    passes: work === 1 && evidence === 1,
  });

  await open("/help");
  const current = await page.locator('nav [aria-current="page"][href="/help"]').count();
  results.push({ id: "N09-09", check: "Help route preserved", observed: current });
  assert.deepEqual(attempted, [], "Reading the baseline attempted a mutation");
} finally {
  await browser.close();
  const result = {
    source: rehearsal.servedVersion,
    fixture: "November 5 mix",
    purpose: "baseline probes only",
    results,
    attempted,
    human: "NOT RUN",
  };
  writeFileSync(
    join(runDir, "november-9-baseline.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  process.stdout.write(JSON.stringify(result) + "\n");
}
