import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "scripts", "smoke-theme-browser.mjs"),
  "utf8",
);

describe("S85 local browser evidence harness", () => {
  it("covers all settings, target viewports, no-flash observation, and local state preservation", () => {
    expect(source).toContain("const VIEWPORTS = [1280, 760, 320]");
    expect(source).toContain('const SETTINGS = ["system", "light", "dark"]');
    expect(source).toContain("THEME_BROWSER_CDP_URL");
    expect(source).toContain("MutationObserver");
    expect(source).toContain("intermediate wrong-theme root attribute");
    expect(source).toContain("Theme selection cleared unsent input");
    expect(source).toContain("Appearance attempted a network request");
    expect(source).toContain('data-ready="true"');
  });

  it("covers 200-percent equivalence, forced colors, reduced motion, print, and product cohorts", () => {
    expect(source).toContain("deviceScaleFactor: 2");
    expect(source).toContain('forcedColors: "active"');
    expect(source).toContain('reducedMotion: "reduce"');
    expect(source).toContain('media: "print"');
    expect(source).toContain("REPRESENTATIVE_SURFACES");
    expect(source).toContain('"/lease-renewal/live/desk"');
  });
});
