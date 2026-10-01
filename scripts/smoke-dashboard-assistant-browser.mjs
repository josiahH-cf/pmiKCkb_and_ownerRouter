import { resolveBrowserExecutable as findBrowserExecutable } from "./lib/browser-executable.mjs";
// S138 real-browser smoke for the Dashboard conversation (S110 questions preserved).
//
// Runs against the local rehearsal server, which is live-read-only, so nothing it does can write.
// It asks the three S110 questions, the S138 question families and follow-ups in one page session,
// proves each answer is a new answer region for that question (not the previous one), proves a
// policy question continues to the knowledge answer, and proves the page never posts to a write
// route.

import { mkdirSync } from "node:fs";
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

const artifactDir = join(process.cwd(), "temp", "dashboard-assistant-browser-s138");
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
  `S138 dashboard conversation browser smoke passed: S110 questions and S138 families answered, follow-ups continued, policy question reached the knowledge answer, no write route called. Artifacts: ${artifactDir}\n`,
);

async function verifyAssistantQuestions() {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_DOM_BUDGET_MS);
  page.setDefaultTimeout(ANSWER_BUDGET_MS);

  const writes = [];
  const assistantCalls = [];
  const historyWrites = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/assistant/query") assistantCalls.push(path);
    if (
      request.method() === "POST" &&
      WRITE_ROUTES.some((route) => path.startsWith(route))
    ) {
      writes.push(`${request.method()} ${path}`);
    }
    // S148/S149: the rehearsal never saves history, so the page never tries to.
    if (
      request.method() !== "GET" &&
      (path.startsWith("/api/assistant/history") ||
        path.startsWith("/api/assistant/saved"))
    ) {
      historyWrites.push(`${request.method()} ${path}`);
    }
  });

  await signInAndOpen(page, "/");
  const field = page.locator("#question");
  await field.waitFor();
  await page
    .getByRole("navigation", { name: "Conversations" })
    .getByText("History is not saved in this environment.", { exact: false })
    .waitFor();

  const questions = [
    "What work is assigned to me today?",
    "What renewal blockers do I currently have?",
    "Which renewals come up next month?",
    "What leases are due this week?",
    "Now next month",
    "Only mine",
    "What does my approval queue look like?",
    "Which of these are waiting on someone else?",
    "What applications are connected?",
    "What information is stale and needs updating?",
  ];
  for (const question of questions) {
    const answer = await ask(page, field, question);
    assert(answer.trim() !== "", `The assistant returned nothing for: ${question}`);
    assert(
      !/i think|probably|it seems|might be/i.test(answer),
      `The assistant hedged instead of stating the source state for: ${question}`,
    );
    assert(
      !/answers three questions/i.test(answer),
      `The retired three-question note came back for: ${question}`,
    );
  }

  await field.fill("what is our pet policy");
  await page.getByRole("button", { name: "Get answer" }).click();
  // S146: every question keeps its own turn below the question box. The policy question's turn
  // shows the knowledge answer and no operational answer region.
  const policyTurn = turnFor(page, "what is our pet policy");
  await policyTurn.getByRole("region", { name: "Knowledge answer" }).waitFor();
  assert(
    (await policyTurn.getByRole("region", { name: "Assistant answer" }).count()) === 0,
    "A policy question rendered an operational answer instead of the knowledge answer.",
  );

  assert(
    assistantCalls.length === questions.length + 1,
    `The Dashboard called the assistant ${assistantCalls.length} times instead of once per question.`,
  );
  assert(
    writes.length === 0,
    `Answering questions posted to a write route: ${writes.join(", ")}`,
  );
  assert(
    historyWrites.length === 0,
    `The rehearsal tried to save history: ${historyWrites.join(", ")}`,
  );
  await assertNoHorizontalOverflow(page, "desktop Dashboard with answers");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await assertNoHorizontalOverflow(page, "390px Dashboard with answers");
  await page.screenshot({
    path: join(artifactDir, "dashboard-assistant.png"),
    fullPage: true,
  });
  await context.close();
}

async function assertNoHorizontalOverflow(page, label) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  assert(scroll <= client + 1, `${label} scrolls horizontally (${scroll} > ${client}).`);
}

async function ask(page, field, question) {
  await field.fill(question);
  // S146: each question has its own turn below the question box; wait for THIS question's answer.
  const answer = turnFor(page, question).getByRole("region", {
    name: "Assistant answer",
  });
  await page.getByRole("button", { name: "Get answer" }).click();
  await answer.waitFor();
  return answer.innerText();
}

function turnFor(page, question) {
  return page
    .locator("article.dashboard-turn")
    .filter({ has: page.getByText(`You asked: ${question}`, { exact: true }) });
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
