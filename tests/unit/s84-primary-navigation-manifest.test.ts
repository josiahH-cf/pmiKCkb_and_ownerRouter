import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  ACTIVE_DASHBOARD_COMPOSITION,
  DASHBOARD_NAVIGATION_COPY,
  PRIMARY_NAVIGATION_MANIFEST,
  resolvePrimaryNavigation,
  validatePrimaryNavigationManifest,
} from "@/lib/navigation/primary-navigation";
import { isPrimaryNavigationItemActive } from "@/lib/navigation/primary-navigation-contract";

const editor = (scopes: readonly string[]): AuthenticatedUser =>
  ({
    uid: "editor-1",
    email: "editor-1@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    scopes,
  }) as AuthenticatedUser;

const admin = (scopes?: readonly string[]): AuthenticatedUser =>
  ({
    uid: "admin-1",
    email: "admin-1@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin",
    ...(scopes ? { scopes } : {}),
  }) as AuthenticatedUser;

describe("S84 primary-navigation manifest", () => {
  it("owns exactly the requested groups and nine ordered destination definitions", () => {
    expect(PRIMARY_NAVIGATION_MANIFEST.map((group) => group.label)).toEqual([
      "My Work",
      "Operations",
      "Admin",
    ]);
    expect(
      PRIMARY_NAVIGATION_MANIFEST.map((group) => group.items.map((item) => item.label)),
    ).toEqual([
      ["My Work", "Dashboard", "Approval Queue"],
      ["Lease Renewal", "Maintenance", "Internal Processes"],
      ["Admin", "Connections", "Communications"],
    ]);
    expect(PRIMARY_NAVIGATION_MANIFEST.flatMap((group) => group.items)).toHaveLength(9);
    expect(
      new Set(
        PRIMARY_NAVIGATION_MANIFEST.flatMap((group) =>
          group.items.map((item) => item.icon),
        ),
      ).size,
    ).toBe(9);
    expect(PRIMARY_NAVIGATION_MANIFEST.map((group) => group.tone)).toEqual([
      "work",
      "operations",
      "admin",
    ]);
  });

  it("keeps the transitional Dashboard copy paired to the pre-S95 composition", () => {
    expect(ACTIVE_DASHBOARD_COMPOSITION).toBe("current-operations");
    expect(DASHBOARD_NAVIGATION_COPY[ACTIVE_DASHBOARD_COMPOSITION]).toBe(
      "Review current operations and ask about approved PMI KC guidance.",
    );
    expect(DASHBOARD_NAVIGATION_COPY["shared-ai-work"]).toBe(
      "Ask AI about current work, then open My Work to act.",
    );
  });

  it("filters destinations by current Space and role truth without dead controls", () => {
    const maintenanceOnly = resolvePrimaryNavigation(editor(["maintenance"]));
    expect(labels(maintenanceOnly, "my-work")).toEqual(["My Work", "Dashboard"]);
    expect(labels(maintenanceOnly, "operations")).toEqual([
      "Maintenance",
      "Internal Processes",
    ]);
    expect(labels(maintenanceOnly, "admin")).toEqual([
      "Admin",
      "Connections",
      "Communications",
    ]);
    expect(findItem(maintenanceOnly, "admin")).toMatchObject({
      href: "/admin/access",
      description: "View your access and request the permissions you need.",
    });

    const renewalsOnly = resolvePrimaryNavigation(editor(["renewals"]));
    expect(labels(renewalsOnly, "my-work")).toEqual([
      "My Work",
      "Dashboard",
      "Approval Queue",
    ]);
    expect(labels(renewalsOnly, "operations")).toEqual([
      "Lease Renewal",
      "Internal Processes",
    ]);
    expect(findItem(renewalsOnly, "approval-queue")).toMatchObject({
      href: "/approval-queue",
      description: "Review work waiting for an authorized decision.",
    });
  });

  it.each([
    ["Editor", [], ["Internal Processes"], false],
    ["Editor", ["renewals"], ["Lease Renewal", "Internal Processes"], true],
    ["Approver", ["maintenance"], ["Maintenance", "Internal Processes"], false],
    [
      "Approver",
      ["renewals", "maintenance"],
      ["Lease Renewal", "Maintenance", "Internal Processes"],
      true,
    ],
    ["Admin", undefined, ["Lease Renewal", "Maintenance", "Internal Processes"], true],
  ] as const)(
    "resolves the %s actor and Space matrix without weakening visibility",
    (role, scopes, operations, hasQueue) => {
      const user = {
        uid: `${role.toLowerCase()}-matrix`,
        email: `${role.toLowerCase()}-matrix@pmikcmetro.com`,
        hd: "pmikcmetro.com",
        role,
        ...(scopes === undefined ? {} : { scopes: [...scopes] }),
      } as AuthenticatedUser;
      const resolved = resolvePrimaryNavigation(user);
      expect(labels(resolved, "operations")).toEqual(operations);
      expect(
        Boolean(
          resolved
            .flatMap((group) => group.items)
            .find((item) => item.id === "approval-queue"),
        ),
      ).toBe(hasQueue);
    },
  );

  it("routes an Admin without Renewals to only the access lane and reuses one pending projection", () => {
    const groups = resolvePrimaryNavigation(admin(["maintenance"]), {
      pendingAccessRequestCount: 7,
    });

    expect(findItem(groups, "approval-queue")).toMatchObject({
      href: "/approval-queue?view=access",
      description: "Review access requests waiting for an Admin decision.",
      badge: { value: 7, label: "7 pending access requests" },
    });
    expect(findItem(groups, "admin")).toMatchObject({
      href: "/admin",
      description: "Manage people, access, policies, and app readiness.",
      badge: { value: 7, label: "7 pending access requests" },
    });
    expect(labels(groups, "operations")).not.toContain("Lease Renewal");
  });

  it("never exposes the Admin count to non-Admins and never fabricates zero on read failure", () => {
    const nonAdmin = resolvePrimaryNavigation(editor(["renewals"]), {
      pendingAccessRequestCount: 4,
    });
    expect(findItem(nonAdmin, "approval-queue").badge).toBeUndefined();
    expect(findItem(nonAdmin, "admin").badge).toBeUndefined();

    const unavailable = resolvePrimaryNavigation(admin(), {
      pendingAccessRequestCount: null,
    });
    expect(findItem(unavailable, "approval-queue").badge).toBeUndefined();
    expect(findItem(unavailable, "admin").badge).toBeUndefined();
  });

  it("omits a future group if actor filtering removes every child", () => {
    const renewalsOnlyGroup = [
      {
        id: "operations",
        label: "Operations",
        tone: "operations",
        items: [
          {
            id: "lease-renewal",
            label: "Lease Renewal",
            description:
              "Review upcoming renewals and complete the next required action.",
            href: "/lease-renewal",
            activePaths: ["/lease-renewal"],
            icon: "calendar-renew",
            visibility: "renewals",
          },
        ],
      },
    ] as const;

    expect(
      resolvePrimaryNavigation(editor(["maintenance"]), {}, renewalsOnlyGroup),
    ).toEqual([]);
  });

  it("matches stable routes and aliases without allowing query/hash state to create another current item", () => {
    const groups = resolvePrimaryNavigation(admin());
    expect(isPrimaryNavigationItemActive("/", findItem(groups, "dashboard"))).toBe(true);
    expect(isPrimaryNavigationItemActive("/ask", findItem(groups, "dashboard"))).toBe(
      true,
    );
    expect(
      isPrimaryNavigationItemActive(
        "/processes/run-1",
        findItem(groups, "internal-processes"),
      ),
    ).toBe(true);
    expect(
      isPrimaryNavigationItemActive(
        "/approval-queue",
        findItem(groups, "approval-queue"),
      ),
    ).toBe(true);
    expect(
      isPrimaryNavigationItemActive("/admin/migration", findItem(groups, "admin")),
    ).toBe(true);
    expect(isPrimaryNavigationItemActive("/workbench", findItem(groups, "my-work"))).toBe(
      false,
    );
  });

  it("fails closed for duplicate ids, missing descriptive data, untrusted targets, and dead routes", () => {
    const routeFiles: Record<string, string> = {
      "/work": "app/work/page.tsx",
      "/ask": "app/ask/page.tsx",
      "/approval-queue": "app/approval-queue/page.tsx",
      "/lease-renewal": "app/lease-renewal/page.tsx",
      "/maintenance": "app/maintenance/page.tsx",
      "/spaces": "app/spaces/page.tsx",
      "/admin": "app/admin/page.tsx",
      "/connections": "app/connections/page.tsx",
      "/gmail-hub": "app/gmail-hub/page.tsx",
    };
    expect(() =>
      validatePrimaryNavigationManifest(PRIMARY_NAVIGATION_MANIFEST, {
        routeExists: (href) => existsSync(join(process.cwd(), routeFiles[href])),
      }),
    ).not.toThrow();

    const duplicate = structuredCloneWithoutFunctions(PRIMARY_NAVIGATION_MANIFEST);
    duplicate[0].items[1].id = duplicate[0].items[0].id;
    expect(() => validatePrimaryNavigationManifest(duplicate)).toThrow(/duplicate/i);

    const missingDescription = structuredCloneWithoutFunctions(
      PRIMARY_NAVIGATION_MANIFEST,
    );
    missingDescription[1].items[0].description = "";
    expect(() => validatePrimaryNavigationManifest(missingDescription)).toThrow(
      /description/i,
    );

    const external = structuredCloneWithoutFunctions(PRIMARY_NAVIGATION_MANIFEST);
    external[2].items[1].href = "https://example.com";
    expect(() => validatePrimaryNavigationManifest(external)).toThrow(/internal route/i);

    expect(() =>
      validatePrimaryNavigationManifest(PRIMARY_NAVIGATION_MANIFEST, {
        routeExists: (href) => href !== "/maintenance",
      }),
    ).toThrow(/dead route.*maintenance/i);
  });
});

function labels(groups: ReturnType<typeof resolvePrimaryNavigation>, groupId: string) {
  return (
    groups.find((group) => group.id === groupId)?.items.map((item) => item.label) ?? []
  );
}

function findItem(groups: ReturnType<typeof resolvePrimaryNavigation>, itemId: string) {
  const item = groups
    .flatMap((group) => group.items)
    .find((entry) => entry.id === itemId);
  if (!item) throw new Error(`Missing item ${itemId}`);
  return item;
}

type DeepMutable<T> = T extends readonly (infer E)[]
  ? DeepMutable<E>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;

function structuredCloneWithoutFunctions<T>(value: T): DeepMutable<T> {
  return JSON.parse(JSON.stringify(value)) as DeepMutable<T>;
}
