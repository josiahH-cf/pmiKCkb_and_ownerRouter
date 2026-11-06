import { resolveBrowserExecutable as findBrowserExecutable } from "./lib/browser-executable.mjs";
// S111 browser verification uses exact semantic roles/names and owning scopes from the guide.
// Required controls must be visible. Conditional controls report their live availability separately;
// isolated owning fixtures prove those states without manufacturing customer data.
//
// S252: the bare desk opens the working batch (S246) and a lease opens in Guided view in the same
// tab (S247). A map row that lives in the full lease table names its preparation
// (`click-link:All leases and filters`); a guided-view row names its own preparation (none, or a
// path step to choose), and every other workspace row is located in Full view as before. L54: each
// of the 70 rows of the starting commit's map (tests/fixtures/s252/starting-renewal-control-map.json)
// is found under its step id by role and accessible name on its own page, or by the new name its
// row records in `formerly`, and the page and view are printed per row.
//
// It also walks desk to lease and back, from the working batch and from All leases and filters, so
// the guide's "the desk opens with the same month, group and place you left" claim is proven
// rather than asserted. Everything is read-only; the rehearsal surface refuses changes.

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";
import {
  assertGuideControl,
  GUIDE_CONTROL_MAP_PATH,
  loadGuideSteps,
} from "./lib/renewal-guide-controls.mjs";

const baseUrlInput =
  readArgument("--base-url") ?? process.env.DESK_BROWSER_BASE_URL?.trim();
if (!baseUrlInput) {
  throw new Error(
    "DESK_BROWSER_BASE_URL is required and must point to the running local rehearsal server.",
  );
}
const baseUrl = requireLocalRehearsalOrigin(baseUrlInput);
const ROUTE_BUDGET_MS = 90_000;
const ALL_LEASES_PATH = "/lease-renewal/live/desk?v=2&scope=all";
const STARTING_MAP_PATH = "tests/fixtures/s252/starting-renewal-control-map.json";

const artifactDir = join(process.cwd(), "temp", "renewal-guide-controls-s111");
mkdirSync(artifactDir, { recursive: true });

const steps = loadGuideSteps();
if (steps.length < 5) {
  throw new Error(
    `The help hub's renewal control map (${GUIDE_CONTROL_MAP_PATH}) produced ${steps.length} steps; it must name every step the guides teach.`,
  );
}
const starting = JSON.parse(readFileSync(join(process.cwd(), STARTING_MAP_PATH), "utf8"));
const continuity = startingRowContinuity(starting.rows, steps);

const cdpUrl = readArgument("--cdp-url") ?? process.env.DESK_BROWSER_CDP_URL?.trim();
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({ executablePath: findBrowserExecutable(), headless: true });

let located;
try {
  located = await verifyGuideControls();
  await verifyDeskReturn();
} finally {
  await browser.close();
}

const l54 = reportStartingRows(continuity, located);
process.stdout.write(
  `S111 renewal guide control smoke passed: ${steps.length} guide steps located by exact semantic locators (conditional availability reported separately); L54: ${l54.found} of ${starting.rows.length} starting-commit rows found (${l54.renamed} by a recorded new name, ${l54.conditional} conditional and not shown in this state); desk to lease and back preserved the batch and the table view in one tab. Artifacts: ${artifactDir}\n`,
);

/** L54: each starting row by step id: kept, renamed with its recorded former name, or a problem. */
function startingRowContinuity(rows, current) {
  const byStep = new Map(current.map((row) => [row.step, row]));
  const result = [];
  const problems = [];
  for (const old of rows) {
    const row = byStep.get(old.step);
    if (!row) {
      problems.push(`starting row ${old.step} (${old.role} "${old.control}") is gone`);
      continue;
    }
    const kept = row.control === old.control && row.role === old.role;
    const renamed =
      !kept && row.formerly?.control === old.control && row.formerly?.role === old.role;
    if (!kept && !renamed) {
      problems.push(
        `starting row ${old.step} (${old.role} "${old.control}") is now ${row.role} "${row.control}" with no recorded former name`,
      );
      continue;
    }
    result.push({ old, row, state: kept ? "kept" : "renamed" });
  }
  assert(problems.length === 0, `L54: ${problems.join("; ")}.`);
  return result;
}

function reportStartingRows(rows, states) {
  let found = 0;
  let renamed = 0;
  let conditional = 0;
  for (const { old, row, state } of rows) {
    const seen = states.get(row.step);
    assert(seen, `L54: starting row ${old.step} was never looked for.`);
    if (seen.availability === "unavailable") conditional += 1;
    found += 1;
    if (state === "renamed") renamed += 1;
    process.stdout.write(
      `L54 row ${old.step}: ${old.role} "${old.control}" ${state === "kept" ? "found" : `found as ${row.role} "${row.control}"`} on ${seen.page} in ${seen.view} (${seen.availability}).\n`,
    );
  }
  return { found, renamed, conditional };
}

/** A row's own preparation, when it names one; workspace rows without it open Full view. */
function preparationFor(step) {
  if (Array.isArray(step.actions)) return step.actions;
  return step.page.startsWith("workspace:") ? ["full-view"] : [];
}

async function perform(page, action) {
  if (action === "full-view") {
    // S152: a workspace row is located in Full view. The switch renders before the page hydrates,
    // and a press that lands first is lost, so it is pressed until it reports Full view.
    const fullView = page.getByRole("button", { name: "Full view", exact: true });
    await fullView.waitFor({ state: "visible", timeout: 90_000 });
    for (let press = 1; ; press += 1) {
      await fullView.click();
      const opened = await page
        .getByRole("button", { name: "Full view", exact: true, pressed: true })
        .waitFor({ state: "visible", timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
      if (opened) return;
      assert(press < 10, "The lease workspace did not switch to Full view.");
    }
  }
  const [kind, ...rest] = action.split(":");
  const name = rest.join(":");
  if (kind === "click-link") {
    const link = page.getByRole("link", { name, exact: true }).first();
    await link.waitFor({ state: "visible" });
    await link.click();
    // An in-page navigation: wait for what it opens, never for network idle.
    if (name === "All leases and filters")
      await page.locator("table.renewal-table").first().waitFor({ state: "visible" });
    return;
  }
  if (kind === "click-button") {
    // A path step: a press before hydration is lost, so press until the step reports it is shown.
    const button = page
      .getByRole("navigation", { name: "Renewal path", exact: true })
      .getByRole("button", { name, exact: true });
    await button.waitFor({ state: "visible" });
    for (let press = 1; ; press += 1) {
      await button.click();
      const shown = await page
        .getByRole("navigation", { name: "Renewal path", exact: true })
        .getByRole("button", { name, exact: true, pressed: true })
        .waitFor({ state: "visible", timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
      if (shown) return;
      assert(press < 10, `The path step ${name} did not open.`);
    }
  }
  throw new Error(`Unknown control map preparation ${action}.`);
}

async function verifyGuideControls() {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  page.setDefaultTimeout(ROUTE_BUDGET_MS);
  await signIn(page);

  // A verified lease workspace, chosen from the full lease table by the same rule as before.
  await page.goto(`${baseUrl}${ALL_LEASES_PATH}`, { waitUntil: "domcontentloaded" });
  const firstWorkspace = page
    .locator(
      'table.renewal-table tbody tr[data-workspace-available="true"]:is([data-disposition="actionable"], [data-retention-state="tracked_incomplete"]) a.renewal-lease-link',
    )
    .first();
  await firstWorkspace.waitFor();
  const workspaceHref = await firstWorkspace.getAttribute("href");
  assert(
    workspaceHref?.startsWith("/lease-renewal/live/desk/lease/"),
    "No verified lease workspace is available for the guide smoke.",
  );
  const byPage = new Map();
  for (const step of steps) {
    const key = `${step.page}|${preparationFor(step).join(",")}`;
    if (!byPage.has(key)) byPage.set(key, []);
    byPage.get(key).push(step);
  }

  const states = new Map();
  for (const [key, pageSteps] of byPage) {
    const path = pageSteps[0].page;
    const preparation = preparationFor(pageSteps[0]);
    const destination = path.startsWith("workspace:")
      ? new URL(workspaceHref, baseUrl)
      : new URL(path, baseUrl);
    if (path.startsWith("workspace:")) {
      destination.searchParams.set("step", path.slice("workspace:".length));
      destination.hash = "";
    }
    const response = await page.goto(destination.href, {
      waitUntil: "domcontentloaded",
    });
    assert(
      response && response.status() < 500,
      `The guide names ${path}, which returned an error response.`,
    );
    if (path.startsWith("workspace:"))
      await page
        .getByRole("group", { name: "Lease view", exact: true })
        .waitFor({ state: "visible", timeout: 90_000 });
    for (const action of preparation) await perform(page, action);
    const view = path.startsWith("workspace:")
      ? preparation.includes("full-view")
        ? "Full view"
        : "Guided view"
      : preparation.includes("click-link:All leases and filters")
        ? "All leases and filters"
        : "the working batch";
    for (const step of pageSteps) {
      const availability = await assertGuideControl(page, step);
      states.set(step.step, { availability, page: path, view });
      process.stdout.write(
        `Guide step ${step.step}: ${availability} (${step.availability}) on ${path} in ${view}.\n`,
      );
    }
    await page.screenshot({
      path: join(artifactDir, `${key.replace(/[^a-zA-Z0-9]+/g, "_") || "_root"}.png`),
      fullPage: false,
    });
  }
  await context.close();
  return states;
}

async function verifyDeskReturn() {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  page.setDefaultTimeout(ROUTE_BUDGET_MS);
  await signIn(page);

  // From All leases and filters: the lease opens in this tab, and Back to renewals returns to the
  // same table view with the same first row.
  await page.goto(`${baseUrl}${ALL_LEASES_PATH}`, { waitUntil: "domcontentloaded" });
  const table = page.locator("table.renewal-table");
  await table.waitFor();
  const firstLease = table.locator("tbody tr a.renewal-lease-link").first();
  await firstLease.waitFor();
  const leaseLabel = (await firstLease.innerText()).trim();
  await firstLease.click();
  await page.getByRole("link", { name: "← Back to renewals" }).waitFor();
  assert(
    page.url().includes("/lease-renewal/live/desk/lease/"),
    "Opening a lease from the table did not reach its workspace.",
  );
  assert(
    context.pages().length === 1,
    "Opening a lease from the table opened another tab; a lease opens in the same tab.",
  );
  await page.getByRole("link", { name: "← Back to renewals" }).click();
  const returnedTable = page.locator("table.renewal-table");
  await returnedTable.waitFor();
  assert(
    page.url().includes("v=2"),
    "Returning from the workspace dropped the desk view the operator was on.",
  );
  const returned = (
    await returnedTable.locator("tbody tr a.renewal-lease-link").first().innerText()
  ).trim();
  assert(returned === leaseLabel, "Returning to the desk changed the first row.");

  // From the working batch: the row's link opens the lease in this tab, and Back to renewals
  // returns to the same working month with the same lease listed.
  await page.goto(`${baseUrl}/lease-renewal/live/desk`, {
    waitUntil: "domcontentloaded",
  });
  const batch = page.getByRole("region", { name: "Working batch", exact: true });
  await batch.waitFor();
  const month = await batch.getAttribute("data-batch-month");
  const row = batch.locator("[data-batch-lease]:has(a.renewal-batch-lease)").first();
  await row.waitFor();
  const rowLease = await row.getAttribute("data-batch-lease");
  await row.locator("a.renewal-batch-lease").click();
  await page.getByRole("link", { name: "← Back to renewals" }).waitFor();
  assert(
    page.url().includes(`/lease-renewal/live/desk/lease/${rowLease}`),
    "Choosing a batch row did not open that lease.",
  );
  assert(
    context.pages().length === 1,
    "Choosing a batch row opened another tab; a lease opens in the same tab.",
  );
  await page.getByRole("link", { name: "← Back to renewals" }).click();
  const returnedBatch = page.getByRole("region", { name: "Working batch", exact: true });
  await returnedBatch.waitFor();
  assert(
    (await returnedBatch.getAttribute("data-batch-month")) === month,
    "Returning from the lease changed the working month.",
  );
  assert(
    (await returnedBatch.locator(`[data-batch-lease="${rowLease}"]`).count()) > 0,
    "Returning from the lease no longer lists the lease that was opened.",
  );
  await context.close();
}

async function signIn(page) {
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded" });
  const signedIn = await page.evaluate(async () => {
    const response = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Admin" }),
    });
    return response.ok;
  });
  assert(signedIn, "Local rehearsal Admin sign-in did not complete.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readArgument(name) {
  const joined = process.argv
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim();
  if (joined) return joined;
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  return value || undefined;
}

function requireLocalRehearsalOrigin(value) {
  let candidate;
  try {
    candidate = new URL(value);
  } catch {
    throw new Error(
      "DESK_BROWSER_BASE_URL must be an explicit loopback HTTP local-rehearsal origin.",
    );
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (
    candidate.protocol !== "http:" ||
    !loopbackHosts.has(candidate.hostname.toLowerCase()) ||
    candidate.username !== "" ||
    candidate.password !== "" ||
    candidate.pathname !== "/" ||
    candidate.search !== "" ||
    candidate.hash !== ""
  ) {
    throw new Error(
      "DESK_BROWSER_BASE_URL must be an explicit loopback HTTP local-rehearsal origin.",
    );
  }
  return candidate.origin;
}
