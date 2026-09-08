import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
describe("Linux browser resolution contract", () => {
  it("assurance uses the enrollment resolver rather than preferring Windows Chrome in WSL", () => {
    const source = readFileSync("scripts/production-assurance-runtime.ts", "utf8");
    expect(source).toContain('from "./lib/browser-executable.mjs"');
    expect(source).not.toContain(
      '"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"',
    );
  });
  it("selects the installed Linux browser consistently and rejects Windows overrides", () => {
    const deps = {
      home: "/isolated",
      exists: () => true,
      list: () => ["chromium-1228", "chromium-1234"],
      executable: (path) => path.startsWith("/isolated/.cache/ms-playwright/chromium-"),
    };
    expect(resolveBrowserExecutable({}, "linux", deps)).toBe(
      "/isolated/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
    );
    expect(() =>
      resolveBrowserExecutable(
        { PLAYWRIGHT_CHROME_PATH: "/mnt/c/chrome.exe" },
        "linux",
        deps,
      ),
    ).toThrow("browser_platform_mismatch");
    expect(() =>
      resolveBrowserExecutable(
        { PLAYWRIGHT_CHROME_PATH: "/one", DESK_BROWSER_EXECUTABLE: "/two" },
        "linux",
        deps,
      ),
    ).toThrow("browser_override_conflict");
  });
});
