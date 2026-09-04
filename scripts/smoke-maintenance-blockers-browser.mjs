// S108 real-browser smoke for the maintenance blocker report, waiting-on filter, and the
// Admin-managed property preapproval control.
//
// Runs read-only against the local rehearsal server. It opens the Maintenance page, proves the
// report renders with its documented columns, proves the queue's waiting-on filter narrows the list
// without reloading, and proves the preapproval control asks for a cancel-first confirmation before
// it would record anything. It never submits a preapproval, never records an estimate, and never
// calls a provider route.

import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

const baseUrlInput =
  readArgument("--base-url") ?? process.env.DESK_BROWSER_BASE_URL?.trim();
if (!baseUrlInput) {
  throw new Error(
    "DESK_BROWSER_BASE_URL is required and must point to the running local rehearsal server.",
  );
}
const baseUrl = requireLocalRehearsalOrigin(baseUrlInput);
const ROUTE_DOM_BUDGET_MS = 60_000;
const INTERACTION_BUDGET_MS = 20_000;

const artifactDir = join(process.cwd(), "temp", "maintenance-blockers-browser-s108");
mkdirSync(artifactDir, { recursive: true });

const cdpUrl = readArgument("--cdp-url") ?? process.env.DESK_BROWSER_CDP_URL?.trim();
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({ executablePath: findBrowserExecutable(), headless: true });

try {
  await verifyBlockerSurfaces();
} finally {
  await browser.close();
}

process.stdout.write(
  `S108 maintenance blocker browser smoke passed: report columns, waiting-on filter, cancel-first preapproval confirmation, no provider call. Artifacts: ${artifactDir}\n`,
);

async function verifyBlockerSurfaces() {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_DOM_BUDGET_MS);
  page.setDefaultTimeout(INTERACTION_BUDGET_MS);

  // A provider route reached from a page render would break the human-initiated read rule.
  const providerCalls = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/maintenance/rentvine-work-orders") providerCalls.push(path);
  });

  await signInAndOpen(page, "/maintenance");

  const report = page.getByRole("region", { name: "What each ticket is waiting on" });
  await report.waitFor();
  const headers = await report.locator("thead th").allInnerTexts();
  for (const column of [
    "Ticket",
    "Unit",
    "Waiting on",
    "Estimate",
    "Preapproval",
    "Assignee",
    "Last activity",
    "RentVine",
  ]) {
    assert(
      headers.includes(column),
      `The blocker report is missing the ${column} column.`,
    );
  }

  const queue = page.getByRole("region", { name: "Ticket queue" });
  await queue.waitFor();
  const filter = queue.getByLabel("Waiting on filter");
  await filter.waitFor();
  const openBefore = await queue.locator("article.maintenance-ticket").count();
  await filter.selectOption("owner_approval");
  const openAfter = await queue.locator("article.maintenance-ticket").count();
  assert(
    openAfter <= openBefore,
    "Filtering by waiting-on returned more tickets than the unfiltered queue.",
  );
  assert(
    page.url().endsWith("/maintenance"),
    "The waiting-on filter navigated instead of narrowing in place.",
  );
  await filter.selectOption("all");
  assert(
    (await queue.locator("article.maintenance-ticket").count()) === openBefore,
    "Clearing the waiting-on filter did not restore the full queue.",
  );

  const preapprovals = page.getByRole("region", { name: "Property preapprovals" });
  await preapprovals.waitFor();
  const review = preapprovals.getByRole("button", { name: "Review this preapproval" });
  await review.waitFor();
  assert(
    await review.isDisabled(),
    "The preapproval review button is enabled before an exact property, amount, and date exist.",
  );
  await preapprovals.getByLabel("Property key").fill("7");
  await preapprovals.getByLabel("Preapproved amount").fill("500");
  await preapprovals.getByLabel("Effective from").fill("2026-01-01");
  await review.click();
  const confirmation = preapprovals.getByRole("status");
  await confirmation.waitFor();
  const confirmationText = await confirmation.innerText();
  assert(
    confirmationText.includes("$500.00") && confirmationText.includes("7"),
    "The preapproval confirmation does not restate the exact amount and property.",
  );
  await preapprovals.getByRole("button", { name: "Cancel" }).click();
  assert(
    (await preapprovals.getByRole("status").count()) === 0,
    "Cancel did not withdraw the preapproval confirmation.",
  );

  assert(
    providerCalls.length === 0,
    `The Maintenance page called the RentVine work-order route ${providerCalls.length} time(s) without a person asking.`,
  );
  await page.screenshot({
    path: join(artifactDir, "maintenance-blockers.png"),
    fullPage: true,
  });
  await context.close();
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
    throw new Error("Chrome or Edge was not found for the S108 browser smoke.");
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
