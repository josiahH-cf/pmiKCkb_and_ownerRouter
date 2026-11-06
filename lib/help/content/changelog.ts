import type { HelpChangelogEntry } from "@/lib/help/types";

/**
 * S242 R-S242-4 / S243 R-S243-3: What changed, newest first. Every help content change adds an
 * entry with a new HELP_VERSION and the content digest it describes (print it with
 * `node lib/help/content-digest.mjs`). The serving commit for the current version is read at
 * runtime from the deploy identity, so the page always names the release that serves it.
 */
export const HELP_CHANGELOG: readonly HelpChangelogEntry[] = [
  {
    version: "V2.0",
    date: "2026-11-06",
    summary:
      "V2.0, the renewal process now starts on the working batch and works each lease in Guided view: the desk opens on This batch, a lease opens in the same tab on its Renewal path with one Now card, a prepared lease's kickoff is Review and send and Send this message, the standing agreement and housing assistance paths are covered, All leases and filters keeps the worklist table, and the packet inputs and charge policy steps name the Owner acknowledgment and the pet processing fee",
    affectedGuides: [
      "work-a-renewal",
      "compare-rent",
      "owner-message",
      "tenant-offer",
      "update-sources",
      "prepare-documents",
      "admin-tasks",
    ],
    contentDigest: "0000000000000000000000000000000000000000000000000000000000000000",
  },
  {
    version: "V1.1",
    date: "2026-11-04",
    summary:
      "V1.1, three guide results now match the app: the Completion checks card, the connection card after a live check and a snoozed queue item",
    affectedGuides: ["prepare-documents", "manage-connections", "approve-or-deny"],
    contentDigest: "a77ea88054d52bdade8d4c1f573934025e0de03f12fbee6acfedde6bb0641bfb",
  },
  {
    version: "V1.0",
    date: "2026-11-04",
    summary: "V1.0, first release of the staff help hub",
    affectedGuides: [
      "find-your-way",
      "work-a-renewal",
      "compare-rent",
      "tenant-offer",
      "update-sources",
      "owner-message",
      "prepare-documents",
      "manage-connections",
      "admin-tasks",
      "publish-a-process",
      "approve-or-deny",
      "notifications",
      "my-work-and-profile",
      "search",
      "outreach-checklist",
      "maintenance-history",
    ],
    contentDigest: "c46cbfc54efacac936b74b05b2b170fad72a73047313cd76bdf43745f2a1d21c",
  },
];
