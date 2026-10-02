import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

import { resolveBrowserExecutable as findBrowserExecutable } from "./lib/browser-executable.mjs";

// S151 real-browser smoke for the AI-first Dashboard's history, saved questions and structured
// rerun (S146-S150). It runs only against a local server started with the automated harness
// settings and a local Firestore emulator (scripts/run-dashboard-history-browser-smoke.mjs): demo
// accounts, deterministic interpretation (no model), no provider credentials, so every write lands
// in the emulator. It checks the real UI at desktop and 390 px: answers measured below the question
// box (1360, 761, 759 and 390 px), no horizontal overflow, the polite live region and focus, history
// surviving a reload, save, pin and unpin, opening the last answer
// without asking again, a current run, injected failures (history save, pin, run) with their
// retries, and that a second account sees none of it. Only history and saved-question writes are
// allowed; any other non-GET request fails the smoke. Output is structural only.

const baseUrl = requireLocalOrigin(
  readArgument("--base-url") ?? process.env.DASHBOARD_SMOKE_BASE_URL?.trim(),
);
const ROUTE_BUDGET_MS = 90_000;
const ANSWER_BUDGET_MS = 60_000;
const ALLOWED_WRITES = [
  /^POST \/api\/auth\/demo$/,
  /^POST \/api\/assistant\/query$/,
  /^POST \/api\/ask$/,
  /^POST \/api\/assistant\/history\/turns$/,
  /^PUT \/api\/assistant\/history\/turns\/[A-Za-z0-9-]{8,64}$/,
  /^POST \/api\/assistant\/saved$/,
  /^PATCH \/api\/assistant\/saved\/[a-f0-9]{32}$/,
  /^POST \/api\/assistant\/saved\/[a-f0-9]{32}\/run$/,
];
const QUESTION = "What work is assigned to me today?";
const SECOND_QUESTION = "What approvals are waiting?";

const artifactDir = join(process.cwd(), "temp", "dashboard-history-browser-s151");
mkdirSync(artifactDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: findBrowserExecutable(),
  headless: true,
});
const results = [];

try {
  await desktopJourney();
  await phoneLayout();
  await secondAccount();
} finally {
  await browser.close();
}

process.stdout.write(
  `${JSON.stringify({ smoke: "s151-dashboard-history", passed: results.length, checks: results })}\n`,
);

function check(name, condition, detail = "") {
  if (!condition)
    throw new Error(`S151 browser smoke failed: ${name}${detail ? ` (${detail})` : ""}`);
  results.push(name);
}

async function newSignedInPage(role, viewport) {
  const context = await browser.newContext({ viewport });
  const signIn = await context.request.post(`${baseUrl}/api/auth/demo`, {
    data: { role },
  });
  check(`demo sign-in ${role}`, signIn.status() === 200, String(signIn.status()));
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  page.setDefaultTimeout(ANSWER_BUDGET_MS);
  const requests = [];
  const runBodies = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== baseUrl || !url.pathname.startsWith("/api/")) return;
    const key = `${request.method()} ${url.pathname}`;
    requests.push(key);
    if (key.endsWith("/run")) runBodies.push(request.postData() ?? "");
    if (
      request.method() !== "GET" &&
      !ALLOWED_WRITES.some((pattern) => pattern.test(key))
    ) {
      throw new Error(`S151 browser smoke failed: unexpected write ${key}`);
    }
  });
  return { context, page, requests, runBodies };
}

async function goto(page, path) {
  try {
    await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
  } catch {
    // A cold dev compile can outlast one navigation budget; one retry is the documented allowance.
    await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
  }
}

async function noHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return { scroll: root.scrollWidth, client: root.clientWidth };
  });
  check(
    `${label}: no horizontal overflow`,
    overflow.scroll <= overflow.client + 1,
    JSON.stringify(overflow),
  );
}

function count(requests, key) {
  return requests.filter((entry) => entry === key).length;
}

// S146: every answer turn starts below the question box, overlaps its column and follows the
// previous turn. Boxes are measured in page coordinates after the layout settles.
async function answersBelowQuestionBox(page, label) {
  const { form, turns } = await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top + window.scrollY,
        bottom: rect.bottom + window.scrollY,
        left: rect.left,
        right: rect.right,
      };
    };
    const question = document.querySelector('form[aria-label="Ask a question"]');
    return {
      form: question ? box(question) : null,
      turns: [...document.querySelectorAll("article.dashboard-turn")].map(box),
    };
  });
  const below =
    form !== null &&
    turns.length > 0 &&
    turns.every((turn) => turn.top >= form.bottom - 1);
  const inColumn =
    form !== null &&
    turns.every((turn) => turn.left < form.right && turn.right > form.left);
  const ordered = turns.every(
    (turn, index) => index === 0 || turn.top >= turns[index - 1].bottom - 1,
  );
  check(
    `${label}: answer is shown below the question box`,
    below && inColumn && ordered,
    JSON.stringify({ turns: turns.length, below, inColumn, ordered }),
  );
}

async function ask(page, question) {
  await page.locator("textarea#question").fill(question);
  await page.getByRole("button", { name: "Get answer" }).click();
  const turn = page
    .locator("article.dashboard-turn")
    .filter({ hasText: `You asked: ${question}` })
    .last();
  await page.waitForFunction(
    (text) =>
      [...document.querySelectorAll("article.dashboard-turn")].some(
        (article) =>
          article.textContent?.includes(`You asked: ${text}`) &&
          article.getAttribute("data-state") !== "pending",
      ),
    question,
  );
  return turn;
}

async function desktopJourney() {
  const { context, page, requests, runBodies } = await newSignedInPage("Admin", {
    width: 1360,
    height: 1000,
  });
  await goto(page, "/");
  await page.getByRole("form", { name: "Ask a question" }).waitFor();
  check(
    "question box renders before answers",
    (await page.locator("article.dashboard-turn").count()) === 0,
  );
  await page.getByRole("navigation", { name: "History" }).waitFor();
  await page.getByRole("navigation", { name: "Saved questions" }).waitFor();
  await noHorizontalOverflow(page, "desktop dashboard (empty)");

  // Ask, record and save.
  const turn = await ask(page, QUESTION);
  check(
    "answer reaches the answered state",
    (await turn.getAttribute("data-state")) === "answered",
  );
  // Measured, not inferred: the answer sits below the question box on both sides of the 760 px
  // breakpoint, then the journey continues at desktop width.
  await answersBelowQuestionBox(page, "desktop 1360px");
  for (const width of [761, 759]) {
    await page.setViewportSize({ width, height: 1000 });
    await answersBelowQuestionBox(page, `${width}px`);
  }
  await page.setViewportSize({ width: 1360, height: 1000 });
  await turn.getByText("Saved to your history.").waitFor();
  const announcer = await page.getByTestId("dashboard-announcer").textContent();
  check(
    "polite announcement after the answer",
    /Answer ready/.test(announcer ?? ""),
    announcer ?? "",
  );
  const focused = await page.evaluate(
    () => document.activeElement?.matches("article.dashboard-turn") ?? false,
  );
  check("focus moves to the answered turn", focused);
  await turn.getByRole("button", { name: "Save question" }).click();
  await turn.getByTestId("turn-question-saved").waitFor();
  const saved = page.getByRole("navigation", { name: "Saved questions" });
  await saved.getByTestId("saved-item").first().waitFor();

  // Pin, then reload: the pin, the saved item and the conversation persist; nothing is re-asked.
  await saved.getByRole("button", { name: "Pin" }).first().click();
  await saved.getByText("Pinned. It stays at the top of your saved questions.").waitFor();
  const queriesBeforeReload = count(requests, "POST /api/assistant/query");
  await page.reload({ waitUntil: "domcontentloaded" });
  const savedAfterReload = page.getByRole("navigation", { name: "Saved questions" });
  await savedAfterReload.getByTestId("saved-item").first().waitFor();
  check(
    "pin survives a reload",
    (await savedAfterReload
      .getByTestId("saved-item")
      .first()
      .getAttribute("data-pinned")) === "true",
  );
  await page
    .getByRole("navigation", { name: "History" })
    .getByRole("button", { name: QUESTION })
    .first()
    .waitFor();
  check("history lists the conversation after a reload", true);

  // Open the last answer: a read only.
  await savedAfterReload
    .getByRole("button", { name: "Open last answer" })
    .first()
    .click();
  await page.getByTestId("turn-history-label").first().waitFor();
  check("open last answer is labelled historical", true);
  check(
    "open last answer asks nothing",
    count(requests, "POST /api/assistant/query") === queriesBeforeReload &&
      requests.every((key) => !key.endsWith("/run")),
  );
  await noHorizontalOverflow(page, "desktop dashboard (restored conversation)");

  // A failed unpin changes nothing; the retry succeeds.
  await page.route("**/api/assistant/saved/*", (route) =>
    route.request().method() === "PATCH" ? route.abort("failed") : route.continue(),
  );
  await savedAfterReload.getByRole("button", { name: "Unpin" }).first().click();
  await savedAfterReload
    .getByText("The pin could not be changed just now. Nothing was changed.")
    .waitFor();
  check(
    "a failed unpin keeps the pin",
    (await savedAfterReload
      .getByTestId("saved-item")
      .first()
      .getAttribute("data-pinned")) === "true",
  );
  await page.unroute("**/api/assistant/saved/*");

  // A failed current run keeps the earlier answer; Retry repeats the same operation.
  let failedRuns = 0;
  await page.route("**/api/assistant/saved/*/run", async (route) => {
    if (failedRuns === 0) {
      failedRuns += 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      return;
    }
    await route.continue();
  });
  await savedAfterReload
    .getByRole("button", { name: "Run for current results" })
    .first()
    .click();
  await page
    .getByText(
      "Current results could not be loaded just now. Your earlier answer is unchanged.",
    )
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Retry" }).first().click();
  await page.getByTestId("turn-rerun-label").first().waitFor();
  await page.unroute("**/api/assistant/saved/*/run");
  check("a current run adds a labelled answer after a failed attempt", true);
  check(
    "the current run made no question request",
    count(requests, "POST /api/assistant/query") === queriesBeforeReload,
  );
  check(
    "the retried run reused its operation",
    runBodies.length === 2 && runBodies[0] === runBodies[1],
    String(runBodies.length),
  );

  await savedAfterReload.getByRole("button", { name: "Unpin" }).first().click();
  await savedAfterReload
    .getByText("Unpinned. It stays in your saved questions.")
    .waitFor();
  check(
    "unpin keeps the saved item",
    (await savedAfterReload.getByTestId("saved-item").count()) >= 1,
  );

  // A failed history save shows Retry saving, which saves without asking again.
  let failedSaves = 0;
  await page.route("**/api/assistant/history/turns/*", async (route) => {
    if (route.request().method() === "PUT" && failedSaves === 0) {
      failedSaves += 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Start a new conversation" }).click();
  const queriesBefore = count(requests, "POST /api/assistant/query");
  const second = await ask(page, SECOND_QUESTION);
  await second.getByText(/This answer is not saved to your history yet/).waitFor();
  await second.getByRole("button", { name: "Retry saving" }).click();
  await second.getByText("Saved to your history.").waitFor();
  await page.unroute("**/api/assistant/history/turns/*");
  check(
    "retrying a failed history save does not ask again",
    count(requests, "POST /api/assistant/query") === queriesBefore + 1,
  );

  // Anticipated work moved to Internal Processes and stays inside the page at desktop width.
  await goto(page, "/spaces");
  await showAnticipatedWork(page);
  await noHorizontalOverflow(page, "desktop Internal Processes with anticipated work");
  await page.screenshot({ path: join(artifactDir, "desktop.png"), fullPage: true });
  await context.close();
}

async function phoneLayout() {
  const { context, page } = await newSignedInPage("Admin", { width: 390, height: 844 });
  await goto(page, "/");
  await page
    .getByRole("navigation", { name: "Saved questions" })
    .getByTestId("saved-item")
    .first()
    .waitFor();
  await noHorizontalOverflow(page, "390px dashboard with history and saved questions");
  await page
    .getByRole("navigation", { name: "Saved questions" })
    .getByRole("button", { name: "Open last answer" })
    .first()
    .click();
  await page.getByTestId("turn-history-label").first().waitFor();
  await answersBelowQuestionBox(page, "390px restored conversation");
  await page
    .getByRole("navigation", { name: "Saved questions" })
    .getByRole("button", { name: "Rename" })
    .first()
    .click();
  await noHorizontalOverflow(
    page,
    "390px dashboard with a restored conversation and the rename form",
  );
  await page.screenshot({
    path: join(artifactDir, "phone-dashboard.png"),
    fullPage: true,
  });
  await goto(page, "/spaces");
  await showAnticipatedWork(page);
  await noHorizontalOverflow(page, "390px Internal Processes with anticipated work");
  await page.screenshot({ path: join(artifactDir, "phone-spaces.png"), fullPage: true });
  await context.close();
}

async function secondAccount() {
  const { context, page } = await newSignedInPage("Editor", {
    width: 1360,
    height: 1000,
  });
  await goto(page, "/");
  const saved = page.getByRole("navigation", { name: "Saved questions" });
  await saved
    .getByText("No saved questions yet. Use Save question on an answer to keep it here.")
    .waitFor();
  const history = page.getByRole("navigation", { name: "History" });
  await history
    .getByText(
      "No saved conversations yet. Questions you ask here are saved to your history.",
    )
    .waitFor();
  check(
    "a second account sees none of the first account's history or saved questions",
    true,
  );
  await context.close();
}

/** Ask Internal Processes for anticipated work and wait for its answer or its failure state. */
async function showAnticipatedWork(page) {
  // A click before hydration does nothing, so click until the request is actually sent.
  const button = page.getByRole("button", { name: "Show anticipated work" });
  await page.waitForLoadState("load");
  let requested = false;
  for (let attempt = 0; attempt < 6 && !requested; attempt += 1) {
    const sent = page
      .waitForRequest((request) => request.url().includes("/api/anticipated-work"), {
        timeout: 5_000,
      })
      .then(
        () => true,
        () => false,
      );
    await button.click();
    requested = await sent;
  }
  check("anticipated work is requested only on demand", requested);
  // Settled: the request finished as computed groups or as its own failure with Try again.
  await page.waitForFunction(() => {
    const section = document.querySelector('section[aria-label="Anticipated work"]');
    if (!section) return false;
    const labels = [...section.querySelectorAll("button")].map((button) =>
      button.textContent?.trim(),
    );
    return !labels.includes("Show anticipated work") && !labels.includes("Computing…");
  });
  check("anticipated work answers on request in Internal Processes", true);
}

function readArgument(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function requireLocalOrigin(value) {
  let candidate;
  try {
    candidate = new URL(String(value ?? ""));
  } catch {
    throw new Error("DASHBOARD_SMOKE_BASE_URL must be an explicit loopback HTTP origin.");
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
    throw new Error("DASHBOARD_SMOKE_BASE_URL must be an explicit loopback HTTP origin.");
  }
  return candidate.origin;
}
