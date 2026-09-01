import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path) => readFileSync(join(root, path), "utf8");

describe("S85 root and public theme contract", () => {
  it("boots the constant theme in head and limits hydration suppression to the root", () => {
    const layout = source("app/layout.tsx");
    expect(layout).toContain("THEME_BOOTSTRAP_SCRIPT");
    expect(layout).toContain("<head>");
    expect(layout).toContain("suppressHydrationWarning");
    expect(layout.match(/suppressHydrationWarning/g)).toHaveLength(1);
  });

  it("places Appearance in staff chrome and the exact public/vendor chrome", () => {
    expect(source("components/layout/AppShell.tsx")).toMatch(
      /<NotificationMenu\s*\/>[\s\S]*?<Appearance\s*\/>[\s\S]*?<span className="user-role">/,
    );
    expect(source("app/sign-in/page.tsx")).toContain("<Appearance");
    expect(source("app/vendor/layout.tsx")).toContain("<Appearance");
  });

  it("keeps global-error self-contained, device-aware, and preference-write free", () => {
    const globalError = source("app/global-error.tsx");
    expect(globalError).toContain("prefers-color-scheme: dark");
    expect(globalError).toContain("color-scheme");
    expect(globalError).not.toMatch(
      /localStorage|sessionStorage|pmi\.ui\.theme|Appearance/,
    );
  });
});
