import type { HelpGuide } from "@/lib/help/types";

export const MAINTENANCE_HISTORY_GUIDES: readonly HelpGuide[] = [
  {
    id: "maintenance-history",
    section: "maintenance-history",
    title: "Read retained maintenance history",
    audience: "All staff",
    purpose:
      "Find the retained maintenance knowledge and history in Internal Processes, and know where maintenance work is managed now.",
    prerequisites: [
      "You are signed in.",
      "Custom maintenance in the app is retired. Maintenance work is managed in standalone Vendoroo.",
    ],
    steps: [
      {
        id: "open-internal-processes",
        action: "Open the Operations menu and choose Internal Processes.",
        control: {
          label: "Internal Processes",
          role: "link",
          region: "navigation:Primary",
          availability: "required",
          source: ["lib/navigation/primary-navigation.ts"],
          actions: ["click-button:Operations"],
        },
        route: "/",
        where: "Top bar, Operations menu",
        result:
          "Internal Processes opens with a card for each Space. The Maintenance history and Vendor handoff history cards read Read-only history.",
        effect: "reads",
      },
      {
        id: "open-maintenance-history",
        action: "Choose the Maintenance history card.",
        control: {
          label: "Maintenance history",
          role: "heading",
          availability: "required",
          source: ["lib/spaces.ts"],
        },
        route: "/spaces",
        where: "Internal Processes",
        result:
          "The Maintenance history Space opens, marked as retained maintenance knowledge and history and as read-only history.",
        effect: "reads",
      },
      {
        id: "read-the-retirement-panel",
        scene: "maintenance-history",
        action: "Read the Custom maintenance is retired panel.",
        control: {
          label: "Custom maintenance is retired",
          role: "heading",
          availability: "required",
          source: ["app/spaces/[spaceId]/page.tsx"],
          actions: [
            "click-link:Back to Internal Processes",
            "click-link:Maintenance history Retained maintenance knowledge and history Read-only history",
          ],
        },
        route: "/spaces/[spaceId]",
        where: "Maintenance history Space",
        result:
          "The panel says custom maintenance is retired and maintenance is managed in standalone Vendoroo. Existing knowledge and publication records keep their original permissions.",
        effect: "reads",
      },
      {
        id: "read-operational-pages",
        action: "If the Space lists Operational pages, choose one to read it.",
        control: {
          label: "Operational pages",
          role: "complementary",
          availability: "conditional",
          source: ["app/spaces/[spaceId]/page.tsx"],
          actions: [
            "click-link:Back to Internal Processes",
            "click-link:Maintenance history Retained maintenance knowledge and history Read-only history",
          ],
        },
        route: "/spaces/[spaceId]",
        where: "Maintenance history Space, Operational pages",
        result:
          "The retained page opens to read. The list shows only when the Space has published pages.",
        effect: "reads",
      },
      {
        id: "open-vendor-handoff-history",
        action:
          "Choose Back to Internal Processes, then the Vendor handoff history card.",
        control: {
          label: "Vendor handoff history",
          role: "heading",
          availability: "required",
          source: ["lib/spaces.ts"],
        },
        route: "/spaces",
        where: "Internal Processes",
        result:
          "Vendor handoff history opens with the same Custom maintenance is retired panel and its retained knowledge.",
        effect: "reads",
      },
      {
        id: "follow-an-older-link",
        action:
          "Open an older maintenance link or bookmark, for example one to the maintenance history or vendors page.",
        control: {
          label: "Renewals",
          role: "heading",
          availability: "required",
          source: ["components/lease-renewal/RenewalDesk.tsx"],
        },
        route: "/maintenance",
        where: "Any older link to a maintenance page",
        result:
          "The renewal desk in Lease Renewal opens instead. No maintenance page or record opens from these links.",
        effect: "reads",
      },
    ],
    result:
      "You found the retained maintenance history and know that maintenance work is managed in standalone Vendoroo. Nothing was changed.",
    doesNotDo: [
      "The app does not manage maintenance work; manage it in standalone Vendoroo.",
      "Older maintenance links never open a maintenance page; they open Lease Renewal.",
      "Nothing in the retained history is purged, and each retained record keeps its original permissions.",
      "Search does not list retired maintenance or vendor records.",
    ],
    relatedGuides: ["find-your-way", "work-a-renewal"],
    relatedScreens: ["maintenance-history"],
    lastUpdated: "2026-11-04",
    spaces: ["maintenance-work-order-intake", "vendor-assignment-handoff"],
  },
];
