// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  THEME_BOOTSTRAP_SCRIPT,
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  parseThemeSetting,
  resolveTheme,
} from "@/lib/ui/theme";

describe("S85 theme resolver", () => {
  it("accepts only the versioned system, light, and dark settings", () => {
    expect(THEME_STORAGE_KEY).toBe("pmi.ui.theme.v1");
    expect(parseThemeSetting("system")).toBe("system");
    expect(parseThemeSetting("light")).toBe("light");
    expect(parseThemeSetting("dark")).toBe("dark");
    for (const invalid of [null, "", "auto", "Dark", "system ", "unknown"] as const) {
      expect(parseThemeSetting(invalid)).toBe("system");
    }
  });

  it("follows the device only while system is selected", () => {
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("writes exact root attributes without touching application state", () => {
    const root = document.createElement("html");
    expect(applyResolvedTheme(root, "dark", false)).toBe("dark");
    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.themeSetting).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");

    expect(applyResolvedTheme(root, "system", false)).toBe("light");
    expect(root.dataset.theme).toBe("light");
    expect(root.dataset.themeSetting).toBe("system");
    expect(root.style.colorScheme).toBe("light");
  });

  it("ships a synchronous, constant, network-free pre-paint bootstrap", () => {
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_BOOTSTRAP_SCRIPT).toContain("prefers-color-scheme: dark");
    expect(THEME_BOOTSTRAP_SCRIPT).toContain("data-theme");
    expect(THEME_BOOTSTRAP_SCRIPT).toContain("data-theme-setting");
    expect(THEME_BOOTSTRAP_SCRIPT).not.toMatch(/fetch|XMLHttpRequest|WebSocket|cookie/i);
  });
});
