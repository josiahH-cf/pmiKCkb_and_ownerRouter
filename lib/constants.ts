export const PRODUCT_NAME = "PMI KC KB";
export const LEASE_RENEWAL_AGENT_NAME = "Lease Renewal Agent";
export const GMAIL_INBOX_ZERO_NAME = "Gmail Inbox 0";
export const OWNER_ROUTER_NAME = "Owner Router";
export const OWNER_ROUTER_REPO_NAME = "pmi-kc-owner-router";
export const OWNER_ROUTER_FOLDER_NAME = "Owner Router - PMI KC Metro";
export const KB_APPROVAL_LABEL = "KB Approval";
export const ALLOWED_HD_DEFAULT = "pmikcmetro.com";

export const DRAFT_BANNER = "Draft — Review before sending";
export const UNVERIFIED_PLACEHOLDER = "Needs Verification: <fact>";

export const SOURCE_STATES = [
  "Verified Source",
  "Partial Source",
  "Bailey Placeholder",
  "Conflict Found",
  "No Reliable Source Found",
] as const;

export const ROLES = ["Editor", "Approver", "Admin"] as const;

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
  "KB Internal",
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
