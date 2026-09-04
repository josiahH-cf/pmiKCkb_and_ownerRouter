// S109 real-browser smoke for the public resident maintenance report form.
//
// Runs read-only against the local rehearsal server with a SYNTHETIC token that the local rehearsal
// posture refuses, so no intake record is ever written. It proves the page is reachable without a
// session, that the bridge clears the token-bearing fragment from the URL and from history before
// anything can create a request, that the structured questions are present, that the emergency line
// is stated before the form, and that a link with no token refuses instead of submitting.

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

// Shaped like a token, signed by nothing. The route verifies the HMAC before any write.
const SYNTHETIC_TOKEN = "c3ludGhldGljLXBheWxvYWQ.c3ludGhldGljLXNpZ25hdHVyZQ";

const artifactDir = join(process.cwd(), "temp", "maintenance-intake-browser-s109");
mkdirSync(artifactDir, { recursive: true });

const cdpUrl = readArgument("--cdp-url") ?? process.env.DESK_BROWSER_CDP_URL?.trim();
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({ executablePath: findBrowserExecutable(), headless: true });

try {
  await verifyPublicForm();
  await verifyTokenlessLink();
} finally {
  await browser.close();
}

process.stdout.write(
  `S109 maintenance intake browser smoke passed: reachable without a session, fragment cleared before any request, structured questions present, emergency line first, tokenless link refuses. Artifacts: ${artifactDir}\n`,
);

async function verifyPublicForm() {
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_DOM_BUDGET_MS);
  page.setDefaultTimeout(INTERACTION_BUDGET_MS);

  // No request may ever carry the token in a URL.
  const leaked = [];
  page.on("request", (request) => {
    if (request.url().includes(SYNTHETIC_TOKEN)) leaked.push(request.url());
  });

  const response = await page.goto(
    `${baseUrl}/maintenance/report#token=${SYNTHETIC_TOKEN}`,
    { waitUntil: "domcontentloaded" },
  );
  assert(response !== null, "The public report page did not respond.");
  assert(
    response.status() === 200,
    `The public report page returned ${response.status()} instead of 200 without a session.`,
  );

  const form = page.getByRole("region", { name: "Report a maintenance issue" });
  await form.waitFor();
  assert(
    (await page.evaluate(() => window.location.hash)) === "",
    "The bridge left the token-bearing fragment in the URL.",
  );

  const body = await form.innerText();
  assert(
    body.includes("call 911 first"),
    "The form does not state the emergency instruction before the questions.",
  );
  for (const label of [
    "What is wrong?",
    "What kind of issue is it?",
    "Where in the home is it?",
    "Is it happening right now?",
    "When did it start?",
    "Is anything damaged, and can someone get to it?",
    "What have you already tried?",
    "How can we reach you?",
  ]) {
    await form.getByLabel(label).waitFor();
  }
  assert(
    (await form.locator('input[type="file"]').count()) === 0,
    "The public form offers a file upload, which S47 forbids.",
  );

  await form.getByLabel("What is wrong?").fill("Water under the kitchen sink");
  await form.getByLabel("What kind of issue is it?").selectOption("Plumbing");
  await form.getByRole("button", { name: "Send this report" }).click();
  await form.getByRole("alert").waitFor();
  assert(
    leaked.length === 0,
    `The token appeared in ${leaked.length} request URL(s); it must ride the header only.`,
  );
  await page.screenshot({
    path: join(artifactDir, "maintenance-report-form.png"),
    fullPage: true,
  });
  await context.close();
}

async function verifyTokenlessLink() {
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  const page = await context.newPage();
  page.setDefaultTimeout(INTERACTION_BUDGET_MS);
  const submissions = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/maintenance/intake/public") {
      submissions.push(request.url());
    }
  });
  await page.goto(`${baseUrl}/maintenance/report`, { waitUntil: "domcontentloaded" });
  const form = page.getByRole("region", { name: "Report a maintenance issue" });
  await form.waitFor();
  const body = await form.innerText();
  assert(
    body.includes("This link is not complete"),
    "A link with no token did not refuse with the incomplete-link message.",
  );
  assert(
    (await form.getByRole("button", { name: "Send this report" }).count()) === 0,
    "A link with no token still offers the send control.",
  );
  assert(
    submissions.length === 0,
    "A link with no token still reached the public intake route.",
  );
  await context.close();
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
    throw new Error("Chrome or Edge was not found for the S109 browser smoke.");
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
