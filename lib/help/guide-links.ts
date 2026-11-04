// S244 R-S244-3: every renewal About panel and every InfoTip ends with "Open the guide", linking
// to the help hub step that shows the control in its process. The S242 coverage gate and the S244
// tests read this typed table: every About id and InfoTip has a target, and every target exists in
// the hub content. The table holds only ids, so the client bundle does not carry the manual.
import type { SectionHelpId } from "@/lib/lease-renewal/section-help";
import { HELP_HUB_ROUTE_PRESENT, helpGuideHref } from "@/lib/help/links";
import type { HelpSectionId } from "@/lib/help/types";

export interface HelpGuideLinkTarget {
  readonly section: HelpSectionId;
  readonly guide: string;
  readonly step: string;
  /** Named in the plain-text fallback when the hub route is absent. */
  readonly title: string;
}

export const HELP_INFOTIP_IDS = [
  "approve-availability",
  "deny-availability",
  "publication-checks",
  "environment-badge",
] as const;

export type HelpInfoTipId = (typeof HELP_INFOTIP_IDS)[number];

const WORK = {
  section: "lease-renewals",
  guide: "work-a-renewal",
  title: "Work a renewal from the desk to a recorded outcome",
} as const;
const COMPARE = {
  section: "lease-renewals",
  guide: "compare-rent",
  title: "Compare rent and record market evidence",
} as const;
const TENANT = {
  section: "lease-renewals",
  guide: "tenant-offer",
  title: "Prepare the tenant offer and record the response",
} as const;
const SOURCES = {
  section: "lease-renewals",
  guide: "update-sources",
  title: "Update RentVine and the operating Sheet",
} as const;
const OWNER = {
  section: "communications",
  guide: "owner-message",
  title: "Prepare, send or schedule an owner message and record the answer",
} as const;
const DOCUMENTS = {
  section: "documents-and-dotloop",
  guide: "prepare-documents",
  title: "Prepare documents and hand off to Dotloop",
} as const;

export const ABOUT_GUIDE_LINKS: Readonly<Record<SectionHelpId, HelpGuideLinkTarget>> = {
  "section-lease-details": { ...WORK, step: "read-lease-details" },
  "lease-term": { ...WORK, step: "record-lease-term" },
  "data-check": { ...WORK, step: "compare-sources" },
  "renewal-cycle": { ...WORK, step: "record-renewal-work" },
  "staff-completion": { ...WORK, step: "record-staff-completion" },
  "rent-and-charges": { ...SOURCES, step: "enter-working-rent" },
  "correct-a-fact": { ...SOURCES, step: "correct-a-fact" },
  "future-rent": { ...SOURCES, step: "prepare-renewal-rent" },
  "sheet-updates": { ...SOURCES, step: "apply-sheet-update" },
  "rentvine-updates": { ...SOURCES, step: "apply-rentvine-update" },
  "source-updates": { ...SOURCES, step: "offered-source-updates" },
  "section-comps": { ...COMPARE, step: "open-market-comparison" },
  "market-evidence": { ...COMPARE, step: "run-one-lookup" },
  "working-terms": { ...COMPARE, step: "enter-working-terms" },
  "section-owner": { ...OWNER, step: "open-owner-approval" },
  "message-preparation-owner": { ...OWNER, step: "prepare-owner-message" },
  "owner-decision": { ...OWNER, step: "read-owner-decision" },
  "staff-work-owner": { ...OWNER, step: "record-owner-outreach" },
  "owner-response": { ...OWNER, step: "record-owner-answer" },
  "waiting-follow-up": { ...OWNER, step: "watch-follow-up" },
  "section-tenant": { ...TENANT, step: "open-tenant-section" },
  "message-preparation-tenant": { ...TENANT, step: "prepare-tenant-message" },
  "tenant-offer": { ...TENANT, step: "review-tenant-drafts" },
  "renewal-notice-draft": { ...TENANT, step: "open-renewal-notice" },
  "staff-work-tenant": { ...TENANT, step: "record-tenant-delivery" },
  "tenant-response": { ...TENANT, step: "record-tenant-response" },
  "notice-timing": { ...TENANT, step: "read-notice-timing" },
  "section-documents": { ...DOCUMENTS, step: "open-documents" },
  "document-preparation": { ...DOCUMENTS, step: "read-document-preparation" },
  "packet-truth": { ...DOCUMENTS, step: "evaluate-packet" },
  "resource-links": { ...DOCUMENTS, step: "check-resource-links" },
  "document-handoff": { ...DOCUMENTS, step: "reload-readiness" },
  "staff-work-documents": { ...DOCUMENTS, step: "record-documents-and-signatures" },
  "completion-checks": { ...DOCUMENTS, step: "read-completion-checks" },
};

export const INFOTIP_GUIDE_LINKS: Readonly<Record<HelpInfoTipId, HelpGuideLinkTarget>> = {
  "approve-availability": {
    section: "approval-queue-and-notifications",
    guide: "approve-or-deny",
    step: "approve",
    title: "Approve or deny in the Approval Queue",
  },
  "deny-availability": {
    section: "approval-queue-and-notifications",
    guide: "approve-or-deny",
    step: "deny",
    title: "Approve or deny in the Approval Queue",
  },
  "publication-checks": {
    section: "spaces-and-processes",
    guide: "publish-a-process",
    step: "publish-version",
    title: "Publish a process definition",
  },
  "environment-badge": {
    section: "home-and-ask",
    guide: "find-your-way",
    step: "read-environment-badge",
    title: "Sign in and find your way around",
  },
};

export type HelpGuideLinkId =
  | { readonly about: SectionHelpId }
  | { readonly infotip: HelpInfoTipId };

export function helpGuideLinkTarget(id: HelpGuideLinkId): HelpGuideLinkTarget {
  return "about" in id ? ABOUT_GUIDE_LINKS[id.about] : INFOTIP_GUIDE_LINKS[id.infotip];
}

/** The deep link, or null when this build has no help hub route (plain-text fallback). */
export function helpGuideLinkHref(
  id: HelpGuideLinkId,
  hubAvailable: boolean = HELP_HUB_ROUTE_PRESENT,
): string | null {
  if (!hubAvailable) return null;
  const target = helpGuideLinkTarget(id);
  return helpGuideHref(target.section, target.guide, target.step);
}
