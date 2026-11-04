// S242 R-S242-3: the whole manual, assembled from the repository content modules in
// table-of-contents order. Pages, print, the gates and the tests all read this one object.
import { ADMIN_GUIDES } from "@/lib/help/content/guides/admin";
import { APPROVAL_QUEUE_AND_NOTIFICATIONS_GUIDES } from "@/lib/help/content/guides/approval-queue-and-notifications";
import { COMMUNICATIONS_GUIDES } from "@/lib/help/content/guides/communications";
import { CONNECTIONS_GUIDES } from "@/lib/help/content/guides/connections";
import { DOCUMENTS_AND_DOTLOOP_GUIDES } from "@/lib/help/content/guides/documents-and-dotloop";
import { HOME_AND_ASK_GUIDES } from "@/lib/help/content/guides/home-and-ask";
import { LEASE_RENEWALS_GUIDES } from "@/lib/help/content/guides/lease-renewals";
import { MAINTENANCE_HISTORY_GUIDES } from "@/lib/help/content/guides/maintenance-history";
import { PROFILE_AND_MY_WORK_GUIDES } from "@/lib/help/content/guides/profile-and-my-work";
import { SEARCH_GUIDES } from "@/lib/help/content/guides/search";
import { SPACES_AND_PROCESSES_GUIDES } from "@/lib/help/content/guides/spaces-and-processes";
import { WORKFLOW_RUNS_GUIDES } from "@/lib/help/content/guides/workflow-runs";
import { HELP_CHANGELOG } from "@/lib/help/content/changelog";
import { HELP_GLOSSARY } from "@/lib/help/content/glossary";
import { ADMIN_SCREENS } from "@/lib/help/content/screens/admin";
import { APPROVAL_QUEUE_AND_NOTIFICATIONS_SCREENS } from "@/lib/help/content/screens/approval-queue-and-notifications";
import { COMMUNICATIONS_SCREENS } from "@/lib/help/content/screens/communications";
import { CONNECTIONS_SCREENS } from "@/lib/help/content/screens/connections";
import { HELP_SCREENS } from "@/lib/help/content/screens/help";
import { HOME_AND_ASK_SCREENS } from "@/lib/help/content/screens/home-and-ask";
import { LEASE_RENEWALS_SCREENS } from "@/lib/help/content/screens/lease-renewals";
import { MAINTENANCE_HISTORY_SCREENS } from "@/lib/help/content/screens/maintenance-history";
import { PROFILE_AND_MY_WORK_SCREENS } from "@/lib/help/content/screens/profile-and-my-work";
import { SEARCH_SCREENS } from "@/lib/help/content/screens/search";
import { SPACES_AND_PROCESSES_SCREENS } from "@/lib/help/content/screens/spaces-and-processes";
import { WORKFLOW_RUNS_SCREENS } from "@/lib/help/content/screens/workflow-runs";
import { HELP_SECTIONS } from "@/lib/help/sections";
import type {
  HelpGuide,
  HelpScreenReference,
  HelpSection,
  HelpSectionId,
} from "@/lib/help/types";

export const HELP_GUIDES: readonly HelpGuide[] = [
  ...HOME_AND_ASK_GUIDES,
  ...LEASE_RENEWALS_GUIDES,
  ...COMMUNICATIONS_GUIDES,
  ...DOCUMENTS_AND_DOTLOOP_GUIDES,
  ...CONNECTIONS_GUIDES,
  ...ADMIN_GUIDES,
  ...SPACES_AND_PROCESSES_GUIDES,
  ...APPROVAL_QUEUE_AND_NOTIFICATIONS_GUIDES,
  ...PROFILE_AND_MY_WORK_GUIDES,
  ...SEARCH_GUIDES,
  ...WORKFLOW_RUNS_GUIDES,
  ...MAINTENANCE_HISTORY_GUIDES,
];

export const HELP_SCREEN_REFERENCES: readonly HelpScreenReference[] = [
  ...HELP_SCREENS,
  ...HOME_AND_ASK_SCREENS,
  ...LEASE_RENEWALS_SCREENS,
  ...COMMUNICATIONS_SCREENS,
  ...CONNECTIONS_SCREENS,
  ...ADMIN_SCREENS,
  ...SPACES_AND_PROCESSES_SCREENS,
  ...APPROVAL_QUEUE_AND_NOTIFICATIONS_SCREENS,
  ...PROFILE_AND_MY_WORK_SCREENS,
  ...SEARCH_SCREENS,
  ...WORKFLOW_RUNS_SCREENS,
  ...MAINTENANCE_HISTORY_SCREENS,
];

export { HELP_CHANGELOG, HELP_GLOSSARY };

export const HELP_MANUAL = {
  sections: HELP_SECTIONS,
  guides: HELP_GUIDES,
  screens: HELP_SCREEN_REFERENCES,
  glossary: HELP_GLOSSARY,
  changelog: HELP_CHANGELOG,
} as const;

export function helpSection(id: string): HelpSection | undefined {
  return HELP_SECTIONS.find((section) => section.id === id);
}

export function guidesInSection(section: HelpSectionId): readonly HelpGuide[] {
  return HELP_GUIDES.filter((guide) => guide.section === section);
}

export function helpGuide(section: string, id: string): HelpGuide | undefined {
  return HELP_GUIDES.find((guide) => guide.section === section && guide.id === id);
}

export function helpGuideById(id: string): HelpGuide | undefined {
  return HELP_GUIDES.find((guide) => guide.id === id);
}

export function helpScreen(id: string): HelpScreenReference | undefined {
  return HELP_SCREEN_REFERENCES.find((screen) => screen.id === id);
}

/** The newest changelog entry; the manual always has one. */
export function currentHelpChange() {
  return HELP_CHANGELOG[0];
}
