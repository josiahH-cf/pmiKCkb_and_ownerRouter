import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

const baseUrl = process.env.THEME_BROWSER_BASE_URL?.trim();
if (!baseUrl) {
  throw new Error(
    "THEME_BROWSER_BASE_URL is required and must point to the running local rehearsal server.",
  );
}

const STORAGE_KEY = "pmi.ui.theme.v1";
const artifactDir = join(process.cwd(), "temp", "theme-browser-s85");
mkdirSync(artifactDir, { recursive: true });

const COLD_LOAD_CASES = [
  { name: "system-light", setting: null, device: "light", expected: "light" },
  { name: "system-dark", setting: null, device: "dark", expected: "dark" },
  { name: "explicit-light", setting: "light", device: "dark", expected: "light" },
  { name: "explicit-dark", setting: "dark", device: "light", expected: "dark" },
];
const VIEWPORTS = [1280, 760, 320];
const SETTINGS = ["system", "light", "dark"];
const REPRESENTATIVE_SURFACES = [
  "/ask",
  "/spaces",
  "/work",
  "/connections",
  "/gmail-hub",
  "/maintenance",
  "/approval-queue",
  "/notifications",
  "/admin",
  "/lease-renewal/live/desk",
];

const cdpUrl = process.env.THEME_BROWSER_CDP_URL?.trim();
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({
      executablePath: findBrowserExecutable(),
      headless: true,
    });

try {
  await verifyColdLoads();
  await verifyAuthenticatedBehavior();
  await verifyZoomEquivalent();
} finally {
  await browser.close();
}

process.stdout.write(
  `S85 browser smoke passed: cold load, Appearance, 3x3 viewport/theme, 200% equivalent, forced colors, reduced motion, print, and representative surfaces. Artifacts: ${artifactDir}\n`,
);

async function verifyColdLoads() {
  for (const fixture of COLD_LOAD_CASES) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(
      ({ key, value }) => {
        try {
          if (value === null) window.localStorage.removeItem(key);
          else window.localStorage.setItem(key, value);
        } catch {}
        window.__pmiThemeMutations = [];
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            if (
              record.type === "attributes" &&
              (record.attributeName === "data-theme" ||
                record.attributeName === "data-theme-setting")
            ) {
              window.__pmiThemeMutations.push({
                name: record.attributeName,
                value: record.target.getAttribute(record.attributeName),
              });
            }
          }
        });
        observer.observe(document, { attributes: true, subtree: true });
      },
      { key: STORAGE_KEY, value: fixture.setting },
    );
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(90_000);
    await page.emulateMedia({ colorScheme: fixture.device });
    await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      setting: document.documentElement.dataset.themeSetting,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      mutations: window.__pmiThemeMutations,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      bodyText: getComputedStyle(document.body).color,
    }));
    assert(result.theme === fixture.expected, `${fixture.name}: wrong resolved theme.`);
    assert(
      result.setting === (fixture.setting ?? "system"),
      `${fixture.name}: wrong retained setting.`,
    );
    assert(result.scheme === fixture.expected, `${fixture.name}: wrong native scheme.`);
    assert(
      result.mutations
        .filter((entry) => entry.name === "data-theme")
        .every((entry) => entry.value === fixture.expected),
      `${fixture.name}: observed an intermediate wrong-theme root attribute.`,
    );
    assert(
      result.bodyBackground !== "rgba(0, 0, 0, 0)" &&
        result.bodyText !== result.bodyBackground,
      `${fixture.name}: body palette was not legible at DOMContentLoaded.`,
    );
    await page.screenshot({
      path: join(artifactDir, `sign-in-${fixture.name}.png`),
      fullPage: true,
    });
    await context.close();
  }
}

async function verifyAuthenticatedBehavior() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded" });
  assert(await demoSignIn(page), "Local rehearsal Admin sign-in did not complete.");
  await page.goto(`${baseUrl}/ask`, { waitUntil: "domcontentloaded" });

  const unsent = page.locator("textarea").first();
  await unsent.fill("Keep this unsent theme-state fixture");
  const themeRequests = [];
  page.on("request", (request) => {
    if (/appearance|theme/i.test(new URL(request.url()).pathname)) {
      themeRequests.push(request.url());
    }
  });

  const trigger = page.getByRole("button", { name: /Appearance:/ });
  await page.locator('.appearance-trigger[data-ready="true"]').waitFor();
  await trigger.click();
  await page.getByRole("radio", { name: "Dark" }).click();
  assert(
    (await unsent.inputValue()) === "Keep this unsent theme-state fixture",
    "Theme selection cleared unsent input.",
  );
  assert((await rootTheme(page)) === "dark", "Dark selection did not apply.");
  assert(
    (await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)) === "dark",
    "Dark selection did not persist locally.",
  );
  await page.keyboard.press("Escape");
  assert(
    await trigger.evaluate((node) => node === document.activeElement),
    "Escape lost focus.",
  );
  assert(themeRequests.length === 0, "Appearance attempted a network request.");
  await page.reload({ waitUntil: "domcontentloaded" });
  assert((await rootTheme(page)) === "dark", "Dark did not survive a refresh.");

  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 900 });
    for (const setting of SETTINGS) {
      process.stdout.write(`S85 viewport matrix: ${setting}/${width}\n`);
      const device = setting === "system" ? "dark" : "light";
      await page.emulateMedia({ colorScheme: device });
      const currentTrigger = page.getByRole("button", { name: /Appearance:/ });
      await currentTrigger.click();
      await page
        .getByRole("radio", {
          name: setting === "system" ? "Use device setting" : titleCase(setting),
        })
        .click();
      const expected = setting === "system" ? device : setting;
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        expected,
      );
      assert(
        (await horizontalOverflow(page)) <= 1,
        `${setting}/${width}: page overflowed horizontally.`,
      );
      await page.keyboard.press("Escape");
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({
    colorScheme: "dark",
    forcedColors: "active",
    reducedMotion: "reduce",
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const accessibilityMedia = await page.evaluate(() => {
    const button = document.querySelector("button");
    if (!button) return null;
    button.focus();
    const style = getComputedStyle(button);
    return {
      border: style.borderStyle,
      outline: style.outlineStyle,
      transition: style.transitionDuration,
    };
  });
  assert(
    accessibilityMedia?.border !== "none",
    "Forced colors removed control boundaries.",
  );
  assert(accessibilityMedia?.outline !== "none", "Forced colors removed visible focus.");
  assert(
    accessibilityMedia?.transition
      .split(",")
      .map((duration) => duration.trim())
      .every((duration) => durationInMilliseconds(duration) <= 0.01),
    `Reduced motion did not suppress transitions: ${accessibilityMedia?.transition}.`,
  );

  await page.emulateMedia({ media: "print", colorScheme: "dark", forcedColors: "none" });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.body).backgroundColor === "rgb(255, 255, 255)" &&
      getComputedStyle(document.body).color === "rgb(0, 0, 0)",
  );
  const print = await page.evaluate(() => ({
    topbar: getComputedStyle(document.querySelector(".topbar")).display,
    active: matchMedia("print").matches,
    canvas: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.body).color,
  }));
  assert(print.topbar === "none", "Print retained interactive topbar chrome.");
  assert(print.active, "Chromium did not activate print media.");
  assert(
    print.canvas === "rgb(255, 255, 255)" && print.text === "rgb(0, 0, 0)",
    `Print palette was not white/black: ${print.canvas}/${print.text}.`,
  );

  await page.emulateMedia({ media: "screen", colorScheme: "dark", forcedColors: "none" });
  for (const route of REPRESENTATIVE_SURFACES) {
    const response = await page.goto(`${baseUrl}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    assert(
      response && response.status() < 500,
      `${route}: server returned an error response.`,
    );
    assert(
      (await page.locator("body").innerText()).trim().length > 0,
      `${route}: empty body.`,
    );
    assert(
      (await horizontalOverflow(page)) <= 1,
      `${route}: horizontal overflow at desktop.`,
    );
  }
  await context.close();
}

async function verifyZoomEquivalent() {
  // 640 CSS pixels at DPR 2 is the layout-equivalent viewport of a 1280px display at 200% zoom.
  const context = await browser.newContext({
    viewport: { width: 640, height: 450 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded" });
  assert(await demoSignIn(page), "200%-equivalent local sign-in did not complete.");
  await page.goto(`${baseUrl}/ask`, { waitUntil: "domcontentloaded" });
  assert((await horizontalOverflow(page)) <= 1, "200%-equivalent layout overflowed.");
  const trigger = page.getByRole("button", { name: /Appearance:/ });
  await page.locator('.appearance-trigger[data-ready="true"]').waitFor();
  await trigger.click();
  await page.getByRole("radio", { name: "Use device setting" }).waitFor();
  await page.screenshot({ path: join(artifactDir, "ask-zoom-200-equivalent.png") });
  await context.close();
}

async function demoSignIn(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Admin" }),
    });
    return response.ok;
  });
}

async function rootTheme(page) {
  return page.evaluate(() => document.documentElement.dataset.theme);
}

async function horizontalOverflow(page) {
  return page.evaluate(
    () =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      document.documentElement.clientWidth,
  );
}

function findBrowserExecutable() {
  const configured = process.env.THEME_BROWSER_EXECUTABLE?.trim();
  const candidates = configured
    ? [configured]
    : [
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
        "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
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
    throw new Error("Chrome or Edge was not found for the S85 browser smoke.");
  return executable;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function titleCase(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function durationInMilliseconds(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return Number.POSITIVE_INFINITY;
  return value.endsWith("ms") ? numeric : numeric * 1000;
}
