import type { AssuranceRole, AssuranceRouteKey } from "./types";

export interface CanaryRouteDefinition {
  readonly key: AssuranceRouteKey;
  readonly path: string;
  readonly expectedOutcome: "rendered" | "denied";
  readonly heading?: string;
  readonly requiredSpace?: "maintenance" | "renewals";
  readonly dynamicFrom?: "renewal_desk";
}

const COMMON_ROUTES: readonly CanaryRouteDefinition[] = [
  {
    key: "dashboard",
    path: "/",
    expectedOutcome: "rendered",
    heading: "Dashboard",
  },
  {
    key: "my_work",
    path: "/work",
    expectedOutcome: "rendered",
    heading: "My work",
  },
  {
    key: "access_center",
    path: "/admin/access",
    expectedOutcome: "rendered",
    heading: "Understand and request my access",
  },
  {
    key: "connections",
    path: "/connections",
    expectedOutcome: "rendered",
    heading: "Connections",
  },
  {
    key: "renewal_desk",
    path: "/lease-renewal/live/desk?v=2&scope=all",
    expectedOutcome: "rendered",
    heading: "Renewals",
    requiredSpace: "renewals",
  },
  {
    key: "renewal_workspace",
    path: "",
    expectedOutcome: "rendered",
    requiredSpace: "renewals",
    dynamicFrom: "renewal_desk",
  },
  {
    key: "maintenance",
    path: "/maintenance",
    expectedOutcome: "rendered",
    heading: "Maintenance Work Order Intake",
    requiredSpace: "maintenance",
  },
  {
    key: "communications",
    path: "/gmail-hub",
    expectedOutcome: "rendered",
    heading: "Workflow Communications",
  },
  {
    key: "internal_processes",
    path: "/spaces",
    expectedOutcome: "rendered",
    heading: "Internal Processes",
  },
  {
    key: "notifications",
    path: "/notifications",
    expectedOutcome: "rendered",
    heading: "Notifications",
  },
];

const ADMIN_ROUTES: readonly CanaryRouteDefinition[] = [
  {
    key: "approval_queue_access",
    path: "/approval-queue?view=access",
    expectedOutcome: "rendered",
    heading: "Approval Queue",
  },
  {
    key: "admin_hub",
    path: "/admin",
    expectedOutcome: "rendered",
    heading: "Admin",
  },
  {
    key: "people_and_access",
    path: "/admin/users",
    expectedOutcome: "rendered",
    heading: "People and Access",
  },
];

const EDITOR_DENIAL_ROUTES: readonly CanaryRouteDefinition[] = [
  {
    key: "admin_hub_denied",
    path: "/admin",
    expectedOutcome: "denied",
  },
  {
    key: "people_and_access_denied",
    path: "/admin/users",
    expectedOutcome: "denied",
  },
];

export const AUTHENTICATED_CANARY_MANIFEST: Readonly<
  Record<AssuranceRole, readonly CanaryRouteDefinition[]>
> = Object.freeze({
  Admin: Object.freeze([...COMMON_ROUTES, ...ADMIN_ROUTES]),
  Editor: Object.freeze([...COMMON_ROUTES, ...EDITOR_DENIAL_ROUTES]),
});

export function routesForRole(role: AssuranceRole): readonly CanaryRouteDefinition[] {
  return AUTHENTICATED_CANARY_MANIFEST[role];
}
