// S111 real-browser proof that every training-guide step names a control the operator can actually
// see. It parses the step-to-control table out of `docs/products/renewal-operator-guide.md`, opens
// each page it names on the local rehearsal server, and asserts the exact visible text is on that
// page. A guide step whose control the smoke cannot find fails, which is the point: the guide cannot
// drift away from the application.
//
// It also walks desk to lease and back, so the guide's "your filters come back with you" claim is
// proven rather than asserted. Everything is read-only; the rehearsal surface refuses changes.

import { accessSync, constants, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

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
  `S111 renewal guide control smoke passed: ${steps.length} guide steps located by visible text, desk to lease and back preserved the view. Artifacts: ${artifactDir}\n`,
);

async function verifyGuideControls() {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  page.setDefaultTimeout(ROUTE_BUDGET_MS);
  await signIn(page);

  const byPage = new Map();
  for (const step of steps) {
    if (!byPage.has(step.page)) byPage.set(step.page, []);
    byPage.get(step.page).push(step);
  }

  for (const [path, pageSteps] of byPage) {
    const response = await page.goto(`${baseUrl}${path}`, {
      waitUntil: "domcontentloaded",
    });
    assert(
      response && response.status() < 500,
      `The guide names ${path}, which returned an error response.`,
    );
    const text = await page.locator("body").innerText();
    for (const step of pageSteps) {
      assert(
        text.includes(step.control),
        `Guide step "${step.step}" names the control "${step.control}" on ${path}, and it is not on that page.`,
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
  assert(
    returned === leaseLabel,
    `Returning to the desk changed the first row from "${leaseLabel}" to "${returned}".`,
  );
  await context.close();
}

/** Parse the guide's step-to-control table. Column order is fixed by the guide itself. */
function parseGuideSteps(markdown) {
  const rows = [];
  let inTable = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("| Step ")) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith("|")) break;
    if (/^\|\s*-+/.test(line)) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 4) continue;
    rows.push({
      step: cells[0],
      page: stripCode(cells[1]),
      control: stripCode(cells[2]),
      expectation: cells[3],
    });
  }
  return rows;
}

function stripCode(cell) {
  return cell.replace(/^`|`$/g, "").trim();
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
    throw new Error("Chrome or Edge was not found for the S111 browser smoke.");
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
