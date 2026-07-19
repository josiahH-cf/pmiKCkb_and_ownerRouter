export const PRODUCT_NAME = "PMI KC KB";

// PMI brand lockup strings (source-constrained brand pack: docs/brand_pack/).
// Exact visible wordmark + tagline — preserve lowercase spelling and trailing period.
// These are observed brand facts; PRODUCT_NAME above remains the operational product name.
export const PMI_WORDMARK = "pmi.";
export const PMI_TAGLINE = "the property management people";
// Confirmed brand fact (docs/brand_pack/): the publisher/company name. Text-only; no asset involved.
export const PMI_COMPANY = "Property Management Inc.";

export const LEASE_RENEWAL_AGENT_NAME = "Lease Renewal Agent";
export const WORKFLOW_COMMUNICATIONS_NAME = "Workflow Communications";
export const OWNER_ROUTER_NAME = "Owner Router";
export const OWNER_ROUTER_REPO_NAME = "pmi-kc-owner-router";
export const OWNER_ROUTER_FOLDER_NAME = "Owner Router - PMI KC Metro";
export const KB_APPROVAL_LABEL = "KB Approval";
export const ALLOWED_HD_DEFAULT = "pmikcmetro.com";

export const DRAFT_BANNER = "Draft — Review before sending";
export const UNVERIFIED_PLACEHOLDER = "Needs Verification: <fact>";

// Owner-facing transactional/notice destination (D-1 support). Where owner-INTERNAL transactional
// email is addressed — issue-report tickets (TIX-6) and owner-notice drafts — when a real send path
// is later activated. Admin-editable in-app and seeded to this address to start (owner ruling
// 2026-07-18). This is an internal owner address, NOT a tenant/owner-of-record recipient: those still
// require verified source refs through the governed executor, never a free-form admin field.
export const DEFAULT_OWNER_TRANSACTIONAL_EMAIL = "josiah@pmikcmetro.com";

export const SOURCE_STATES = [
  "Verified Source",
  "Partial Source",
  "Open Placeholder",
  "Conflict Found",
  "No Reliable Source Found",
] as const;

export const ROLES = ["Editor", "Approver", "Admin"] as const;

export const SPACE_SCOPES = Object.freeze(["renewals", "maintenance"] as const);

export type SpaceScope = (typeof SPACE_SCOPES)[number];

export const SPACE_SCOPE_HOME = Object.freeze({
  renewals: "/lease-renewal",
  maintenance: "/maintenance",
} as const satisfies Readonly<Record<SpaceScope, string>>);

// Action Registry vocabulary. One record per external action type catalogs the verified
// integration roles in docs/integration-architecture.md. These are metadata only; nothing
// here authorizes an external write.
export const ACTION_TARGET_SYSTEMS = [
  "Rentvine",
  "LeadSimple",
  "Dotloop",
  "QuickBooks",
  "Boom",
  "Google Sheets",
  "Google Drive",
  "Gmail",
  "SMS",
  "KB Internal",
] as const;

// Field types for structured execution-preview payload schemas. Each Action Registry
// entry may describe the exact fields a preview must show before an action could ever be
// approved for execution; "reference" points at an existing external record (ids), and
// "enum" constrains the value to a fixed list named in the field note.
export const ACTION_PREVIEW_FIELD_TYPES = [
  "string",
  "number",
  "boolean",
  "date",
  "enum",
  "reference",
] as const;

export const ACTION_EVENT_MODES = [
  "Webhook",
  "Polling",
  "LeadSimple Sync",
  "Apps Script",
  "Manual",
  "None",
] as const;

export const ACTION_EVIDENCE_STATUSES = [
  "Documented",
  "Vendor-Confirmation-Required",
  "Undocumented",
] as const;
