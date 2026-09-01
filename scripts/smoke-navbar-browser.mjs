import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

const baseUrl = readArgument("--base-url") ?? process.env.NAVBAR_BROWSER_BASE_URL?.trim();
if (!baseUrl) {
  throw new Error(
    "NAVBAR_BROWSER_BASE_URL is required and must point to the running local rehearsal server.",
  );
}

const artifactDir = join(process.cwd(), "temp", "navbar-browser-s84");
mkdirSync(artifactDir, { recursive: true });

const cdpUrl = readArgument("--cdp-url") ?? process.env.NAVBAR_BROWSER_CDP_URL?.trim();
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({
      executablePath: findBrowserExecutable(),
      headless: true,
    });

try {
  await verifyDesktop();
  await verifyNarrowAndZoom();
  await verifyCoarsePointer();
} finally {
  await browser.close();
}

process.stdout.write(
  `S84 navbar browser smoke passed: desktop disclosure, hover intent, keyboard, transient coordination, narrow accordions, 320px, 200%-equivalent, coarse pointer, forced colors, reduced motion, and overflow. Artifacts: ${artifactDir}\n`,
);

async function verifyDesktop() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);
  await signInAndOpen(page, "/ask");

  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.waitFor();
  const triggers = nav.locator(".primary-nav-group-trigger");
  assert(
    (await triggers.allTextContents()).map(cleanText).join("|") ===
      "My Work|Operations|Admin",
    "Desktop group order drifted.",
  );
  assert(
    (await nav.locator("a:visible").count()) === 0,
    "A flat destination link remained visible while every disclosure was closed.",
  );

  const operations = nav.getByRole("button", { name: /Operations/ });
  // Prove hydration and immediate activation before measuring hover intent against the same control.
  await operations.click();
  await operations.click();
  await page.mouse.move(0, 0);
  await operations.hover();
  await page.waitForTimeout(250);
  assert(
    (await operations.getAttribute("aria-expanded")) === "false",
    "Hover opened before the intent delay.",
  );
  await page.waitForTimeout(150);
  assert(
    (await operations.getAttribute("aria-expanded")) === "true",
    "Fine-pointer hover did not open the Operations panel.",
  );

  const renewal = nav.getByRole("link", { name: "Lease Renewal" });
  await renewal.hover();
  await page.waitForTimeout(275);
  assert(
    (await operations.getAttribute("aria-expanded")) === "true",
    "Trigger-to-panel crossing closed the disclosure.",
  );
  assert(
    (await renewal.getAttribute("aria-describedby")) !== null &&
      (await renewal.getAttribute("href")) === "/lease-renewal",
    "The Lease Renewal row lost its route or description binding.",
  );

  await page.keyboard.press("Escape");
  assert(
    (await operations.getAttribute("aria-expanded")) === "false",
    "Escape did not close the desktop disclosure.",
  );
  assert(
    await operations.evaluate((node) => node === document.activeElement),
    "Escape did not return focus to Operations.",
  );

  await operations.press("ArrowDown");
  assert(
    await renewal.evaluate((node) => node === document.activeElement),
    "Down Arrow did not enter the first destination.",
  );
  await page.keyboard.press("Escape");

  await operations.click();
  const notifications = page.getByRole("button", { name: /^Notifications(?:,|$)/ });
  await notifications.click();
  assert(
    (await operations.getAttribute("aria-expanded")) === "false",
    "Notifications did not close Navigation.",
  );
  assert(
    (await notifications.getAttribute("aria-expanded")) === "true",
    "Notifications did not open.",
  );

  const appearance = page.getByRole("button", { name: /Appearance:/ });
  await page.locator('.appearance-trigger[data-ready="true"]').waitFor();
  await appearance.click();
  assert(
    (await notifications.getAttribute("aria-expanded")) === "false",
    "Appearance did not close Notifications.",
  );
  assert(
    (await appearance.getAttribute("aria-expanded")) === "true",
    "Appearance did not open.",
  );
  await page.keyboard.press("Escape");

  const requestPaths = [];
  const onRequest = (request) => requestPaths.push(new URL(request.url()).pathname);
  page.on("request", onRequest);
  await operations.click();
  await page.keyboard.press("Escape");
  page.off("request", onRequest);
  assert(
    requestPaths.length === 0,
    `Opening navigation caused network effects: ${requestPaths.join(", ")}.`,
  );

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await operations.click();
  const accessibilityStyle = await renewal.evaluate((node) => {
    node.focus();
    const style = getComputedStyle(node);
    return {
      border: style.borderStyle,
      outline: style.outlineStyle,
      transitions: style.transitionDuration,
    };
  });
  assert(accessibilityStyle.border !== "none", "Forced colors removed row boundaries.");
  assert(accessibilityStyle.outline !== "none", "Forced colors removed row focus.");
  assert(
    accessibilityStyle.transitions
      .split(",")
      .map((value) => durationInMilliseconds(value.trim()))
      .every((value) => value <= 0.01),
    `Reduced motion retained a transition: ${accessibilityStyle.transitions}.`,
  );
  await page.screenshot({
    path: join(artifactDir, "desktop-operations-forced-colors.png"),
    fullPage: true,
  });
  await context.close();
}

async function verifyNarrowAndZoom() {
  const context = await browser.newContext({
    viewport: { width: 760, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);
  await signInAndOpen(page, "/ask");

  const nav = page.getByRole("navigation", { name: "Primary" });
  const menu = nav.getByRole("button", { name: "Menu" });
  await menu.click();
  const region = nav.getByRole("region", { name: "Primary navigation" });
  const work = region.getByRole("button", { name: /My Work/ });
  assert(
    (await work.getAttribute("aria-expanded")) === "true",
    "Narrow Menu did not default to the Dashboard's group.",
  );
  assert(
    (await region.getByRole("link", { name: "Dashboard" }).count()) === 1,
    "Narrow Menu lost Dashboard.",
  );

  const operations = region.getByRole("button", { name: /Operations/ });
  await operations.click();
  assert(
    (await work.getAttribute("aria-expanded")) === "false",
    "Narrow accordions allowed two open groups.",
  );
  assert(
    (await operations.getAttribute("aria-expanded")) === "true",
    "Operations accordion did not open.",
  );
  assert(
    (await region.getByRole("link", { name: "Lease Renewal" }).count()) === 1,
    "Narrow Operations lost Lease Renewal.",
  );
  assert(
    await topLevelUtilitiesRemainVisible(page),
    "A required utility moved inside or disappeared behind Menu.",
  );
  assert(
    (await horizontalOverflow(page)) <= 1,
    "760px navigation overflowed horizontally.",
  );

  await page.setViewportSize({ width: 800, height: 720 });
  await nav.getByRole("button", { name: /Operations/ }).waitFor();
  await page.setViewportSize({ width: 320, height: 720 });
  await nav.getByRole("button", { name: "Menu" }).waitFor();
  const narrowMenu = nav.getByRole("button", { name: "Menu" });
  assert(
    (await narrowMenu.getAttribute("aria-expanded")) === "false",
    "Breakpoint handling retained stale open state.",
  );
  await narrowMenu.click();
  assert(
    (await horizontalOverflow(page)) <= 1,
    "320px navigation overflowed horizontally.",
  );
  await page.screenshot({
    path: join(artifactDir, "mobile-320-menu.png"),
    fullPage: true,
  });
  await context.close();

  const zoomContext = await browser.newContext({
    viewport: { width: 640, height: 450 },
    deviceScaleFactor: 2,
  });
  const zoomPage = await zoomContext.newPage();
  zoomPage.setDefaultNavigationTimeout(90_000);
  await signInAndOpen(zoomPage, "/ask");
  await zoomPage
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "Menu" })
    .click();
  assert(
    (await horizontalOverflow(zoomPage)) <= 1,
    "200%-equivalent navigation overflowed.",
  );
  await zoomPage.screenshot({
    path: join(artifactDir, "zoom-200-equivalent.png"),
    fullPage: true,
  });
  await zoomContext.close();
}

async function verifyCoarsePointer() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    hasTouch: true,
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);
  await signInAndOpen(page, "/ask");
  const operations = page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: /Operations/ });
  await operations.dispatchEvent("pointerover", { pointerType: "touch" });
  await page.waitForTimeout(450);
  assert(
    (await operations.getAttribute("aria-expanded")) === "false",
    "A coarse pointer hover-opened Navigation.",
  );
  await operations.tap();
  assert(
    (await operations.getAttribute("aria-expanded")) === "true",
    "Touch activation did not open Navigation immediately.",
  );
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

async function topLevelUtilitiesRemainVisible(page) {
  return (
    (await page.getByRole("button", { name: /^Notifications(?:,|$)/ }).isVisible()) &&
    (await page.getByRole("button", { name: /Appearance:/ }).isVisible()) &&
    (await page.locator(".user-role").getByText("Admin", { exact: true }).isVisible()) &&
    (await page.getByRole("button", { name: "Sign out" }).isVisible())
  );
}

async function horizontalOverflow(page) {
  return page.evaluate(
    () =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      document.documentElement.clientWidth,
  );
}

function cleanText(value) {
  return value.replace("Contains current page", "").trim();
}

function durationInMilliseconds(value) {
  const numeric = Number.parseFloat(value);
  return value.endsWith("ms") ? numeric : numeric * 1000;
}

function findBrowserExecutable() {
  const configured = process.env.NAVBAR_BROWSER_EXECUTABLE?.trim();
  const candidates = configured
    ? [configured]
    : [
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
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
  if (!executable)
    throw new Error("Chrome or Edge was not found for the S84 browser smoke.");
  return executable;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  return value || undefined;
}
