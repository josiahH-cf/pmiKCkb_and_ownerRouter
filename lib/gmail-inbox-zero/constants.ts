// Gmail Inbox 0 shared vocabulary. Every constant below is confirmed by
// docs/products/gmail-inbox-zero.md; do not extend this vocabulary without a
// product-doc change. This module is metadata only: it defines no Gmail runtime,
// no send path, and no live API integration.

// The first base layer starts with these two labels.
export const GMAIL_INBOX_ZERO_BASE_LABELS = [
  "Waiting on Outside",
  "Waiting on Team",
] as const;

// The target label set adds Dan Decision and Draft Ready.
export const GMAIL_INBOX_ZERO_LABELS = [
  "Waiting on Outside",
  "Waiting on Team",
  "Dan Decision",
  "Draft Ready",
] as const;

// Reversible, opt-in rollout phases: shadow classifies only and applies nothing;
// suggest may auto-label exact matches; drafts adds draft creation (future approved
// spec required before any of this runs against live Gmail).
export const GMAIL_INBOX_ZERO_PHASES = ["Shadow", "Suggest", "Drafts"] as const;

// Rule and reply-pattern lifecycle: Dan's feedback creates Proposed changes, Admin
// approval is required before a rule or pattern becomes active, and Retired entries
// stay in history.
export const GMAIL_RULE_STATUSES = ["Proposed", "Approved", "Retired"] as const;

// Drafting uses stable IDs end to end. Labels are presentation only and aliases are normalized by
// draft-safety.ts at every untrusted/server boundary.
export const GMAIL_DRAFT_CATEGORY_IDS = [
  "vendor",
  "scheduling",
  "general_question",
  "owner_money",
  "legal_notices",
  "tenant_disputes",
] as const;
export type GmailDraftCategoryId = (typeof GMAIL_DRAFT_CATEGORY_IDS)[number];

export const GMAIL_DRAFT_CATEGORIES: readonly {
  id: GmailDraftCategoryId;
  label: string;
  draftAllowed: boolean;
}[] = [
  { id: "vendor", label: "Vendor", draftAllowed: true },
  { id: "scheduling", label: "Scheduling", draftAllowed: true },
  { id: "general_question", label: "General question", draftAllowed: true },
  { id: "owner_money", label: "Owner money", draftAllowed: false },
  { id: "legal_notices", label: "Legal/notices", draftAllowed: false },
  { id: "tenant_disputes", label: "Tenant disputes", draftAllowed: false },
] as const;

export const GMAIL_HARD_EXCLUSION_CATEGORY_IDS = [
  "owner_money",
  "legal_notices",
  "tenant_disputes",
] as const satisfies readonly GmailDraftCategoryId[];

// Display vocabulary retained for rule/admin copy only; no safety decision compares these strings.
export const GMAIL_HARD_EXCLUSION_CATEGORIES = GMAIL_DRAFT_CATEGORIES.filter(
  (category) => !category.draftAllowed,
).map((category) => category.label);
