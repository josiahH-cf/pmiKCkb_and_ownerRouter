import type { HelpChangelogEntry } from "@/lib/help/types";

/**
 * S242 R-S242-4 / S243 R-S243-3: What changed, newest first. Every help content change adds an
 * entry with a new HELP_VERSION and the content digest it describes (print it with
 * `node lib/help/content-digest.mjs`). The serving commit for the current version is read at
 * runtime from the deploy identity, so the page always names the release that serves it.
 */
export const HELP_CHANGELOG: readonly HelpChangelogEntry[] = [
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
    contentDigest: "a083b8b16c64cb909706c0f845c9de054d4dc2c4cf69e2591fa2241ec9a4bc1c",
  },
];
