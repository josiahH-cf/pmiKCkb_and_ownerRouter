// Lease Renewal Agent shared vocabulary. Every constant below is confirmed by
// docs/products/lease-renewal-agent.md; do not extend this vocabulary without a
// product-doc change. This module is metadata only: it defines no runtime trigger,
// queue, agent, or API integration.

// Imported fact confidence display states.
export const RENEWAL_FACT_CONFIDENCE = [
  "Verified",
  "Likely",
  "Needs Review",
  "Conflict",
] as const;

// The verified multi-step stage model for a renewal run.
export const LEASE_RENEWAL_STAGES = [
  "Candidate detection",
  "Owner decision",
  "Tenant intake",
  "Document package",
  "Signature/confirmation",
  "System-of-record update",
  "Service/charge verification",
  "Closeout",
] as const;

// Initial planned read/gather facts (reads come before writes).
export const LEASE_RENEWAL_PLANNED_READS = [
  "Signed lease and lease dates",
  "Tenant and property facts",
  "Owner information",
  "Current rent and terms",
  "Renewal timeline",
] as const;

// Initial planned outputs of the read/gather flow.
export const LEASE_RENEWAL_PLANNED_OUTPUTS = [
  "Workflow summary",
  "Owner communication draft",
  "Internal update preview",
  "Approval package",
] as const;
