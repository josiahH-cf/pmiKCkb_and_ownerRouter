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

// Default hard exclusions (discovery question 3 default): these categories are
// label-only and must never be auto-drafted.
export const GMAIL_HARD_EXCLUSION_CATEGORIES = [
  "Owner money",
  "Legal/notices",
  "Tenant disputes",
] as const;
