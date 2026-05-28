import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const artifactDir = resolve(readArg("--artifacts") ?? "temp/live-auth-smoke");
const profileDir = resolve(readArg("--profile") ?? "temp/live-auth-profile");
const baseUrl = readArg("--base-url") ?? "http://localhost:3000";
const timeoutMs = Number(readArg("--timeout-ms") ?? 180000);
const email = readArg("--email") ?? process.env.LIVE_AUTH_EMAIL;
const pauseOnHuman = hasArg("--pause-on-human");

mkdirSync(artifactDir, { recursive: true });
mkdirSync(profileDir, { recursive: true });

const events = [];
const startTime = Date.now();
let humanCheckpoint = false;

await main().catch(async (error) => {
  record("fatal", { message: error instanceof Error ? error.message : String(error) });
  await writeArtifacts();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const executablePath = findBrowserExecutable();
  record("browser", { executablePath });

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: false,
    viewport: { width: 1280, height: 900 },
  });

  const page = context.pages()[0] ?? (await context.newPage());
  attachPageDiagnostics(page);

  try {
    await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded" });
    await page.screenshot({ path: join(artifactDir, "01-sign-in.png"), fullPage: true });
    record("page", { stage: "sign-in", url: page.url(), title: await page.title() });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await waitForUrlIncludes(page, "accounts.google.com", 30000);
    await page.screenshot({ path: join(artifactDir, "02-google.png"), fullPage: true });
    record("page", { stage: "google", url: page.url(), title: await page.title() });

    await waitForAppOrHumanCheckpoint(page, timeoutMs);
    await page.screenshot({ path: join(artifactDir, "03-final.png"), fullPage: true });
    record("page", { stage: "final", url: page.url(), title: await page.title() });

    if (new URL(page.url()).origin !== new URL(baseUrl).origin) {
      record("human-action-required", {
        reason: "Google is waiting for account selection, password, MFA, or consent.",
        url: page.url(),
      });
      if (pauseOnHuman && humanCheckpoint) {
        console.log("Complete password/MFA/consent in the opened Chrome window.");
        await waitForAppAfterHuman(page, timeoutMs);
        await page.screenshot({
          path: join(artifactDir, "04-after-human.png"),
          fullPage: true,
        });
        record("page", {
          stage: "after-human",
          url: page.url(),
          title: await page.title(),
        });
      } else {
        console.log(
          [
            "Human action is required in Google before the app can finish sign-in.",
            "Rerun with --pause-on-human to keep Chrome open while the human completes it.",
            `Artifacts: ${artifactDir}`,
          ].join("\n"),
        );
        return;
      }
    }

    if (new URL(page.url()).origin !== new URL(baseUrl).origin) {
      record("human-action-incomplete", { url: page.url() });
      return;
    }

    if (!page.url().includes("/ask")) {
      throw new Error(`Expected to land on /ask, got ${page.url()}`);
    }

    console.log(`Live auth smoke reached /ask. Artifacts: ${artifactDir}`);
  } finally {
    await writeArtifacts();
    await context.close();
  }
}

function attachPageDiagnostics(page) {
  page.on("console", (message) => {
    record("console", {
      level: message.type(),
      text: message.text(),
      location: message.location(),
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
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText,
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

async function clickGoogleAccountIfVisible(page, accountEmail) {
  const accountButton = page.getByRole("button", {
    name: new RegExp(escapeRegExp(accountEmail), "i"),
  });

  try {
    await accountButton.click({ timeout: 5000 });
    record("google-account", { email: accountEmail, clicked: true });
    await page.waitForTimeout(1000);
    return true;
  } catch {
    record("google-account", { email: accountEmail, clicked: false });
    return false;
  }
}

async function fillGoogleEmailIfVisible(page, accountEmail) {
  if (!page.url().includes("/identifier")) {
    return false;
  }

  const emailField = page.getByRole("textbox");

  try {
    await emailField.fill(accountEmail, { timeout: 3000 });
    await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
    record("google-email", { email: accountEmail, filled: true });
    await page.waitForTimeout(1500);
    return true;
  } catch {
    return false;
  }
}

async function waitForAppOrHumanCheckpoint(page, totalTimeoutMs) {
  const deadline = Date.now() + totalTimeoutMs;

  while (Date.now() < deadline) {
    const url = page.url();

    if (url.startsWith(baseUrl) && url.includes("/ask")) {
      return;
    }

    if (url.includes("accounts.google.com")) {
      const action = await handleGoogleStep(page);

      if (action === "human") {
        return;
      }

      if (action === "automated") {
        continue;
      }
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`Live auth smoke timed out after ${totalTimeoutMs}ms at ${page.url()}`);
}

async function handleGoogleStep(page) {
  if (email) {
    const accountClicked = await clickGoogleAccountIfVisible(page, email);

    if (accountClicked) {
      return "automated";
    }

    const emailFilled = await fillGoogleEmailIfVisible(page, email);

    if (emailFilled) {
      return "automated";
    }
  }

  if (await isPasswordOrSecurityChallenge(page)) {
    humanCheckpoint = true;
    record("human-action-required", {
      control: "Password, MFA, or security challenge",
      url: page.url(),
    });
    return "human";
  }

  const allow = page.getByRole("button", { name: "Allow" });
  const continueButton = page.getByRole("button", { name: "Continue" });
  const nextButton = page.getByRole("button", { name: "Next" });

  if ((await allow.count().catch(() => 0)) > 0) {
    humanCheckpoint = true;
    record("human-action-required", { control: "Allow", url: page.url() });
    return "human";
  }

  if ((await continueButton.count().catch(() => 0)) > 0) {
    humanCheckpoint = true;
    record("human-action-required", { control: "Continue", url: page.url() });
    return "human";
  }

  if ((await nextButton.count().catch(() => 0)) > 0) {
    humanCheckpoint = true;
    record("human-action-required", {
      control: "Next or credential challenge",
      url: page.url(),
    });
    return "human";
  }

  return "none";
}

async function waitForAppAfterHuman(page, totalTimeoutMs) {
  const deadline = Date.now() + totalTimeoutMs;

  while (Date.now() < deadline) {
    if (page.url().startsWith(baseUrl) && page.url().includes("/ask")) {
      return;
    }

    await page.waitForTimeout(1000);
  }
}

async function isPasswordOrSecurityChallenge(page) {
  if (
    page.url().includes("/challenge/") ||
    page.url().includes("/signin/v2/challenge/")
  ) {
    return true;
  }

  return (
    (await page
      .locator('input[type="password"]')
      .count()
      .catch(() => 0)) > 0
  );
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

function waitForUrlIncludes(page, fragment, timeout) {
  return page.waitForFunction(
    (expectedFragment) => location.href.includes(expectedFragment),
    fragment,
    { timeout },
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
