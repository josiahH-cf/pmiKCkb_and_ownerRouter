import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { resetDemoRecords } from "./demo-firestore.mjs";

const artifactDir = resolve(readArg("--artifacts") ?? "temp/live-demo-workflow-smoke");
const profileDir = resolve(readArg("--profile") ?? "temp/live-auth-profile");
const baseUrl = readArg("--base-url") ?? "http://localhost:3000";
const timeoutMs = Number(readArg("--timeout-ms") ?? 30000);
const shouldReset = !hasArg("--no-reset");
const headless = !hasArg("--headed");
const demoAskCases = [
  {
    expected: "Lease Renewals Demo SOP",
    question: "What is the lease renewal process?",
  },
  {
    expected: "Maintenance Work Order Intake Demo SOP",
    question: "What should the team check when a maintenance request comes in?",
  },
  {
    expected: "Move-Out + Deposit Disposition Demo SOP",
    question: "What has to happen after a tenant gives move-out notice?",
  },
  {
    expected: "Owner Onboarding Demo SOP",
    question: "What details does the team track during owner onboarding?",
  },
];
const demoSpaceCases = [
  {
    name: "lease-renewals",
    path: "lease-renewals",
    title: "Lease Renewals",
  },
  {
    name: "maintenance",
    path: "maintenance-work-order-intake",
    title: "Maintenance Work Order Intake",
  },
  {
    name: "move-out",
    path: "move-out-deposit-disposition",
    title: "Move-Out + Deposit Disposition",
  },
  {
    name: "owner-onboarding",
    path: "owner-onboarding",
    title: "Owner Onboarding",
  },
];

mkdirSync(artifactDir, { recursive: true });

const events = [];
const startTime = Date.now();

await main().catch(async (error) => {
  record("fatal", { message: error instanceof Error ? error.message : String(error) });
  await writeArtifacts();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  await assertServerReady();

  if (shouldReset) {
    await resetDemoRecords({ note: "Reset before live demo workflow smoke." });
    record("demo-reset", { stage: "before" });
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: findBrowserExecutable(),
    headless,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  attachPageDiagnostics(page);

  try {
    await smokeAsk(page);
    await smokeSpaceSave(page);
    await smokeApprovalQueue(page);
    await smokeAdmin(page);
    console.log(`Live demo workflow smoke passed. Artifacts: ${artifactDir}`);
  } finally {
    await writeArtifacts();
    await context.close();

    if (shouldReset) {
      await resetDemoRecords({ note: "Reset after live demo workflow smoke." });
      record("demo-reset", { stage: "after" });
      await writeArtifacts();
    }
  }
}

async function smokeAsk(page) {
  for (const [index, testCase] of demoAskCases.entries()) {
    await openSignedIn(page, "/ask");
    await expectBodyText(page, "Ask");
    await page.locator("#question").fill(testCase.question);
    await page.getByRole("button", { name: "Get Answer" }).click();
    await expectBodyText(page, "Verified Source");
    await expectBodyText(page, testCase.expected);
    await screenshot(page, `01-ask-${index + 1}`);
  }
}

async function smokeSpaceSave(page) {
  for (const testCase of demoSpaceCases) {
    await openSignedIn(page, `/spaces/${testCase.path}`);
    await expectBodyText(page, testCase.title);
    await expectBodyText(page, "Editable API connected.");

    const editor = page.locator("#sop-body");
    const originalBody = await editor.inputValue();

    if (!originalBody.includes(testCase.title)) {
      throw new Error(`Unexpected SOP body loaded from ${testCase.title} page.`);
    }

    await editor.fill(`${originalBody}\n\nSmoke save check ${new Date().toISOString()}`);
    await page.getByRole("button", { name: "Save" }).click();
    await expectBodyText(page, "Saved to editable API.");
    await editor.fill(originalBody);
    await page.getByRole("button", { name: "Save" }).click();
    await expectBodyText(page, "Saved to editable API.");
    await screenshot(page, `02-space-save-${testCase.name}`);
  }
}

async function smokeApprovalQueue(page) {
  await openSignedIn(page, "/approval-queue");
  await expectBodyText(page, "Approval Queue");
  await expectBodyText(page, "Editable API connected.");
  await screenshot(page, "03-approval-before");

  const maxQueueActions =
    (await page.getByRole("button", { name: "Approve" }).count()) +
    (await page.getByRole("button", { name: "Resolve" }).count()) +
    5;

  for (let index = 0; index < maxQueueActions; index += 1) {
    const approve = page.getByRole("button", { name: "Approve" });
    const resolve = page.getByRole("button", { name: "Resolve" });
    const approveCount = await approve.count();
    const resolveCount = await resolve.count();

    if (approveCount === 0 && resolveCount === 0) {
      break;
    }

    if (approveCount > 0) {
      await approve.first().click();
      await expectBodyText(page, "Approved through editable API.");
      continue;
    }

    await resolve.first().click();
    await expectBodyText(page, "Resolved through editable API.");
  }

  await expectBodyText(page, "No in-review items are present in the approval queue.");
  await screenshot(page, "04-approval-after");
}

async function smokeAdmin(page) {
  await openSignedIn(page, "/admin");
  await expectBodyText(page, "Admin");
  await screenshot(page, "05-admin");
}

async function openSignedIn(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });

  if (!page.url().includes("/sign-in")) {
    await waitForClientReady(page);
    return;
  }

  const localDemoButton = page.getByRole("button", {
    name: "Continue in local demo mode",
  });

  if ((await localDemoButton.count().catch(() => 0)) === 0) {
    assertNotSignIn(page);
    return;
  }

  await localDemoButton.first().click();
  await page.waitForURL((url) => url.pathname === "/ask", { timeout: timeoutMs });
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
  assertNotSignIn(page);
  await waitForClientReady(page);
}

async function waitForClientReady(page) {
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(250);
}

async function assertServerReady() {
  try {
    const response = await fetch(`${baseUrl}/sign-in`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `Local app is not reachable at ${baseUrl}. Start it with npm run dev before running this smoke. ${error instanceof Error ? error.message : ""}`,
    );
  }
}

function assertNotSignIn(page) {
  if (page.url().includes("/sign-in")) {
    throw new Error(
      "Expected a signed-in Firebase session. Run npm run smoke:auth-live with --pause-on-human first.",
    );
  }
}

async function expectBodyText(page, text) {
  await page.waitForFunction(
    (expectedText) => document.body.innerText.includes(expectedText),
    text,
    { timeout: timeoutMs },
  );
  record("text", { text });
}

async function screenshot(page, name) {
  await page.screenshot({ path: join(artifactDir, `${name}.png`), fullPage: true });
  record("page", { name, title: await page.title(), url: page.url() });
}

function attachPageDiagnostics(page) {
  page.on("console", (message) => {
    record("console", {
      level: message.type(),
      text: message.text(),
    });
  });
  page.on("pageerror", (error) => {
    record("pageerror", {
      message: error.message,
      stack: error.stack,
    });
  });
  page.on("requestfailed", (request) => {
    record("requestfailed", {
      failure: request.failure()?.errorText,
      method: request.method(),
      url: request.url(),
    });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      record("response", {
        status: response.status(),
        url: response.url(),
      });
    }
  });
}

function findBrowserExecutable() {
  const explicit = process.env.PLAYWRIGHT_CHROME_PATH;

  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          join(
            process.env.LOCALAPPDATA ?? "",
            "Microsoft\\Edge\\Application\\msedge.exe",
          ),
        ]
      : [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          "/usr/bin/google-chrome",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
        ];

  const executablePath = candidates.find(
    (candidate) => candidate && existsSync(candidate),
  );

  if (!executablePath) {
    throw new Error(
      "No Chrome or Edge executable found. Set PLAYWRIGHT_CHROME_PATH to a browser executable.",
    );
  }

  return executablePath;
}

function readArg(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function record(type, data) {
  events.push({
    elapsedMs: Date.now() - startTime,
    type,
    ...data,
  });
}

async function writeArtifacts() {
  writeFileSync(
    join(artifactDir, "events.json"),
    JSON.stringify(events, null, 2),
    "utf8",
  );
}
