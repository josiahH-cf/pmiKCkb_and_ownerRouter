import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildConnectionView } from "@/lib/connections/connection-status";
import { CONNECTORS } from "@/lib/connections/connector-catalog";
import {
  ADMIN_TASK_GROUPS,
  CONNECTION_TASK_GROUPS,
  TASK_NAVIGATION_LINKS,
  groupConnectionItems,
} from "@/lib/navigation/admin-connections";

const root = process.cwd();
const adminPage = readFileSync(join(root, "app/admin/page.tsx"), "utf8");
const adminIndex = readFileSync(
  join(root, "components/admin/AdminTaskIndex.tsx"),
  "utf8",
);
const connectionsPage = readFileSync(join(root, "app/connections/page.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");

describe("S81 task-oriented Admin and Connections navigation contract", () => {
  it("has one source manifest and stable task anchors", () => {
    expect(existsSync(join(root, "lib/navigation/admin-connections.ts"))).toBe(true);
    const adminMarkup = `${adminPage}\n${adminIndex}`;
    for (const id of [
      "admin-task-index",
      "admin-people-access",
      "admin-runtime-suspensions",
      "admin-renewal-notice-rules",
      "admin-owner-pricing-rules",
      "admin-activity-log",
      "admin-content-builder",
      "admin-publication-policies",
    ]) {
      expect(adminMarkup).toContain(`id="${id}"`);
    }
  });

  it("maps every connector exactly once and every task id to one bounded target", () => {
    const groups = groupConnectionItems(buildConnectionView({}).items);
    expect(groups.map((group) => group.label)).toEqual([
      "Renewal data",
      "Communications",
      "Documents and storage",
      "Other operations",
    ]);
    expect(
      groups.flatMap((group) => group.items.map((item) => item.def.id)).sort(),
    ).toEqual(CONNECTORS.map((connector) => connector.id).sort());

    const ids = TASK_NAVIGATION_LINKS.map((link) => link.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const link of TASK_NAVIGATION_LINKS) {
      const target = new URL(link.href, "https://app.invalid");
      const pagePath = join(
        root,
        "app",
        target.pathname === "/" ? "page.tsx" : target.pathname.slice(1),
        target.pathname === "/" ? "" : "page.tsx",
      );
      expect(existsSync(pagePath), `${link.id} target ${target.pathname}`).toBe(true);
      expect(target.origin).toBe("https://app.invalid");
      const pageSource = readFileSync(pagePath, "utf8");
      const guard = pageSource.match(/requirePageCapability\("([^"]+)"\)/)?.[1];
      expect(guard, `${link.id} destination guard`).toBe(link.requiredCapability);
    }
  });

  it("keeps the manifest's advertised capability equal to each destination guard", () => {
    for (const link of TASK_NAVIGATION_LINKS) {
      const target = new URL(link.href, "https://app.invalid");
      const expected = ["/admin/access", "/connections"].includes(target.pathname)
        ? "read"
        : "manageAdmin";
      expect(link.requiredCapability, link.id).toBe(expected);
    }
    expect(ADMIN_TASK_GROUPS).toHaveLength(5);
    expect(CONNECTION_TASK_GROUPS).toHaveLength(4);
  });

  it("contains no credential names, secret values, customer data, or external targets", () => {
    const renderedMetadata = JSON.stringify({
      admin: ADMIN_TASK_GROUPS,
      connections: CONNECTION_TASK_GROUPS,
    });
    expect(renderedMetadata).not.toMatch(
      /API_KEY|CLIENT_SECRET|SECRET|PASSWORD|TOKEN|@[a-z0-9.-]+\.[a-z]{2,}/i,
    );
    for (const link of TASK_NAVIGATION_LINKS) {
      const target = new URL(link.href, "https://app.invalid");
      expect(target.origin).toBe("https://app.invalid");
      expect(target.username).toBe("");
      expect(target.password).toBe("");
    }
  });

  it("preserves destination guards instead of treating hidden links as authorization", () => {
    expect(adminPage).toMatch(/requirePageCapability\("manageAdmin"\)/);
    expect(connectionsPage).toMatch(/requirePageCapability\("read"\)/);
  });

  it("makes hash targets focusable and narrow task grids deterministic", () => {
    expect(css).toMatch(/\.task-anchor[\s\S]*scroll-margin-top/);
    expect(css).toMatch(/\.task-navigation-grid[\s\S]*repeat\(auto-fit/);
    expect(adminPage).toContain("tabIndex={-1}");
  });
});
