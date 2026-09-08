import { resolveBrowserExecutable as findBrowserExecutable } from "./lib/browser-executable.mjs";
// S111 browser verification uses exact semantic roles/names and owning scopes from the guide.
// Required controls must be visible. Conditional controls report their live availability separately;
// isolated owning fixtures prove those states without manufacturing customer data.
//
// It also walks desk to lease and back, so the guide's "your filters come back with you" claim is
// proven rather than asserted. Everything is read-only; the rehearsal surface refuses changes.

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";
import { assertGuideControl, parseGuideSteps } from "./lib/renewal-guide-controls.mjs";

const GUIDE_PATH = "docs/products/renewal-operator-guide.md";

const baseUrlInput =
  readArgument("--base-url") ?? process.env.DESK_BROWSER_BASE_URL?.trim();
if (!baseUrlInput) {
  throw new Error(
    "DESK_BROWSER_BASE_URL is required and must point to the running local rehearsal server.",
  );
}
const baseUrl = requireLocalRehearsalOrigin(baseUrlInput);
const ROUTE_BUDGET_MS = 90_000;

const artifactDir = join(process.cwd(), "temp", "renewal-guide-controls-s111");
mkdirSync(artifactDir, { recursive: true });

const steps = parseGuideSteps(readFileSync(GUIDE_PATH, "utf8"));
if (steps.length < 5) {
  throw new Error(
    `The training guide's step-to-control table produced ${steps.length} steps; it must name every step it teaches.`,
  );
}

const cdpUrl = readArgument("--cdp-url") ?? process.env.DESK_BROWSER_CDP_URL?.trim();
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({ executablePath: findBrowserExecutable(), headless: true });

try {
  await verifyGuideControls();
  await verifyDeskReturn();
} finally {
  await browser.close();
}

process.stdout.write(
  `S111 renewal guide control smoke passed: ${steps.length} guide steps located by exact semantic locators (conditional availability reported separately), desk to lease and back preserved the view. Artifacts: ${artifactDir}\n`,
);

async function verifyGuideControls() {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  page.setDefaultTimeout(ROUTE_BUDGET_MS);
  await signIn(page);

  await page.goto(`${baseUrl}/lease-renewal`, { waitUntil: "domcontentloaded" });
  const firstWorkspace = page
    .locator(
      'table.renewal-table tbody tr[data-workspace-available="true"] a.renewal-lease-link',
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
    if (!byPage.has(step.page)) byPage.set(step.page, []);
    byPage.get(step.page).push(step);
  }

  for (const [path, pageSteps] of byPage) {
    const destination = path.startsWith("workspace:")
      ? new URL(workspaceHref, baseUrl)
      : new URL(path, baseUrl);
    if (path.startsWith("workspace:"))
      destination.searchParams.set("step", path.slice("workspace:".length));
    const response = await page.goto(destination.href, {
      waitUntil: "domcontentloaded",
    });
    assert(
      response && response.status() < 500,
      `The guide names ${path}, which returned an error response.`,
    );
    for (const step of pageSteps) {
      const availability = await assertGuideControl(page, step);
      process.stdout.write(
        `Guide step ${step.step}: ${availability} (${step.availability}).\n`,
      );
    }
    await page.screenshot({
      path: join(artifactDir, `${path.replaceAll("/", "_") || "_root"}.png`),
      fullPage: false,
    });
  }
  await context.close();
}

async function verifyDeskReturn() {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  page.setDefaultTimeout(ROUTE_BUDGET_MS);
  await signIn(page);

  const deskUrl = `${baseUrl}/lease-renewal/live/desk?v=2&scope=all`;
  await page.goto(deskUrl, { waitUntil: "domcontentloaded" });
  const table = page.locator("table.renewal-table");
  await table.waitFor();
  const firstLease = table.locator("tbody tr a").first();
  await firstLease.waitFor();
  const leaseLabel = (await firstLease.innerText()).trim();
  await firstLease.click();

  await page.getByRole("link", { name: "← Back to renewals" }).waitFor();
  assert(
    page.url().includes("/lease-renewal/live/desk/lease/"),
    "Opening a lease from the table did not reach its workspace.",
  );
  await page.getByRole("link", { name: "← Back to renewals" }).click();
  await table.waitFor();
  assert(
    page.url().includes("v=2"),
    "Returning from the workspace dropped the desk view the operator was on.",
  );
  const returned = (await table.locator("tbody tr a").first().innerText()).trim();
  assert(returned === leaseLabel, "Returning to the desk changed the first row.");
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
