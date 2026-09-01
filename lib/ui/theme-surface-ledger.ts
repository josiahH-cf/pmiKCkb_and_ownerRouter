import type { ResolvedTheme } from "@/lib/ui/theme";

type CohortId = 1 | 2 | 3 | 4 | 5;

interface ThemeExperienceEntry {
  id: string;
  name: string;
  routes: readonly string[];
  cohort: CohortId;
  themes: readonly ResolvedTheme[];
  viewports: readonly number[];
  zoom: readonly number[];
  states: readonly string[];
  forcedColors: true;
  reducedMotion: true;
}

const COMMON = {
  themes: ["light", "dark"] as const,
  viewports: [1280, 760, 320] as const,
  zoom: [1, 2] as const,
  forcedColors: true as const,
  reducedMotion: true as const,
};

function experience(
  id: number,
  name: string,
  routes: readonly string[],
  cohort: CohortId,
  states: readonly string[],
): ThemeExperienceEntry {
  return {
    id: `SUR-${String(id).padStart(2, "0")}`,
    name,
    routes,
    cohort,
    states,
    ...COMMON,
  };
}

export const THEME_EXPERIENCE_LEDGER = [
  experience(1, "Staff sign-in", ["/sign-in"], 1, ["ready", "error", "disabled"]),
  experience(2, "Vendor setup", ["/vendor/setup"], 1, ["loading", "error", "permission"]),
  experience(3, "Vendor sign-in", ["/vendor/sign-in"], 1, ["ready", "error", "disabled"]),
  experience(4, "Vendor portal", ["/vendor"], 1, ["loading", "empty", "error"]),
  experience(5, "Vendor ticket", ["/vendor/tickets/[ticketId]"], 1, [
    "loading",
    "permission",
    "degraded",
  ]),
  experience(6, "Dashboard and Ask", ["/", "/ask"], 3, ["loading", "empty", "error"]),
  experience(7, "Internal Processes", ["/spaces"], 3, ["loading", "empty", "error"]),
  experience(8, "Internal Process detail", ["/spaces/[spaceId]"], 3, [
    "loading",
    "permission",
    "degraded",
  ]),
  experience(9, "Published process page", ["/spaces/[spaceId]/pages/[slug]"], 3, [
    "loading",
    "empty",
    "error",
  ]),
  experience(10, "Process list", ["/processes"], 3, ["loading", "empty", "error"]),
  experience(11, "Process detail", ["/processes/[definitionId]"], 3, [
    "loading",
    "permission",
    "degraded",
  ]),
  experience(12, "Workflow run", ["/workflow-runs/[runId]"], 3, [
    "loading",
    "error",
    "disabled",
  ]),
  experience(13, "My Work", ["/work"], 3, ["loading", "empty", "error"]),
  experience(14, "Connections", ["/connections"], 4, ["loading", "empty", "degraded"]),
  experience(15, "Communications", ["/gmail-hub"], 4, ["loading", "empty", "error"]),
  experience(16, "Maintenance", ["/maintenance"], 4, ["loading", "empty", "permission"]),
  experience(17, "Approval Queue", ["/approval-queue"], 4, [
    "loading",
    "empty",
    "disabled",
  ]),
  experience(18, "Notifications", ["/notifications"], 4, ["loading", "empty", "error"]),
  experience(19, "Admin", ["/admin"], 4, ["loading", "permission", "degraded"]),
  experience(20, "Admin users", ["/admin/users"], 4, ["loading", "empty", "permission"]),
  experience(21, "Admin team work", ["/admin/team-work"], 4, [
    "loading",
    "empty",
    "error",
  ]),
  experience(22, "Admin vendors", ["/admin/vendors"], 4, [
    "loading",
    "empty",
    "permission",
  ]),
  experience(23, "Admin migration", ["/admin/migration"], 4, [
    "loading",
    "error",
    "disabled",
  ]),
  experience(24, "Admin Space request", ["/admin/spaces/request"], 4, [
    "ready",
    "error",
    "disabled",
  ]),
  experience(25, "Admin Gmail governance", ["/admin/gmail-inbox-zero"], 4, [
    "loading",
    "empty",
    "degraded",
  ]),
  experience(26, "Renewal desk", ["/lease-renewal/live/desk"], 4, [
    "loading",
    "empty",
    "error",
  ]),
  experience(27, "Lease workspace", ["/lease-renewal/live/desk/lease/[leaseId]"], 4, [
    "loading",
    "permission",
    "degraded",
  ]),
  experience(
    28,
    "Renewal reconciliation",
    ["/lease-renewal/runs/[runId]/reconciliation/[fieldKey]"],
    4,
    ["loading", "error", "disabled"],
  ),
  experience(29, "Property history", ["/lease-renewal/property/[propertyKey]"], 4, [
    "loading",
    "empty",
    "degraded",
  ]),
] as const;

export const THEME_MIGRATION_COHORTS = [
  { id: 1, owner: "root/public/vendor chrome" },
  { id: 2, owner: "shared controls and state primitives" },
  { id: 3, owner: "work and process surfaces" },
  { id: 4, owner: "operational and admin surfaces" },
  { id: 5, owner: "cross-cohort regression and alias deletion" },
] as const;

type SourceDisposition = "remove" | "retain-source";
interface SourceMigration {
  oldName: string;
  newRole: string;
  cohort: CohortId;
  disposition: SourceDisposition;
  expectedUsageCount: number;
}

const removed = (
  oldName: string,
  newRole: string,
  cohort: CohortId,
): SourceMigration => ({
  oldName,
  newRole,
  cohort,
  disposition: "remove",
  expectedUsageCount: 0,
});
const retained = (oldName: string): SourceMigration => ({
  oldName,
  newRole: "brand source manifest",
  cohort: 5,
  disposition: "retain-source",
  expectedUsageCount: 1,
});

export const THEME_SOURCE_MIGRATION_LEDGER = [
  removed("--color-bg", "--ui-surface", 1),
  removed("--color-surface", "--ui-canvas", 1),
  removed("--color-border", "--ui-border", 2),
  removed("--color-text", "--ui-text", 1),
  removed("--color-text-muted", "--ui-text-muted", 1),
  removed("--color-primary-900", "--topbar-surface", 1),
  removed("--color-primary-700", "split by action/link/boundary role", 2),
  removed("--color-primary-500", "--ui-border-strong", 2),
  removed("--color-primary-100", "--ui-selected-surface", 2),
  removed("--color-accent-700", "--action-primary", 2),
  removed("--color-accent-500", "--action-primary or --ui-focus", 2),
  removed("--color-accent-100", "--ui-selected-surface", 2),
  removed("--state-verified", "--state-verified-text", 2),
  removed("--state-partial", "--state-caution-text", 2),
  removed("--state-placeholder", "--state-neutral-text", 2),
  removed("--state-conflict", "--state-caution-text", 2),
  removed("--state-no-source", "--state-error-text", 2),
  removed("--state-reference", "--state-reference-text", 2),
  removed("--status-connected", "--state-verified-icon", 4),
  removed("--status-action", "--state-caution-icon", 4),
  removed("--status-none", "--state-neutral-icon", 4),
  removed("--color-required", "--field-required-text", 2),
  removed("--shadow-floating", "--elevation-overlay", 2),
  removed("--font-size-sm", "--font-size-min", 2),
  removed("--color-bg-subtle", "--ui-surface-recessed", 2),
  removed("--color-primary", "--ui-border-strong", 2),
  retained("--pmi-black"),
  retained("--pmi-white"),
  retained("--pmi-orange"),
  removed("--pmi-orange-bright", "--topbar-accent or --ui-focus", 1),
  removed("--pmi-orange-100", "--ui-selected-surface or --nav-operations-tile", 2),
  removed("--pmi-orange-on-dark", "--topbar-accent", 1),
] as const;
