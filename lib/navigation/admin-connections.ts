import type { ConnectorView } from "@/lib/connections/connection-status";

export type NavigationCapability = "read" | "manageAdmin";
export type NavigationSurface = "connections" | "admin";

export interface TaskNavigationLink {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly href: string;
  readonly requiredCapability: NavigationCapability;
  readonly surface: NavigationSurface;
}

export interface AdminTaskGroup {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly links: readonly TaskNavigationLink[];
}

export interface ConnectionTaskGroup {
  readonly id: string;
  readonly anchorId: string;
  readonly label: string;
  readonly description: string;
  readonly connectorIds: readonly string[];
  readonly target: TaskNavigationLink;
}

export interface ConnectionTaskView extends ConnectionTaskGroup {
  readonly items: readonly ConnectorView[];
}

/**
 * S81's single task-to-destination manifest. It contains labels, real routes/anchors, and the
 * capability enforced by each destination. It owns no connector, provider, role, or action state.
 */
export const CONNECTION_TASK_GROUPS: readonly ConnectionTaskGroup[] = [
  {
    id: "renewal-data",
    anchorId: "connection-task-renewal-data",
    label: "Renewal data",
    description:
      "Lease, renewal Sheet, market-reference, and pipeline connections used during renewal work.",
    connectorIds: ["rentvine", "google_sheets", "rentcast", "leadsimple"],
    target: {
      id: "connection-renewal-data",
      label: "Review renewal data connections",
      description: "See RentVine, Google Sheets, RentCast, and LeadSimple status.",
      href: "/connections#connection-task-renewal-data",
      requiredCapability: "read",
      surface: "connections",
    },
  },
  {
    id: "communications",
    anchorId: "connection-task-communications",
    label: "Communications",
    description:
      "Workflow-linked Gmail status and the separately closed legacy notification path.",
    connectorIds: ["gmail_inbox", "gmail_sender"],
    target: {
      id: "connection-communications",
      label: "Review messaging connections",
      description: "See workflow Gmail and legacy notification governance status.",
      href: "/connections#connection-task-communications",
      requiredCapability: "read",
      surface: "connections",
    },
  },
  {
    id: "documents-storage",
    anchorId: "connection-task-documents-storage",
    label: "Documents and storage",
    description: "Document source, screenshot storage, and e-signature readiness.",
    connectorIds: ["google_drive", "dotloop"],
    target: {
      id: "connection-documents-storage",
      label: "Review document and storage connections",
      description: "See Google Drive and Dotloop status.",
      href: "/connections#connection-task-documents-storage",
      requiredCapability: "read",
      surface: "connections",
    },
  },
  {
    id: "other-operations",
    anchorId: "connection-task-other-operations",
    label: "Other operations",
    description: "Connected services used outside the core renewal workflow.",
    connectorIds: ["quickbooks"],
    target: {
      id: "connection-other-operations",
      label: "Review other operational connections",
      description: "See accounting connection status.",
      href: "/connections#connection-task-other-operations",
      requiredCapability: "read",
      surface: "connections",
    },
  },
] as const;

export const ADMIN_TASK_GROUPS: readonly AdminTaskGroup[] = [
  {
    id: "people-access",
    label: "People and access",
    description: "Manage who can use the app and which existing role they hold.",
    links: [
      {
        id: "admin-manage-users",
        label: "Manage users and roles",
        description: "Review managed users and role assignments.",
        href: "/admin/users",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
      {
        id: "admin-team-work",
        label: "Assign and review team work",
        description: "Open the existing staff accountability surface.",
        href: "/admin/team-work",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
      {
        id: "admin-vendors",
        label: "Manage Vendor access",
        description: "Review existing Live Vendor accounts and assignments.",
        href: "/admin/vendors",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
    ],
  },
  {
    id: "operational-safety",
    label: "Operational safety",
    description: "Find stops, notification health, support reports, and audit evidence.",
    links: [
      {
        id: "admin-runtime-suspensions",
        label: "Production action stops",
        description: "Review or change the existing runtime suspension controls.",
        href: "/admin#admin-runtime-suspensions",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
      {
        id: "admin-support-reports",
        label: "Support reports",
        description: "Review current feedback and follow-up state.",
        href: "/admin#admin-support-reports",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
      {
        id: "admin-activity-log",
        label: "Admin activity",
        description: "Read recent privileged activity and safety changes.",
        href: "/admin#admin-activity-log",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
    ],
  },
  {
    id: "renewal-policy",
    label: "Renewal policy",
    description: "Find the existing rehearsal, notice, and pricing policy controls.",
    links: [
      {
        id: "admin-renewal-rehearsal-sheet",
        label: "Rehearsal Sheet copy",
        description: "Review the separate copy configuration and proof readiness.",
        href: "/admin#admin-renewal-rehearsal-sheet",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
      {
        id: "admin-renewal-notice-rules",
        label: "Renewal notice rules",
        description: "Review the existing timing and override policy controls.",
        href: "/admin#admin-renewal-notice-rules",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
      {
        id: "admin-owner-pricing-rules",
        label: "Owner pricing rules",
        description: "Review existing owner-specific pricing policy.",
        href: "/admin#admin-owner-pricing-rules",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
    ],
  },
  {
    id: "connected-services-migration",
    label: "Connected services and migration",
    description:
      "Read connection health first, then open only the existing Admin setup tools.",
    links: [
      {
        id: "admin-renewal-connection-status",
        label: "Renewal connection status",
        description: "Review RentVine, Sheets, RentCast, and pipeline status.",
        href: "/connections#connection-task-renewal-data",
        requiredCapability: "read",
        surface: "connections",
      },
      {
        id: "admin-migration",
        label: "Migration readiness",
        description: "Open the existing read-only cutover and environment console.",
        href: "/admin/migration",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
      {
        id: "admin-space-request",
        label: "Request a Space",
        description: "Open the existing bounded Space request workflow.",
        href: "/admin/spaces/request",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
      {
        id: "admin-communication-governance",
        label: "Communication governance",
        description: "Review workflow Gmail taxonomy and governance status.",
        href: "/admin/gmail-inbox-zero",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
    ],
  },
  {
    id: "content-publishing",
    label: "Content and publishing",
    description: "Find review, page-building, and publication policy controls.",
    links: [
      {
        id: "admin-kb-corrections",
        label: "Answer corrections",
        description: "Review proposed knowledge corrections.",
        href: "/admin#admin-kb-corrections",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
      {
        id: "admin-content-builder",
        label: "Operational page builder",
        description: "Open the existing bounded page builder.",
        href: "/admin#admin-content-builder",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
      {
        id: "admin-publication-policies",
        label: "Publication policies",
        description: "Review existing publication guards and rollback policy.",
        href: "/admin#admin-publication-policies",
        requiredCapability: "manageAdmin",
        surface: "admin",
      },
    ],
  },
] as const;

export const TASK_NAVIGATION_LINKS: readonly TaskNavigationLink[] = [
  ...CONNECTION_TASK_GROUPS.map((group) => group.target),
  ...ADMIN_TASK_GROUPS.flatMap((group) => group.links),
];

/**
 * Projects existing source-backed connector items into the manifest's task order. Missing,
 * duplicate, or unassigned catalog items are a programming error rather than silently disappearing.
 */
export function groupConnectionItems(
  items: readonly ConnectorView[],
): readonly ConnectionTaskView[] {
  const byId = new Map(items.map((item) => [item.def.id, item] as const));
  if (byId.size !== items.length) {
    throw new Error("Connection task navigation received duplicate connector ids.");
  }

  const assigned = new Set<string>();
  const groups = CONNECTION_TASK_GROUPS.map((group) => ({
    ...group,
    items: group.connectorIds.map((connectorId) => {
      if (assigned.has(connectorId)) {
        throw new Error(`Connector ${connectorId} appears in more than one task group.`);
      }
      const item = byId.get(connectorId);
      if (!item) {
        throw new Error(
          `Connection task group references unknown connector ${connectorId}.`,
        );
      }
      assigned.add(connectorId);
      return item;
    }),
  }));

  const unassigned = items
    .map((item) => item.def.id)
    .filter((connectorId) => !assigned.has(connectorId));
  if (unassigned.length > 0) {
    throw new Error(`Connectors missing a task group: ${unassigned.sort().join(", ")}.`);
  }

  return groups;
}
