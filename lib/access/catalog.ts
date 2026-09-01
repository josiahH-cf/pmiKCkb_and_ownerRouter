import { can, type Capability, type Role } from "@/lib/auth/roles";
import { ROLES, SPACE_SCOPES, type SpaceScope } from "@/lib/constants";

export const ACCESS_CATALOG_VERSION = "catalog-v1" as const;

/**
 * Deliberate declaration order for every S83 projection and preview. This is a request catalog,
 * never an authorization source: enforcement continues to call `can` and the existing page/API
 * guards.
 */
export const ACCESS_CAPABILITIES = [
  "read",
  "edit",
  "sendEmail",
  "approve",
  "resolvePlaceholder",
  "manageAdmin",
  "softDelete",
] as const satisfies readonly Capability[];

export interface AccessCapabilityCatalogEntry {
  readonly key: Capability;
  readonly label: string;
  readonly impact: string;
  readonly minimumRole: Role;
  readonly namedSpaceRequestable: boolean;
}

export const ACCESS_CAPABILITY_CATALOG: readonly AccessCapabilityCatalogEntry[] = [
  {
    key: "read",
    label: "View app work",
    impact: "View app work in Spaces you can access.",
    minimumRole: "Editor",
    namedSpaceRequestable: true,
  },
  {
    key: "edit",
    label: "Create and update app work",
    impact: "Create and update app-owned work in Spaces you can access.",
    minimumRole: "Editor",
    namedSpaceRequestable: true,
  },
  {
    key: "sendEmail",
    label: "Use governed workflow communications",
    impact:
      "Use workflow-linked communication controls; this is not generic compose or send permission and does not open an exact Gmail action.",
    minimumRole: "Editor",
    namedSpaceRequestable: true,
  },
  {
    key: "approve",
    label: "Approve eligible app work",
    impact:
      "Approve eligible app work subject to ownership, reviewer, effect, and exact-action rules.",
    minimumRole: "Approver",
    namedSpaceRequestable: true,
  },
  {
    key: "resolvePlaceholder",
    label: "Resolve verified placeholders",
    impact:
      "Resolve verified placeholders without inventing source facts or provider writes.",
    minimumRole: "Approver",
    namedSpaceRequestable: true,
  },
  {
    key: "manageAdmin",
    label: "Manage users, access, configuration, and supported connections",
    impact:
      "Manage supported application administration; this does not open a closed action or permit client sending.",
    minimumRole: "Admin",
    namedSpaceRequestable: false,
  },
  {
    key: "softDelete",
    label: "Remove eligible app records through recoverable controls",
    impact:
      "Use recoverable app-record removal; this is not provider-data deletion authority.",
    minimumRole: "Admin",
    namedSpaceRequestable: true,
  },
] as const;

export const ACCESS_ROLE_CATALOG = ROLES.map((role) => ({
  key: role,
  label: role,
  capabilityKeys: ACCESS_CAPABILITIES.filter((capability) => can(role, capability)),
})) as readonly {
  readonly key: Role;
  readonly label: string;
  readonly capabilityKeys: readonly Capability[];
}[];

const SPACE_LABELS: Readonly<Record<SpaceScope, string>> = {
  renewals: "Lease Renewals",
  maintenance: "Maintenance",
};

export const ACCESS_SPACE_CATALOG = SPACE_SCOPES.map((id) => ({
  id,
  label: SPACE_LABELS[id],
})) as readonly { readonly id: SpaceScope; readonly label: string }[];

export function isAccessCapability(value: unknown): value is Capability {
  return (
    typeof value === "string" &&
    (ACCESS_CAPABILITIES as readonly string[]).includes(value)
  );
}

export function isAccessRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isAccessSpace(value: unknown): value is SpaceScope {
  return typeof value === "string" && (SPACE_SCOPES as readonly string[]).includes(value);
}

export function minimumRoleForCapability(capability: Capability): Role {
  if (!isAccessCapability(capability)) {
    throw new Error(`Unknown access capability: ${String(capability)}`);
  }
  const role = ROLES.find((candidate) => can(candidate, capability));
  if (!role) {
    throw new Error(`No existing role provides capability: ${capability}`);
  }
  return role;
}

export function capabilityCatalogEntry(capability: Capability) {
  const entry = ACCESS_CAPABILITY_CATALOG.find(
    (candidate) => candidate.key === capability,
  );
  if (!entry) throw new Error(`Unknown access capability: ${String(capability)}`);
  return entry;
}

export function roleCatalogEntry(role: Role) {
  const entry = ACCESS_ROLE_CATALOG.find((candidate) => candidate.key === role);
  if (!entry) throw new Error(`Unknown access role: ${String(role)}`);
  return entry;
}

export function spaceCatalogEntry(space: SpaceScope) {
  const entry = ACCESS_SPACE_CATALOG.find((candidate) => candidate.id === space);
  if (!entry) throw new Error(`Unknown access Space: ${String(space)}`);
  return entry;
}
