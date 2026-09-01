import type { Capability } from "@/lib/auth/roles";
import type { SpaceScope } from "@/lib/constants";
import { buildAccessRequestHref } from "@/lib/access/handoff";

/**
 * Presentation inventory for first-party role/Space guards. It neither grants access nor replaces
 * the page/API checks named in source_path. Callers render its handoff only after they have proved an
 * insufficient-role or missing-Space denial; external-action/readiness denials never use it.
 */
export const ACCESS_INTENT_MANIFEST = [
  {
    key: "connections.manage",
    source_path: "app/connections/page.tsx",
    capability: "manageAdmin",
    return_to: "/connections",
  },
  {
    key: "communications.admin_tools",
    source_path: "app/gmail-hub/page.tsx",
    capability: "manageAdmin",
    return_to: "/gmail-hub",
  },
  {
    key: "renewals.save_progress",
    source_path: "app/lease-renewal/live/page.tsx",
    capability: "edit",
    space: "renewals",
    return_to: "/lease-renewal/live/desk",
  },
  {
    key: "renewals.resolve_reconciliation",
    source_path: "app/lease-renewal/live/page.tsx",
    capability: "approve",
    space: "renewals",
    return_to: "/lease-renewal/live/desk",
  },
  {
    key: "renewals.manage",
    source_path: "app/lease-renewal/live/page.tsx",
    capability: "manageAdmin",
    return_to: "/lease-renewal/live/desk",
  },
  {
    key: "maintenance.edit",
    source_path: "app/maintenance/page.tsx",
    capability: "edit",
    space: "maintenance",
    return_to: "/maintenance",
  },
  {
    key: "notifications.manage",
    source_path: "app/notifications/page.tsx",
    capability: "manageAdmin",
  },
  {
    key: "processes.edit",
    source_path: "app/processes/page.tsx",
    capability: "edit",
    return_to: "/spaces",
  },
  {
    key: "process_definition.edit",
    source_path: "app/processes/[definitionId]/page.tsx",
    capability: "edit",
    return_to: "/spaces",
  },
  {
    key: "spaces.edit",
    source_path: "app/spaces/[spaceId]/page.tsx",
    capability: "edit",
    return_to: "/spaces",
  },
  {
    key: "spaces.approve",
    source_path: "app/spaces/[spaceId]/page.tsx",
    capability: "approve",
    return_to: "/spaces",
  },
  {
    key: "spaces.soft_delete",
    source_path: "app/spaces/[spaceId]/page.tsx",
    capability: "softDelete",
    return_to: "/spaces",
  },
  {
    key: "workflow_run.edit",
    source_path: "app/workflow-runs/[runId]/page.tsx",
    capability: "edit",
    return_to: "/work",
  },
  {
    key: "console.approve",
    source_path: "components/console/ConsoleView.tsx",
    capability: "approve",
    return_to: "/",
  },
  {
    key: "renewal_workspace.edit",
    source_path: "components/lease-renewal/RenewalWorkspace.tsx",
    capability: "edit",
    space: "renewals",
    return_to: "/lease-renewal/live/desk",
  },
  {
    key: "verified_placeholders.resolve",
    source_path: "components/spaces/SpaceDetailClient.tsx",
    capability: "resolvePlaceholder",
    return_to: "/spaces",
  },
] as const satisfies readonly {
  readonly key: string;
  readonly source_path: string;
  readonly capability: Capability;
  readonly space?: SpaceScope;
  readonly return_to?: string;
}[];

export type AccessIntentSurfaceKey = (typeof ACCESS_INTENT_MANIFEST)[number]["key"];

export function accessIntentManifestEntry(key: AccessIntentSurfaceKey) {
  const entry = ACCESS_INTENT_MANIFEST.find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`Unknown first-party access surface: ${String(key)}`);
  return entry;
}

export function buildSurfaceAccessRequestHref(key: AccessIntentSurfaceKey) {
  const entry = accessIntentManifestEntry(key);
  return buildAccessRequestHref({
    capability: entry.capability,
    space: "space" in entry ? entry.space : undefined,
    returnTo: "return_to" in entry ? entry.return_to : undefined,
  });
}
