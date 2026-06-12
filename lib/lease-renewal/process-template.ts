import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { LEASE_RENEWAL_STAGES } from "@/lib/lease-renewal/constants";

/**
 * Non-executable Lease Renewal process-definition template. Converts the confirmed
 * target workflow shape in docs/products/lease-renewal-agent.md into the v1 minimum
 * process-definition fields so the team can refine it through the existing Draft ->
 * Testing -> Pending Approval lifecycle with simulation-only test runs.
 *
 * Every action reference is derived from the Action Registry seed catalog, so target
 * systems, readiness, and rollback notes cannot drift from the governed metadata. The
 * template authorizes nothing: the resulting definition starts as Draft, its references
 * stay pending future automation, and the Rentvine renewal writeback remains gated as
 * undocumented.
 */

// The renewal chain's registry actions: reads before writes, orchestration, candidate
// document package, optional resident enrollment, and the gated writeback.
const LEASE_RENEWAL_ACTION_KEYS = [
  "rentvine.lease.read",
  "leadsimple.process.update_stage",
  "dotloop.loop.create_from_template",
  "dotloop.document.upload",
  "boom.resident.enroll",
  "rentvine.lease.renewal_writeback",
] as const;

const STAGE_DESCRIPTIONS: Record<(typeof LEASE_RENEWAL_STAGES)[number], string> = {
  "Candidate detection":
    "Identify due renewals from lease timing (Rentvine is read-authoritative for lease dates, tenant contacts, and property/owner context). Manual start remains allowed.",
  "Owner decision":
    "Gather facts read-only, show source/timestamp/confidence per fact, and prepare the workflow summary, owner communication draft, internal update preview, and approval package for Dan's review.",
  "Tenant intake":
    "Capture the tenant-side renewal response and any negotiated terms as source-backed facts.",
  "Document package":
    "Prepare the renewal document package (Dotloop is the candidate document-package/signing layer).",
  "Signature/confirmation":
    "Track signature and confirmation state; exact Dotloop signature lifecycle is vendor-confirmation-required.",
  "System-of-record update":
    "Write the renewal back into Rentvine. Pending future automation: non-executable until the endpoint is vendor-confirmed and an approved per-action spec, tests, and rollback exist.",
  "Service/charge verification":
    "Verify renewal charges and services against approved sources; optional Boom resident enrollment happens here.",
  Closeout:
    "Close the run with the approved package history, backlinks, and audit detail preserved.",
};

export interface LeaseRenewalTemplateOptions {
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
}

export function buildLeaseRenewalProcessTemplate(
  options: LeaseRenewalTemplateOptions,
): CreateProcessDefinitionInput {
  return {
    name: "Lease Renewal",
    short_outcome:
      "Prepare a source-backed renewal review package and owner communication draft for Dan's approval; a human sends the approved communication.",
    trigger:
      "Manual start by a team member; the system anticipates due renewals from lease timing and reminds the team.",
    owner_uid: options.ownerUid,
    default_approver_uid: options.approverUid,
    source_links: options.sourceLinks ?? [],
    required_starting_inputs: [
      "Renewal candidate: property/unit and tenant",
      "Signed lease or lease-term reference (storage system TBD with client)",
    ],
    steps: LEASE_RENEWAL_STAGES.map((stage) => ({
      title: stage,
      description: STAGE_DESCRIPTIONS[stage],
    })),
    action_references: LEASE_RENEWAL_ACTION_KEYS.map((key) =>
      actionReferenceFromSeed(key, options.approverUid),
    ),
    success_condition:
      "Dan approves the approval package and the facts used by it; the approved owner communication is sent by a human; internal updates execute only through individually approved actions.",
    stop_condition:
      "Conflicting or missing facts block the run until a human resolves them; no external write or send occurs without per-action approval.",
    escalation_condition:
      "Blocked or overdue items route to Dan/Josiah Admin triage through the Approval Queue.",
  };
}

function actionReferenceFromSeed(key: string, approverUid: string) {
  const entry = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === key);

  if (!entry) {
    throw new Error(`Action Registry seed entry ${key} is missing.`);
  }

  return {
    label: entry.label,
    target_system: entry.target_system,
    expected_action: entry.expected_action,
    readiness: entry.readiness,
    missing_connection_or_permission: entry.required_permissions?.join("; "),
    approval_owner_uid: approverUid,
    rollback_or_correction_note: entry.rollback_note,
    action_registry_key: entry.key,
  };
}
