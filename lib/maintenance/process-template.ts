import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { MAINTENANCE_STAGES } from "@/lib/maintenance/constants";

/**
 * Non-executable Maintenance Work Order Intake process-definition template (S4). Mirrors the lease-renewal
 * template: the resulting definition starts as Draft, every action reference is derived from the governed
 * Action Registry seed (so target systems, readiness, and rollback notes cannot drift), and the RentVine
 * work-order writes stay gated (production_allowed:false) until an approved per-action spec exists.
 */

// Reads before writes: read existing work orders, then the gated create + status update.
const MAINTENANCE_ACTION_KEYS = [
  "rentvine.work_order.read",
  "rentvine.work_order.create",
  "rentvine.work_order.update_status",
] as const;

const STAGE_DESCRIPTIONS: Record<(typeof MAINTENANCE_STAGES)[number], string> = {
  Capture:
    "A field worker reports the issue from the field — photo(s) plus a typed or spoken note — authenticated with the PMI account.",
  "Location match":
    "Match the reported location to a RentVine unit (read-only); low-confidence matches route to a human.",
  "Work-order draft":
    "Assemble the structured work-order draft (summary, description, priority, unit, photos) for review.",
  "Owner notice":
    "Prepare an owner-facing notice draft; a human sends the approved notice (no autonomous send).",
  "Vendor assignment": "Optional vendor/trade handoff preview against approved sources.",
  "System-of-record update":
    "Create the work order in RentVine. Pending future automation: non-executable until the endpoint has an approved per-action spec, tests, and rollback.",
  Closeout:
    "Close the run with the approved package history, backlinks, and audit detail preserved.",
};

export interface MaintenanceTemplateOptions {
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
}

export function buildMaintenanceProcessTemplate(
  options: MaintenanceTemplateOptions,
): CreateProcessDefinitionInput {
  return {
    name: "Maintenance Work Order Intake",
    short_outcome:
      "Turn a field maintenance report (photo + voice/typed note) into a reviewed, source-backed work-order draft; a human approves before any RentVine write.",
    trigger:
      "Manual start by a field worker or team member capturing a maintenance issue.",
    owner_uid: options.ownerUid,
    default_approver_uid: options.approverUid,
    source_links: options.sourceLinks ?? [],
    required_starting_inputs: [
      "Reporter (PMI account)",
      "Location or unit reference",
      "Issue description (typed or voice) and/or photo",
    ],
    steps: MAINTENANCE_STAGES.map((stage) => ({
      title: stage,
      description: STAGE_DESCRIPTIONS[stage],
    })),
    action_references: MAINTENANCE_ACTION_KEYS.map((key) =>
      actionReferenceFromSeed(key, options.approverUid),
    ),
    success_condition:
      "A reviewer approves the work-order draft and the facts used by it; external writes/sends execute only through individually approved actions.",
    stop_condition:
      "A missing description, an unmatched or low-confidence unit, or a conflict blocks the run until a human resolves it; no external write or send occurs without per-action approval.",
    escalation_condition:
      "Emergency-priority or blocked items route to Dan/Josiah Admin triage through the Approval Queue.",
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
