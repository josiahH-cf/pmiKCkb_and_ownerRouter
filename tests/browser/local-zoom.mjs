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
    return actual;
  }
  return { context, setZoom };
}
