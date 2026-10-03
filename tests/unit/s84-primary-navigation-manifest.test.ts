import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateAuthClaims, type AuthenticatedUser } from "@/lib/auth/session";
import {
  ACTIVE_DASHBOARD_COMPOSITION,
  DASHBOARD_NAVIGATION_COPY,
  PRIMARY_NAVIGATION_MANIFEST,
  resolvePrimaryNavigation,
  validatePrimaryNavigationManifest,
} from "@/lib/navigation/primary-navigation";
import { isPrimaryNavigationItemActive } from "@/lib/navigation/primary-navigation-contract";

// S167: every staff account has every internal Space. These helpers sign an account in through
// the real claim validation with the scope claim an existing account may still carry, so each
// navigation assertion proves the leftover claim no longer filters a destination.
const editor = (scopes: readonly string[]): AuthenticatedUser =>
  validateAuthClaims({
    uid: "editor-1",
    email: "editor-1@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    scopes,
  });

const admin = (scopes?: readonly string[]): AuthenticatedUser =>
  validateAuthClaims({
    uid: "admin-1",
    email: "admin-1@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin",
    ...(scopes ? { scopes } : {}),
  });

const ALL_OPERATIONS = ["Lease Renewal", "Maintenance", "Internal Processes"];
const originalAllowedHd = process.env.ALLOWED_HD;

beforeEach(() => {
  process.env.ALLOWED_HD = "pmikcmetro.com";
});

afterEach(() => {
  process.env.ALLOWED_HD = originalAllowedHd;
});

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

  it("S146/S147: pairs the Dashboard copy to the AI-first composition", () => {
    // S146/S147 replaced the current-operations panels with the AI workspace plus one compact
    // attention queue, so the navigation description changes with it (S95's plan is superseded).
    expect(ACTIVE_DASHBOARD_COMPOSITION).toBe("ai-first");
    expect(DASHBOARD_NAVIGATION_COPY[ACTIVE_DASHBOARD_COMPOSITION]).toBe(
      "Ask AI about your work, and see what is waiting on you.",
    );
    expect(DASHBOARD_NAVIGATION_COPY["current-operations"]).toBe(
      "Ask about a property or process, and see work that needs attention.",
    );
    expect(DASHBOARD_NAVIGATION_COPY["shared-ai-work"]).toBe(
      "Ask AI about current work, then open My Work to act.",
    );
  });

  // S167: a maintenance-only claim used to hide Lease Renewal and the Approval Queue, and a
  // renewals-only claim used to hide Maintenance.
  it("shows an Editor every Space destination whatever scope claim is left, keeping role truth", () => {
    for (const leftoverClaim of [["maintenance"], ["renewals"]]) {
      const groups = resolvePrimaryNavigation(editor(leftoverClaim));
      expect(labels(groups, "my-work")).toEqual([
        "My Work",
        "Dashboard",
        "Approval Queue",
      ]);
      expect(labels(groups, "operations")).toEqual(ALL_OPERATIONS);
      expect(labels(groups, "admin")).toEqual(["Admin", "Connections", "Communications"]);
      // The role still decides the Admin destination: a non-Admin gets self-service access only.
      expect(findItem(groups, "admin")).toMatchObject({
        href: "/admin/access",
        description: "View your access and request the permissions you need.",
      });
      expect(findItem(groups, "approval-queue")).toMatchObject({
        href: "/approval-queue",
        description: "See requests waiting for an approval decision.",
      });
    }
  });

  // S167: the Operations and Approval Queue columns used to vary with the scope claim.
  it.each([
    ["Editor", [], "/admin/access"],
    ["Editor", ["renewals"], "/admin/access"],
    ["Approver", ["maintenance"], "/admin/access"],
    ["Approver", ["renewals", "maintenance"], "/admin/access"],
    ["Admin", undefined, "/admin"],
  ] as const)(
    "resolves the %s actor with leftover claim %j to every Space and its role's Admin target",
    (role, scopes, adminHref) => {
      const user = validateAuthClaims({
        uid: `${role.toLowerCase()}-matrix`,
        email: `${role.toLowerCase()}-matrix@pmikcmetro.com`,
        hd: "pmikcmetro.com",
        role,
        ...(scopes === undefined ? {} : { scopes: [...scopes] }),
      });
      const resolved = resolvePrimaryNavigation(user, { pendingAccessRequestCount: 2 });
      expect(labels(resolved, "operations")).toEqual(ALL_OPERATIONS);
      expect(findItem(resolved, "approval-queue").href).toBe("/approval-queue");
      // Role truth is unchanged: only an Admin reaches Admin itself or sees the pending count.
      expect(findItem(resolved, "admin").href).toBe(adminHref);
      expect(Boolean(findItem(resolved, "admin").badge)).toBe(role === "Admin");
      expect(Boolean(findItem(resolved, "approval-queue").badge)).toBe(role === "Admin");
    },
  );

  // S167: this Admin used to be routed to the access-only lane without Lease Renewal.
  it("gives an Admin with a leftover maintenance-only claim the full queue and reuses one pending projection", () => {
    const groups = resolvePrimaryNavigation(admin(["maintenance"]), {
      pendingAccessRequestCount: 7,
    });

    expect(findItem(groups, "approval-queue")).toMatchObject({
      href: "/approval-queue",
      description: "Review work and access requests waiting for a decision.",
      badge: { value: 7, label: "7 pending access requests" },
    });
    expect(findItem(groups, "admin")).toMatchObject({
      href: "/admin",
      description: "Manage people, access, policies, and app readiness.",
      badge: { value: 7, label: "7 pending access requests" },
    });
    expect(labels(groups, "operations")).toEqual(ALL_OPERATIONS);
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

  // S167: actor filtering used to remove this renewals-only group for a maintenance-only claim.
  it("keeps a renewals-only group for a leftover maintenance-only claim and omits a group with no destinations", () => {
    const renewalsOnlyGroup = [
      {
        id: "operations",
        label: "Operations",
        tone: "operations",
        items: [
          {
            id: "lease-renewal",
            label: "Lease Renewal",
            description: "Find a lease, check its details, and follow the renewal steps.",
            href: "/lease-renewal",
            activePaths: ["/lease-renewal"],
            icon: "calendar-renew",
            visibility: "renewals",
          },
        ],
      },
    ] as const;

    const resolved = resolvePrimaryNavigation(
      editor(["maintenance"]),
      {},
      renewalsOnlyGroup,
    );
    expect(resolved.map((group) => group.id)).toEqual(["operations"]);
    expect(labels(resolved, "operations")).toEqual(["Lease Renewal"]);

    expect(
      resolvePrimaryNavigation(editor(["maintenance"]), {}, [
        { ...renewalsOnlyGroup[0], items: [] },
      ]),
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
