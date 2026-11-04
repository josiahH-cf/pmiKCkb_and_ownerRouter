import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateAuthClaims, type AuthenticatedUser } from "@/lib/auth/session";
import {
  PRIMARY_NAVIGATION_MANIFEST,
  resolvePrimaryNavigation,
  validatePrimaryNavigationManifest,
} from "@/lib/navigation/primary-navigation";

// S242 ARCH-S242-1 / BEH-S242-1 / AC-S242-1: Help is one primary navigation destination for every
// staff role, reachable from every page, and absent from the separate Vendor portal shell.

const signIn = (role: "Editor" | "Approver" | "Admin"): AuthenticatedUser =>
  validateAuthClaims({
    uid: `${role.toLowerCase()}-1`,
    email: `${role.toLowerCase()}-1@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
  });
const originalAllowedHd = process.env.ALLOWED_HD;
beforeEach(() => {
  process.env.ALLOWED_HD = "pmikcmetro.com";
});
afterEach(() => {
  process.env.ALLOWED_HD = originalAllowedHd;
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

describe("S242 Help in the primary navigation", () => {
  it("ARCH-S242-1: the manifest has an all-staff Help item in the first group and still validates", () => {
    const [first] = PRIMARY_NAVIGATION_MANIFEST;
    const help = first.items.find((item) => item.id === "help");
    expect(help).toMatchObject({
      label: "Help",
      href: "/help",
      activePaths: ["/help"],
      icon: "help-book",
      visibility: "all-staff",
    });
    expect(help?.description.trim().length).toBeGreaterThan(10);
    expect(() =>
      validatePrimaryNavigationManifest(PRIMARY_NAVIGATION_MANIFEST, {
        routeExists: (href) =>
          href === "/" ||
          existsSync(join(process.cwd(), "app", href.split("?")[0], "page.tsx")),
      }),
    ).not.toThrow();
  });

  it.each(["Editor", "Approver", "Admin"] as const)(
    "BEH-S242-1 / AC-S242-1: %s sees Help pointing at /help",
    (role) => {
      const groups = resolvePrimaryNavigation(signIn(role));
      const help = groups
        .flatMap((group) => group.items)
        .find((item) => item.id === "help");
      expect(help).toMatchObject({ label: "Help", href: "/help" });
      expect(groups[0].items.map((item) => item.id)).toContain("help");
    },
  );

  it("AC-S242-1: the Vendor portal renders its own shell, never the staff navigation or Help", () => {
    const vendorSources = files(join(process.cwd(), "app", "vendor"))
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => readFileSync(file, "utf8"));
    expect(vendorSources.length).toBeGreaterThan(0);
    for (const source of vendorSources) {
      expect(source).not.toMatch(/AppShell|PrimaryNav|\/help\b/);
    }
  });

  it("BEH-S242-1: /help renders inside AppShell behind the read capability", () => {
    const page = readFileSync(join(process.cwd(), "app/help/page.tsx"), "utf8");
    expect(page).toMatch(/requirePageCapability\("read"\)/);
    expect(page).toMatch(/<AppShell user=\{user\}>/);
  });
});
