// S82 real-browser smoke for the table-first renewal desk and guided workspace.
//
// Runs read-only against the local rehearsal server (live-read-only sources; no mutation route is
// ever called). It proves table semantics, header sort/filter behavior, exact-value shortcuts,
// chips/clear recovery, workspace phase navigation, desk-view return continuity, browser Back,
// narrow contained scroll, and 200%-equivalent zoom without page-level overflow.

import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

const baseUrl = readArgument("--base-url") ?? process.env.DESK_BROWSER_BASE_URL?.trim();
if (!baseUrl) {
  throw new Error(
    "DESK_BROWSER_BASE_URL is required and must point to the running local rehearsal server.",
  );
}

const artifactDir = join(process.cwd(), "temp", "renewal-desk-browser-s82");
mkdirSync(artifactDir, { recursive: true });

const cdpUrl = readArgument("--cdp-url") ?? process.env.DESK_BROWSER_CDP_URL?.trim();
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({ executablePath: findBrowserExecutable(), headless: true });

try {
  await verifyDeskAndWorkspace();
  await verifyNarrowAndZoom();
} finally {
  await browser.close();
}

process.stdout.write(
  `S82 renewal desk browser smoke passed: table semantics, sort, header filters, shortcuts, chips/clear, workspace phases, deskView return, Back, narrow contained scroll, zoom overflow. Artifacts: ${artifactDir}\n`,
);

async function verifyDeskAndWorkspace() {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120_000);
  await signInAndOpen(page, "/lease-renewal/live/desk");

  const table = page.locator("table.renewal-table");
  await table.waitFor();
  assert(
    (await page.locator("table.renewal-table caption").count()) === 1,
    "The table lost its caption.",
  );
  assert(
    (await page.getByText(/Showing \d+ of \d+ renewals/).count()) === 1,
    "The one concise result count is missing.",
  );
  assert(
    (await page.locator(".ui-metric-grid, .renewal-worklist-card").count()) === 0,
    "A retired desk surface rendered.",
  );

  // Header sort: activating Current base rent sorts and marks aria-sort; activating again reverses.
  await page.getByRole("button", { name: /Current base rent/ }).click();
  await page.waitForURL(/sort=base_rent/);
  await table.waitFor();
  assert(
    (await page.locator('th[aria-sort="ascending"]').count()) === 1,
    "Sorting did not mark exactly one ascending header.",
  );
  await page.getByRole("button", { name: /Current base rent/ }).click();
  await page.waitForURL(/direction=desc/);
  await page.locator('th[aria-sort="descending"]').waitFor();

  // Header filter disclosure: status filter applies via its own Apply control.
  await page.getByText("Filter status", { exact: true }).click();
  const statusSelect = page.locator("#renewal-filter-overallStatus");
  await statusSelect.waitFor();
  await statusSelect.selectOption("needs_verification");
  await statusSelect
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Apply" })
    .click();
  await page.waitForURL(/overallStatus=needs_verification/);
  await table.waitFor();
  assert(
    (await page.getByText("Status: needs verification").count()) === 1,
    "The active-filter chip is missing.",
  );

  // Clear filters retains the sort and direction.
  await page.getByRole("link", { name: "Clear filters" }).click();
  await page.waitForURL(
    (url) =>
      url.toString().includes("sort=base_rent") &&
      !url.toString().includes("overallStatus="),
  );
  await table.waitFor();

  // Renewal-date shortcut applies the exact date filter.
  const dateLink = page
    .locator("tbody a")
    .filter({ hasText: /^\d{4}-\d{2}-\d{2}$/ })
    .first();
  if ((await dateLink.count()) > 0) {
    const exactDate = (await dateLink.textContent())?.trim() ?? "";
    await dateLink.click();
    await page.waitForURL((url) => url.toString().includes(`endDate=${exactDate}`));
    await page.getByRole("link", { name: "Clear filters" }).click();
    await page.waitForURL((url) => !url.toString().includes("endDate="));
    await table.waitFor();
  }

  // Open a lease from the full-row primary label, walk one phase, and return to the exact view.
  const deskUrlBefore = page.url();
  const leaseLink = page.locator("tbody a.renewal-lease-link").first();
  assert((await leaseLink.count()) > 0, "No lease link rendered.");
  await leaseLink.click();
  await page.getByRole("navigation", { name: "Renewal phases" }).waitFor();
  assert(
    page.url().includes("deskView="),
    "The workspace link dropped the desk continuation.",
  );
  const phases = page
    .getByRole("navigation", { name: "Renewal phases" })
    .getByRole("link");
  assert((await phases.count()) === 6, "The six-phase rail is incomplete.");
  await phases.nth(0).click();
  await page.waitForURL(/step=verify-renewal/);
  assert(
    (await page.getByText("Data check").count()) >= 1,
    "The verify phase lost its data check.",
  );
  await page.getByRole("link", { name: "← Back to renewals" }).click();
  await page.waitForURL((url) => url.toString() === deskUrlBefore);
  await table.waitFor();

  // Browser Back restores the workspace, then the desk again, without state invention.
  await page.goBack();
  await page.getByRole("navigation", { name: "Renewal phases" }).waitFor();
  await page.goBack();
  await page.goBack();
  await table.waitFor();

  await page.screenshot({ path: join(artifactDir, "desk-desktop.png"), fullPage: true });
  await context.close();
}

async function verifyNarrowAndZoom() {
  const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120_000);
  await signInAndOpen(page, "/lease-renewal/live/desk");
  await page.locator(".renewal-table-scroll").waitFor();
  assert(
    (await pageOverflow(page)) <= 1,
    "320px desk produced page-level horizontal overflow.",
  );
  const scrollRegion = page.getByRole("region", { name: "Renewal table" });
  assert(
    (await scrollRegion.getAttribute("tabindex")) === "0",
    "The contained scroll region is not keyboard reachable.",
  );
  await page.screenshot({ path: join(artifactDir, "desk-320.png"), fullPage: true });
  await context.close();

  const zoomContext = await browser.newContext({
    viewport: { width: 680, height: 450 },
    deviceScaleFactor: 2,
  });
  const zoomPage = await zoomContext.newPage();
  zoomPage.setDefaultNavigationTimeout(120_000);
  await signInAndOpen(zoomPage, "/lease-renewal/live/desk");
  await zoomPage.locator(".renewal-table-scroll").waitFor();
  assert(
    (await pageOverflow(zoomPage)) <= 1,
    "200%-equivalent desk produced page-level overflow.",
  );
  await zoomPage.screenshot({
    path: join(artifactDir, "desk-zoom-200.png"),
    fullPage: true,
  });
  await zoomContext.close();
}

async function signInAndOpen(page, path) {
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
  const response = await page.goto(`${baseUrl}${path}`, {
    waitUntil: "domcontentloaded",
  });
  assert(response && response.status() < 500, `${path} returned an error response.`);
}

async function pageOverflow(page) {
  return page.evaluate(
    () =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      document.documentElement.clientWidth,
  );
}

function findBrowserExecutable() {
  const configured = process.env.DESK_BROWSER_EXECUTABLE?.trim();
  const candidates = configured
    ? [configured]
    : [
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
        "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe",
      ];
  const executable = candidates.find((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  if (!executable) {
    throw new Error("Chrome or Edge was not found for the S82 browser smoke.");
  }
  return executable;
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
