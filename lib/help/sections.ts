import type { HelpSection } from "@/lib/help/types";

/**
 * S242 R-S242-2: the manual's areas in reading order. The sidebar lists Start here (the Help
 * landing page), these areas with their guides, then Reference, Glossary and What changed. Changing this order changes the
 * table of contents, the whole-manual print and the litmus check L03.
 */
export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: "home-and-ask",
    title: "Home and Ask",
    summary:
      "Sign in, find your way around the app, ask about a property or process and see the work waiting on you.",
  },
  {
    id: "lease-renewals",
    title: "Lease renewals",
    summary:
      "Work a renewal from the desk, prepare it as a teammate and review it as the lead, compare rent, prepare the tenant offer and update RentVine and the operating Sheet.",
  },
  {
    id: "communications",
    title: "Communications",
    summary:
      "Prepare, send or schedule owner and tenant messages and record the answers they bring back.",
  },
  {
    id: "documents-and-dotloop",
    title: "Documents and Dotloop",
    summary:
      "Check packet readiness, prepare documents, hand off to Dotloop and record returned documents and signatures.",
  },
  {
    id: "connections",
    title: "Connections",
    summary:
      "Check the mailbox, Dotloop and RentVine connections and the shared resource links.",
  },
  {
    id: "admin",
    title: "Admin",
    summary:
      "People and access, notice timing basis, family use, packet policy, operational pages, re-index handoff, presentation and team work.",
  },
  {
    id: "spaces-and-processes",
    title: "Spaces and processes",
    summary:
      "Open a Space, read a renewal process as guidance and publish a process definition.",
  },
  {
    id: "approval-queue-and-notifications",
    title: "Approval Queue and Notifications",
    summary: "Approve or deny waiting requests and act on your notifications.",
  },
  {
    id: "profile-and-my-work",
    title: "Profile and My Work",
    summary: "Track your assigned work and keep your business profile current.",
  },
  {
    id: "search",
    title: "Search",
    summary: "Find a lease, property, owner or tenant from anywhere in the app.",
  },
  {
    id: "workflow-runs",
    title: "Workflow runs",
    summary:
      "Read how renewal work is done on the renewal Spaces, open the Renewal Desk and read an earlier run as a record.",
  },
  {
    id: "maintenance-history",
    title: "Maintenance history",
    summary: "Read the retained maintenance records the app keeps as history.",
  },
];

export const HELP_SECTION_IDS = HELP_SECTIONS.map((section) => section.id);
