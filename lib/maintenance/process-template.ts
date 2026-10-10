import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { MAINTENANCE_STAGES } from "@/lib/maintenance/constants";

/**
 * Guidance for newly authored Draft process definitions. Existing definitions/runs remain intact.
 * Action references mirror the current exact registry and grant no execution authority; staff use
 * the owning maintenance controls for current permissions, confirmation, receipts and recovery.
 */

// Reads before writes: read existing work orders, then the gated create + status update.
const MAINTENANCE_ACTION_KEYS = [
  "rentvine.work_order.read",
  "rentvine.work_order.create",
  "rentvine.work_order.update_status",
] as const;

const STAGE_DESCRIPTIONS: Record<(typeof MAINTENANCE_STAGES)[number], string> = {
  "Capture and location":
    "Record the issue once and reconcile its original creation result. Verify the actual property/unit and any applicable event-date lease; absent older facts remain unknown.",
  "Assessment and troubleshooting":
    "Assess the issue and record troubleshooting before spending decisions. Keep approved urgent guidance available without waiting for photos, an estimate or owner approval. A resolved issue may go directly to PMI closeout.",
  "Estimate and owner authority":
    "Record the current scope and explicit estimate basis. Apply actual current standing authority or record the exact owner decision when required. Owner contact is optional; no intake email or approval is invented.",
  "Vendor coordination":
    "Select a verified available primary/backup vendor and review the minimum handoff. Selection, current portal assignment, spending authority and communication delivery remain distinct. A human Send/Schedule requires the current Communications contract and exact activated key.",
  "Work and contributions":
    "Retain attributable vendor quotes, visit proposals, logs and permitted original files with submission review and exact recovery. A submitted invoice or completion report proves neither payment nor final closure.",
  "PMI review and closure":
    "Review work and distinct invoice, cost, markup, owner charge and payment evidence. PMI retains final closure; an explicit reopen appends history to the same case. Provider status remains separate.",
  "History and reports":
    "Retain core facts and reviewed artifacts for monthly/custom-period PDF and CSV reporting. Disclose prospective coverage and unknown historical facts; preserve earlier report snapshots after corrections.",
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
      "Record and assess a maintenance issue, coordinate authorized work when needed, retain vendor and financial evidence, and complete PMI review with durable history and reports.",
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
      "PMI records an assessed resolution or reviews completed authorized work and closes the same case. Exact external writes and human-authorized communications retain their owning contracts and recovery.",
    stop_condition:
      "Missing facts, uncertain location, stale authority or an unresolved original attempt hold only the dependent operation for staff review. Urgent guidance remains available; no duplicate work or unreviewed effect is dispatched.",
    escalation_condition:
      "Show the applicable approved urgency guidance and verified escalation configuration. Missing coverage or contacts need staff routing; no dispatch or response-time promise is inferred.",
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
