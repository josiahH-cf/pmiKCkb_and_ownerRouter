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
    key: "renewal_readiness",
    path: "/lease-renewal/readiness",
    expectedOutcome: "rendered",
    heading: "Renewal run readiness",
    requiredSpace: "renewals",
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

export function routesForRole(
  role: AssuranceRole,
  expectedCommit?: string,
): readonly CanaryRouteDefinition[] {
  const current = AUTHENTICATED_CANARY_MANIFEST[role];
  const historical = [
    "337ac163c5709381e8db8d2c18810bec357d8a96",
    "72a30e25537e8ea7ff79391146246c1f9b94375e",
    "eb5d35991c3ec128a102e4483d3779af16106821",
    "e106a88a50d541b4a012111019b09c2183f6ce20",
    "a7bce0981badc7523a6498949b6ea5f2effb198e",
    "b8829897e407dafdad94da0fd560afbcc539e397",
  ].includes(expectedCommit ?? "");
  const routes: readonly CanaryRouteDefinition[] = historical
    ? current.map((route) =>
        route.key === "renewal_readiness"
          ? {
              key: "maintenance",
              path: "/maintenance/history",
              expectedOutcome: "rendered",
              heading: "Read-only maintenance history",
              requiredSpace: "maintenance",
            }
          : route,
      )
    : current;
  // The captured serving image (including its run-bound recovery clone) retains this exact title.
  // Candidates and unknown commits still require the current landmark; no alternate is accepted.
  if (
    [
      "337ac163c5709381e8db8d2c18810bec357d8a96",
      "72a30e25537e8ea7ff79391146246c1f9b94375e",
      "eb5d35991c3ec128a102e4483d3779af16106821",
    ].includes(expectedCommit ?? "")
  )
    return routes.map((route) =>
      route.key === "maintenance"
        ? { ...route, path: "/maintenance", heading: "Maintenance" }
        : route,
    );
  if (expectedCommit !== "e106a88a50d541b4a012111019b09c2183f6ce20") return routes;
  return routes.map((route) =>
    route.key === "maintenance"
      ? { ...route, path: "/maintenance", heading: "Maintenance Work Order Intake" }
      : route,
  );
}
