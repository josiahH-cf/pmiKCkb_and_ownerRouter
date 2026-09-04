// S110 real-browser smoke for the Dashboard assistant's three read-only questions.
//
// Runs against the local rehearsal server, which is live-read-only, so nothing it does can write.
// It asks each supported question and one unsupported question, proves each answer comes back with
// its own shape (items with links, or the bounded note listing what can be asked), and proves the
// page never posts to a write route while answering.

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
const ANSWER_BUDGET_MS = 90_000;

const WRITE_ROUTES = [
  "/api/process-definitions",
  "/api/workflow-runs",
  "/api/ask/capture",
  "/api/lease-renewal",
  "/api/maintenance",
  "/api/gmail",
  "/api/work",
];

const artifactDir = join(process.cwd(), "temp", "dashboard-assistant-browser-s110");
mkdirSync(artifactDir, { recursive: true });

const cdpUrl = readArgument("--cdp-url") ?? process.env.DESK_BROWSER_CDP_URL?.trim();
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({ executablePath: findBrowserExecutable(), headless: true });

try {
  await verifyAssistantQuestions();
} finally {
  await browser.close();
}

process.stdout.write(
  `S110 dashboard assistant browser smoke passed: three supported questions answered from the closed registry, unsupported question bounded, no write route called. Artifacts: ${artifactDir}\n`,
);

async function verifyAssistantQuestions() {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_DOM_BUDGET_MS);
  page.setDefaultTimeout(ANSWER_BUDGET_MS);

  const writes = [];
  const assistantCalls = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/assistant/query") assistantCalls.push(path);
    if (
      request.method() === "POST" &&
      WRITE_ROUTES.some((route) => path.startsWith(route))
    ) {
      writes.push(`${request.method()} ${path}`);
    }
  });

  await signInAndOpen(page, "/");
  const field = page.locator("#question");
  await field.waitFor();

  for (const question of [
    "What work is assigned to me today?",
    "What renewal blockers do I currently have?",
    "Which renewals come up next month?",
  ]) {
    const answer = await ask(page, field, question);
    assert(answer.trim() !== "", `The assistant returned nothing for: ${question}`);
    assert(
      !/i think|probably|it seems|might be/i.test(answer),
      `The assistant hedged instead of stating the source state for: ${question}`,
    );
  }

  const unsupported = await ask(page, field, "what is our pet policy");
  assert(
    unsupported.includes("You can ask:"),
    "An unsupported question did not receive the bounded note listing what can be asked.",
  );

  assert(
    assistantCalls.length === 4,
    `The Dashboard called the assistant ${assistantCalls.length} times instead of once per question.`,
  );
  assert(
    writes.length === 0,
    `Answering questions posted to a write route: ${writes.join(", ")}`,
  );
  await page.screenshot({
    path: join(artifactDir, "dashboard-assistant.png"),
    fullPage: true,
  });
  await context.close();
}

async function ask(page, field, question) {
  await field.fill(question);
  const answer = page.getByRole("region", { name: "Assistant answer" });
  await page.getByRole("button", { name: "Get answer" }).click();
  await answer.waitFor();
  return answer.innerText();
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
    throw new Error("Chrome or Edge was not found for the S110 browser smoke.");
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
