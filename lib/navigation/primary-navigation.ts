import { can } from "@/lib/auth/roles";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import type {
  PrimaryNavigationGroupId,
  PrimaryNavigationIconKey,
  PrimaryNavigationTone,
  ResolvedPrimaryNavigationGroup,
  ResolvedPrimaryNavigationItem,
} from "@/lib/navigation/primary-navigation-contract";

export const DASHBOARD_NAVIGATION_COPY = {
  "current-operations":
    "Review current operations and ask about approved PMI KC guidance.",
  "shared-ai-work": "Ask AI about current work, then open My Work to act.",
} as const;

export type DashboardComposition = keyof typeof DASHBOARD_NAVIGATION_COPY;

/** S95 changes this value atomically with the shared Dashboard body; S84 remains truthful meanwhile. */
export const ACTIVE_DASHBOARD_COMPOSITION: DashboardComposition = "current-operations";

type PrimaryNavigationVisibility =
  | "all-staff"
  | "renewals"
  | "maintenance"
  | "renewals-or-admin";

export interface PrimaryNavigationItemDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly href: string;
  readonly activePaths: readonly string[];
  readonly icon: PrimaryNavigationIconKey;
  readonly visibility: PrimaryNavigationVisibility;
}

export interface PrimaryNavigationGroupDefinition {
  readonly id: PrimaryNavigationGroupId;
  readonly label: string;
  readonly tone: PrimaryNavigationTone;
  readonly items: readonly PrimaryNavigationItemDefinition[];
}

/**
 * S84's one source of navigation order, copy, icons, routes, active aliases, tones, and visibility.
 * It is serializable so deterministic tests can mutate malformed copies without executing predicates.
 */
export const PRIMARY_NAVIGATION_MANIFEST: readonly PrimaryNavigationGroupDefinition[] = [
  {
    id: "my-work",
    label: "My Work",
    tone: "work",
    items: [
      {
        id: "my-work",
        label: "My Work",
        description: "See assigned work, follow-ups, and items you own.",
        href: "/work",
        activePaths: ["/work"],
        icon: "clipboard-checklist",
        visibility: "all-staff",
      },
      {
        id: "dashboard",
        label: "Dashboard",
        description: DASHBOARD_NAVIGATION_COPY[ACTIVE_DASHBOARD_COMPOSITION],
        href: "/ask",
        activePaths: ["/ask", "/"],
        icon: "assistant-spark",
        visibility: "all-staff",
      },
      {
        id: "approval-queue",
        label: "Approval Queue",
        description: "Review work waiting for an authorized decision.",
        href: "/approval-queue",
        activePaths: ["/approval-queue"],
        icon: "approval-tray",
        visibility: "renewals-or-admin",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    tone: "operations",
    items: [
      {
        id: "lease-renewal",
        label: "Lease Renewal",
        description: "Review upcoming renewals and complete the next required action.",
        href: "/lease-renewal",
        activePaths: ["/lease-renewal"],
        icon: "calendar-renew",
        visibility: "renewals",
      },
      {
        id: "maintenance",
        label: "Maintenance",
        description: "Track maintenance intake and active repair work.",
        href: "/maintenance",
        activePaths: ["/maintenance"],
        icon: "wrench",
        visibility: "maintenance",
      },
      {
        id: "internal-processes",
        label: "Internal Processes",
        description: "Browse internal workflows and the process areas that support them.",
        href: "/spaces",
        activePaths: ["/spaces", "/processes"],
        icon: "workflow-nodes",
        visibility: "all-staff",
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    tone: "admin",
    items: [
      {
        id: "admin",
        label: "Admin",
        description: "Manage people, access, policies, and app readiness.",
        href: "/admin",
        activePaths: ["/admin"],
        icon: "shield-user",
        visibility: "all-staff",
      },
      {
        id: "connections",
        label: "Connections",
        description: "Check connected-service status and available setup actions.",
        href: "/connections",
        activePaths: ["/connections"],
        icon: "plug-connected",
        visibility: "all-staff",
      },
      {
        id: "communications",
        label: "Communications",
        description: "Review workflow-linked messages, replies, and unsent drafts.",
        href: "/gmail-hub",
        activePaths: ["/gmail-hub"],
        icon: "message-envelope",
        visibility: "all-staff",
      },
    ],
  },
] as const;

export interface PrimaryNavigationProjection {
  /** Null means S83's authoritative count read failed; undefined means it was not requested. */
  readonly pendingAccessRequestCount?: number | null;
}

export function resolvePrimaryNavigation(
  user: AuthenticatedUser,
  projection: PrimaryNavigationProjection = {},
  manifest: readonly PrimaryNavigationGroupDefinition[] = PRIMARY_NAVIGATION_MANIFEST,
): readonly ResolvedPrimaryNavigationGroup[] {
  const canManageAdmin = can(user.role, "manageAdmin");
  const hasRenewals = hasSpaceAccess(user, "renewals");
  const hasMaintenance = hasSpaceAccess(user, "maintenance");
  const pendingCount = projection.pendingAccessRequestCount;

  if (
    pendingCount !== undefined &&
    pendingCount !== null &&
    (!Number.isSafeInteger(pendingCount) || pendingCount < 0)
  ) {
    throw new Error(
      "Primary navigation received an invalid pending access-request count.",
    );
  }

  return manifest
    .map((group) => ({
      id: group.id,
      label: group.label,
      tone: group.tone,
      items: group.items
        .filter((item) =>
          isVisible(item.visibility, { canManageAdmin, hasMaintenance, hasRenewals }),
        )
        .map((item) => resolveItem(item, { canManageAdmin, hasRenewals, pendingCount })),
    }))
    .filter((group) => group.items.length > 0);
}

function isVisible(
  visibility: PrimaryNavigationVisibility,
  context: Readonly<{
    canManageAdmin: boolean;
    hasMaintenance: boolean;
    hasRenewals: boolean;
  }>,
) {
  switch (visibility) {
    case "all-staff":
      return true;
    case "renewals":
      return context.hasRenewals;
    case "maintenance":
      return context.hasMaintenance;
    case "renewals-or-admin":
      return context.hasRenewals || context.canManageAdmin;
  }
}

function resolveItem(
  item: PrimaryNavigationItemDefinition,
  context: Readonly<{
    canManageAdmin: boolean;
    hasRenewals: boolean;
    pendingCount: number | null | undefined;
  }>,
): ResolvedPrimaryNavigationItem {
  let description = item.description;
  let href = item.href;
  let activePaths = item.activePaths;

  if (item.id === "approval-queue") {
    if (context.canManageAdmin && context.hasRenewals) {
      description = "Review work and access requests waiting for a decision.";
    } else if (context.canManageAdmin) {
      description = "Review access requests waiting for an Admin decision.";
      href = "/approval-queue?view=access";
    }
  } else if (item.id === "admin" && !context.canManageAdmin) {
    description = "View your access and request the permissions you need.";
    href = "/admin/access";
    activePaths = ["/admin/access"];
  }

  const badge =
    context.canManageAdmin &&
    (item.id === "approval-queue" || item.id === "admin") &&
    typeof context.pendingCount === "number"
      ? {
          value: context.pendingCount,
          label: `${context.pendingCount} pending access request${context.pendingCount === 1 ? "" : "s"}`,
        }
      : undefined;

  return {
    id: item.id,
    label: item.label,
    description,
    href,
    activePaths,
    icon: item.icon,
    ...(badge ? { badge } : {}),
  };
}

export function validatePrimaryNavigationManifest(
  manifest: readonly PrimaryNavigationGroupDefinition[],
  options: Readonly<{ routeExists?: (href: string) => boolean }> = {},
) {
  const groupIds = new Set<string>();
  const itemIds = new Set<string>();
  const hrefs = new Set<string>();
  const icons = new Set<string>();

  for (const group of manifest) {
    requireText(group.id, "group id");
    requireText(group.label, `group ${group.id} label`);
    if (groupIds.has(group.id))
      throw new Error(`Duplicate navigation group id: ${group.id}.`);
    groupIds.add(group.id);
    if (!group.items.length) throw new Error(`Navigation group ${group.id} is empty.`);

    for (const item of group.items) {
      requireText(item.id, `item id in ${group.id}`);
      requireText(item.label, `item ${item.id} label`);
      requireText(item.description, `item ${item.id} description`);
      requireInternalRoute(item.href, `item ${item.id}`);
      if (itemIds.has(item.id))
        throw new Error(`Duplicate navigation item id: ${item.id}.`);
      if (hrefs.has(item.href))
        throw new Error(`Duplicate navigation route: ${item.href}.`);
      if (icons.has(item.icon))
        throw new Error(`Duplicate navigation icon: ${item.icon}.`);
      itemIds.add(item.id);
      hrefs.add(item.href);
      icons.add(item.icon);
      if (!item.activePaths.length) {
        throw new Error(`Navigation item ${item.id} has no active route.`);
      }
      for (const activePath of item.activePaths) {
        requireInternalRoute(activePath, `active route for ${item.id}`);
      }
      if (options.routeExists && !options.routeExists(item.href)) {
        throw new Error(`Dead route in navigation item ${item.id}: ${item.href}.`);
      }
    }
  }
}

function requireText(value: string, field: string) {
  if (!value.trim()) throw new Error(`Primary navigation ${field} is missing.`);
}

function requireInternalRoute(value: string, field: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    throw new Error(`Primary navigation ${field} must use a trusted internal route.`);
  }
}

validatePrimaryNavigationManifest(PRIMARY_NAVIGATION_MANIFEST);
