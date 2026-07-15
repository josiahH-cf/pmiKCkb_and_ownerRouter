import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { LEASE_RENEWAL_STAGES } from "@/lib/lease-renewal/constants";
import { LEASE_EXECUTION_ACTIONS } from "@/lib/lease-renewal/execution/matrix";

/**
 * Non-executable Lease Renewal process-definition template. Converts the confirmed
 * target workflow shape in docs/products/lease-renewal-agent.md into the v1 minimum
 * process-definition fields so the team can refine it through the existing Draft ->
 * Testing -> Pending Approval lifecycle with simulation-only test runs.
 *
 * Every action reference is derived from the Action Registry seed catalog, so target
 * systems and rollback notes cannot drift from governed metadata. The template authorizes
 * nothing: the resulting definition starts as Draft, and a globally approved action type
 * still becomes Planned in this renewal workflow until its instance mapping and proof exist.
 */

// One read-authoritative intake plus the complete S25 action graph. The order after the
// read is pinned to LEASE_EXECUTION_ACTIONS so the process surface cannot silently omit a
// required final-V1 action or reintroduce the old manual-only path.
export const LEASE_RENEWAL_ACTION_KEYS = [
  "rentvine.lease.read",
  ...LEASE_EXECUTION_ACTIONS,
] as const;

const STAGE_DESCRIPTIONS: Record<(typeof LEASE_RENEWAL_STAGES)[number], string> = {
  "Candidate detection":
    "Identify due renewals from lease timing (Rentvine is read-authoritative for lease dates, tenant contacts, and property/owner context). Manual start remains allowed.",
  "Owner decision":
    "Gather facts read-only, show source/timestamp/confidence per fact, and prepare exact channel previews plus the approval package. Missing or conflicting authority remains Blocked.",
  "Tenant intake":
    "Capture the tenant-side renewal response and negotiated terms as source-backed facts. Email, portal, and SMS remain separate exact-confirmed actions with separate receipts.",
  "Document package":
    "Create the approved Dotloop renewal loop and upload only the configured document package after the required High-risk approval.",
  "Signature/confirmation":
    "Track source-backed signature and confirmation evidence; exact Dotloop signature lifecycle remains vendor-confirmation-required.",
  "System-of-record update":
    "Write the signed renewal back into Rentvine only through the documented account contract, exact preview, Admin approval, and read-after-write receipt.",
  "Service/charge verification":
    "Verify renewal charges and services against approved sources; record Boom as audited not-applicable or execute the approved High-risk enrollment contract.",
  Closeout:
    "Close only when every applicable action has its own reconciled receipt; a failed channel or ambiguous provider outcome remains visible.",
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
      "Carry a source-backed renewal through exact-confirmed outreach, the approved document package, renewal writeback, and conditional Boom enrollment with every external action individually gated.",
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
      "Every applicable enabled action has a reconciled receipt; communications were exact-confirmed, consequential writes were Admin-approved, and no autonomous, bulk, scheduled, or model-triggered send occurred.",
    stop_condition:
      "A missing or conflicting fact, source, mapping, contract, connection, Registry gate, role scope, confirmation, or approval blocks only the affected action and cannot be approved away.",
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
    // Registry promotion is action-type authority, never blanket authority for a new workflow.
    readiness: entry.production_allowed ? "Planned" : entry.readiness,
    missing_connection_or_permission: entry.required_permissions?.join("; "),
    approval_owner_uid: approverUid,
    rollback_or_correction_note: entry.rollback_note,
    action_registry_key: entry.key,
  };
}
