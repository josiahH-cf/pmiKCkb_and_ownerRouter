// A fresh local-only browser profile verifies actual browser zoom, without a person's profile.
// Chrome's native tabs.setZoom/getZoom contract: https://developer.chrome.com/docs/extensions/reference/api/tabs
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

export async function createLocalZoomContext(origin) {
  assert.ok(
    ["localhost", "127.0.0.1"].includes(new URL(origin).hostname),
    "Zoom verification is local only",
  );
  const profile = mkdtempSync(join(tmpdir(), "pmi-kc-local-zoom-"));
  const extension = join(profile, "local-zoom");
  mkdirSync(extension);
  writeFileSync(
    join(extension, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Local zoom verification",
      version: "1.0",
      permissions: ["tabs"],
      host_permissions: ["http://localhost/*", "http://127.0.0.1/*"],
      background: { service_worker: "background.js" },
    }),
    { mode: 0o600 },
  );
  writeFileSync(
    join(extension, "background.js"),
    "chrome.runtime.onInstalled.addListener(() => {});",
    { mode: 0o600 },
  );
  const cache = join(homedir(), ".cache", "ms-playwright");
  const installed = readdirSync(cache)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  const executablePath = installed
    .flatMap((name) => [
      join(cache, name, "chrome-linux64", "chrome"),
      join(cache, name, "chrome-linux", "chrome"),
    ])
    .find(existsSync);
  assert.ok(
    executablePath,
    "Installed native Chromium is required for actual browser zoom",
  );
  const context = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: true,
    viewport: null,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      "--window-size=1440,1000",
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 10_000 }));
  async function setZoom(page, factor) {
    assert.equal(new URL(page.url()).origin, origin);
    const before = await page.evaluate(() => ({
      width: innerWidth,
      dpr: devicePixelRatio,
    }));
    const actual = await worker.evaluate(
      async ({ url, factor }) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((tab) => tab.url === url);
        if (!tab) throw new Error("The current local zoom tab is unavailable");
        await chrome.tabs.setZoom(tab.id, factor);
        return chrome.tabs.getZoom(tab.id);
      },
      { url: page.url(), factor },
    );
    assert.equal(actual, factor);
    await page.waitForFunction(
      ({ before, factor }) =>
        Math.abs(devicePixelRatio - factor) < 0.01 &&
        Math.abs(innerWidth - (before.width * before.dpr) / factor) < 2,
      { before, factor },
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    return actual;
  }
  async function screenshot(page, path) {
    assert.equal(new URL(page.url()).origin, origin);
    const cdp = await context.newCDPSession(page);
    try {
      const metrics = await cdp.send("Page.getLayoutMetrics");
      // Chromium capture coordinates use device-independent pixels at native browser zoom;
      // Playwright's CSS-sized default clip truncates the right half at 200 percent.
      assert.ok(
        metrics.cssContentSize.width <= metrics.cssLayoutViewport.clientWidth + 2,
      );
      const result = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        fromSurface: true,
        clip: {
          x: 0,
          y: 0,
          width: metrics.contentSize.width,
          height: metrics.contentSize.height,
          scale: 1,
        },
      });
      writeFileSync(path, Buffer.from(result.data, "base64"));
      writeFileSync(`${path}.metrics.json`, JSON.stringify(metrics, null, 2));
    } finally {
      await cdp.detach();
    }
  }
  return { context, setZoom, screenshot };
}
