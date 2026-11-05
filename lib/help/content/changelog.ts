import type { HelpChangelogEntry } from "@/lib/help/types";

/**
 * S242 R-S242-4 / S243 R-S243-3: What changed, newest first. Every help content change adds an
 * entry with a new HELP_VERSION and the content digest it describes (print it with
 * `node lib/help/content-digest.mjs`). The serving commit for the current version is read at
 * runtime from the deploy identity, so the page always names the release that serves it.
 */
export const HELP_CHANGELOG: readonly HelpChangelogEntry[] = [
  {
    version: "V1.1",
    date: "2026-11-04",
    summary:
      "V1.1, the Manage Connections guide says what the card shows after a live check passes or does not pass",
    affectedGuides: ["manage-connections"],
    contentDigest: "26f721848804b337cc93b9fc4aedf359715549db70c2c0596b05657fd726f9a4",
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
