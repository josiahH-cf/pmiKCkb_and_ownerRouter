// Lease Renewal Agent shared vocabulary. This module is metadata only: it defines no runtime
// trigger, queue, agent, or API integration.

import { RENEWAL_PROCESS_DEFINITION } from "@/lib/lease-renewal/renewal-process";

// Imported fact confidence display states.
export const RENEWAL_FACT_CONFIDENCE = [
  "Verified",
  "Likely",
  "Needs Review",
  "Conflict",
] as const;

// S72: the one approved six-step model. Titles derive from the immutable renewal-v1 definition so
// the generic process-definition surface and the canonical workspace cannot drift.
export const LEASE_RENEWAL_STAGES = Object.freeze(
  RENEWAL_PROCESS_DEFINITION.steps.map((step) => step.title),
);

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
