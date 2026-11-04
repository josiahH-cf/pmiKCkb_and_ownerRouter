import type { HelpScreenReference } from "@/lib/help/types";

const MAINTENANCE_SPACE = "/spaces/maintenance-work-order-intake";
const SPACE_PAGE = ["app/spaces/[spaceId]/page.tsx"];

export const MAINTENANCE_HISTORY_SCREENS: readonly HelpScreenReference[] = [
  {
    id: "maintenance-history",
    title: "Maintenance history",
    routes: [
      "/maintenance",
      "/maintenance/history",
      "/maintenance/policies",
      "/maintenance/report",
      "/maintenance/retired",
      "/maintenance/vendors",
    ],
    who: "All staff",
    summary:
      "Custom maintenance in the app is retired, and maintenance work is managed in standalone Vendoroo. Each of these older maintenance links opens Lease Renewal, the renewal desk, instead and shows no maintenance record. The retained maintenance knowledge and history stay in two Spaces under Internal Processes, Maintenance history and Vendor handoff history, which show the retirement panel. Retained records keep their original permissions, and nothing is purged.",
    controls: [
      {
        label: "Renewals",
        role: "heading",
        availability: "required",
        source: ["components/lease-renewal/RenewalDesk.tsx"],
        does: "Names the renewal desk, where every older maintenance link opens. No maintenance page or record opens.",
        who: "All staff",
        route: "/maintenance",
      },
      {
        label: "Maintenance history",
        role: "heading",
        availability: "required",
        source: ["lib/spaces.ts"],
        does: "Names the Space that keeps retained maintenance knowledge and history. Its card in Internal Processes reads Read-only history.",
        who: "All staff",
        route: MAINTENANCE_SPACE,
      },
      {
        label: "Custom maintenance is retired",
        role: "heading",
        availability: "required",
        source: SPACE_PAGE,
        does: "Heads the retirement panel in both maintenance history Spaces: maintenance is managed in standalone Vendoroo, and existing knowledge and publication records keep their original permissions.",
        who: "All staff",
        route: MAINTENANCE_SPACE,
      },
      {
        label: "Operational pages",
        role: "complementary",
        availability: "conditional",
        source: SPACE_PAGE,
        does: "Shown when the Space has published pages. Lists them; each opens to read.",
        who: "All staff",
        route: MAINTENANCE_SPACE,
      },
      {
        label: "Approved sources the app can cite",
        role: "heading",
        availability: "required",
        source: ["components/spaces/TrustedPublicationPanel.tsx"],
        does: "Heads the approved sources panel that every Space shows, for the documents answers can cite.",
        who: "All staff",
        route: MAINTENANCE_SPACE,
      },
      {
        label: "Back to Internal Processes",
        role: "link",
        availability: "required",
        source: SPACE_PAGE,
        does: "Returns to Internal Processes, where the other history Space is listed.",
        who: "All staff",
        route: MAINTENANCE_SPACE,
      },
      {
        label: "Vendor handoff history",
        role: "heading",
        availability: "required",
        source: ["lib/spaces.ts"],
        does: "Names the second Space of retained maintenance history. It shows the same retirement panel.",
        who: "All staff",
        route: "/spaces/vendor-assignment-handoff",
      },
    ],
    guides: ["maintenance-history"],
    spaces: ["maintenance-work-order-intake", "vendor-assignment-handoff"],
    lastUpdated: "2026-11-04",
  },
];
