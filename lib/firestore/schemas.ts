import { z } from "zod";
import {
  ACTION_EVENT_MODES,
  ACTION_EVIDENCE_STATUSES,
  ACTION_PREVIEW_FIELD_TYPES,
  ACTION_TARGET_SYSTEMS,
  SOURCE_STATES,
} from "@/lib/constants";

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date.");

const timestampStringSchema = z.string().trim().min(1);

const optionalTextSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const requiredTextSchema = z.string().trim().min(1);

export const SopStatusSchema = z.enum([
  "Placeholder",
  "Draft",
  "In Review",
  "Approved",
  "Deprecated",
]);

export const TemplateStatusSchema = z.enum([
  "Draft",
  "In Review",
  "Approved",
  "Deprecated",
]);

export const PlaceholderStatusSchema = z.enum([
  "Open",
  "In Review",
  "Resolved",
  "Deferred",
]);

export const PlaceholderPrioritySchema = z.enum(["P0", "P1", "P2"]);
export const SensitivitySchema = z.enum(["Low", "Medium", "High"]);
export const AudienceSchema = z.enum([
  "Tenant",
  "Owner",
  "Applicant",
  "Vendor",
  "Internal",
  "Unknown",
]);
export const ChannelSchema = z.enum([
  "RentVine",
  "Gmail",
  "LeadSimple",
  "Internal",
  "Phone",
  "Other",
]);
export const ToolIntegrationStatusSchema = z.enum([
  "Link only",
  "Read-only",
  "Draft-only",
  "Blocked",
  "Deferred",
]);
export const SourceApprovalStatusSchema = z.enum([
  "Unreviewed",
  "Transcript-derived",
  "Approved",
  "Deprecated",
]);
export const SourceStateSchema = z.enum(SOURCE_STATES);

export const CreateSopInputSchema = z.object({
  title: requiredTextSchema,
  owner_uid: requiredTextSchema,
  backup_owner_uid: optionalTextSchema,
  status: SopStatusSchema.default("Draft"),
  source_state_hint: SourceStateSchema.default("Open Placeholder"),
  sensitivity: SensitivitySchema.default("Low"),
  body_md: requiredTextSchema,
  last_reviewed_at: timestampStringSchema.optional(),
  note: optionalTextSchema,
});

export const UpdateSopInputSchema = z.object({
  title: requiredTextSchema.optional(),
  owner_uid: requiredTextSchema.optional(),
  backup_owner_uid: optionalTextSchema,
  status: SopStatusSchema.optional(),
  source_state_hint: SourceStateSchema.optional(),
  sensitivity: SensitivitySchema.optional(),
  body_md: requiredTextSchema.optional(),
  last_reviewed_at: timestampStringSchema.optional(),
  note: optionalTextSchema,
});

export const CreateTemplateInputSchema = z.object({
  name: requiredTextSchema,
  audience: AudienceSchema.default("Unknown"),
  channel: ChannelSchema.default("Other"),
  body: requiredTextSchema,
  approved_by_uid: optionalTextSchema,
  last_reviewed_at: timestampStringSchema.optional(),
  status: TemplateStatusSchema.default("Draft"),
  note: optionalTextSchema,
});

export const UpdateTemplateInputSchema = z.object({
  name: requiredTextSchema.optional(),
  audience: AudienceSchema.optional(),
  channel: ChannelSchema.optional(),
  body: requiredTextSchema.optional(),
  approved_by_uid: optionalTextSchema,
  last_reviewed_at: timestampStringSchema.optional(),
  status: TemplateStatusSchema.optional(),
  note: optionalTextSchema,
});

export const CreateToolInputSchema = z.object({
  name: requiredTextSchema,
  url: z.string().trim().url(),
  purpose: requiredTextSchema,
  primary_owner_uid: requiredTextSchema,
  integration_status: ToolIntegrationStatusSchema.default("Link only"),
  sensitivity: SensitivitySchema.default("Low"),
  notes: optionalTextSchema,
  note: optionalTextSchema,
});

export const UpdateToolInputSchema = z.object({
  name: requiredTextSchema.optional(),
  url: z.string().trim().url().optional(),
  purpose: requiredTextSchema.optional(),
  primary_owner_uid: requiredTextSchema.optional(),
  integration_status: ToolIntegrationStatusSchema.optional(),
  sensitivity: SensitivitySchema.optional(),
  notes: optionalTextSchema,
  note: optionalTextSchema,
});

export const CreatePlaceholderInputSchema = z.object({
  related_sop_id: optionalTextSchema,
  missing_detail: requiredTextSchema,
  source_hint: optionalTextSchema,
  owner_uid: requiredTextSchema,
  priority: PlaceholderPrioritySchema.default("P1"),
  due_date: isoDateSchema.optional(),
  status: PlaceholderStatusSchema.default("Open"),
  resolution: optionalTextSchema,
  note: optionalTextSchema,
});

export const UpdatePlaceholderInputSchema = z.object({
  related_sop_id: optionalTextSchema,
  missing_detail: requiredTextSchema.optional(),
  source_hint: optionalTextSchema,
  owner_uid: requiredTextSchema.optional(),
  priority: PlaceholderPrioritySchema.optional(),
  due_date: isoDateSchema.optional(),
  status: PlaceholderStatusSchema.optional(),
  resolution: optionalTextSchema,
  note: optionalTextSchema,
});

export const ChangeLogNoteSchema = z.object({
  note: optionalTextSchema,
});

// Approval Queue v1 (workflow-control layer). See docs/product-definition-gap-plan.md.
export const QueueItemTypeSchema = z.enum([
  "ApprovalPackage",
  "ProcessDefinitionChange",
  "AutomationFailure",
  "ExternalActionReadiness",
  "SourceFactConflict",
]);

export const QueueAudienceGroupSchema = z.enum([
  "Dan/Admin decisions",
  "Team follow-up",
  "Outside waiting",
  "Failed/Blocked automation",
]);

export const QueueTransitionActionSchema = z.enum([
  "approve",
  "return",
  "assign",
  "snooze",
  "disable",
  "close",
]);

export const QueueBulkActionSchema = z.enum([
  "approve",
  "return",
  "assign",
  "snooze",
  "disable",
  "execute",
]);

export const QueueNotificationEventSchema = z.enum([
  "created",
  "assigned",
  "returned_for_revision",
  "unsnoozed",
  "blocked",
  "unblocked",
  "overdue",
  "closed",
]);

export const QueueEmailSettingEventSchema = z.enum([
  "created",
  "assigned",
  "returned_for_revision",
  "unsnoozed",
  "blocked",
  "unblocked",
  "overdue",
  "closed",
  "blocked_overdue_escalation",
]);

export const QueueNotificationRecipientRoleSchema = z.enum([
  "Assignee",
  "Required approver",
  "Creator/editor",
  "Admin selected",
]);

export const ProcessDefinitionStatusSchema = z.enum([
  "Draft",
  "Testing",
  "Pending Approval",
  "Active",
  "Needs Revision",
  "Retired",
]);

export const WorkflowRunStatusSchema = z.enum([
  "Not Started",
  "In Progress",
  "Waiting on Team",
  "Waiting on Outside",
  "Blocked",
  "Ready for Approval",
  "Approved",
  "Completed",
  "Cancelled",
  "Failed",
]);

export const ExternalActionReadinessSchema = z.enum([
  "Planned",
  "Needs Connection",
  "Needs Permission",
  "Ready for Test",
  "Approved for Execution",
  "Disabled",
]);

export const ActionTargetSystemSchema = z.enum(ACTION_TARGET_SYSTEMS);
export const ActionEventModeSchema = z.enum(ACTION_EVENT_MODES);
export const ActionEvidenceStatusSchema = z.enum(ACTION_EVIDENCE_STATUSES);

const actionRegistryKeySchema = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9]+(?:[._][a-z0-9]+)*$/,
    "Expected a lowercase action key like rentvine.work_order.create.",
  );

export const ActionPreviewFieldTypeSchema = z.enum(ACTION_PREVIEW_FIELD_TYPES);

// One descriptor per field an execution preview must show. This is the machine-readable
// companion to `preview_schema_note`: previews must show exactly these fields, so payload
// keys outside the descriptor list are treated as validation errors.
export const PreviewPayloadFieldSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "Expected a snake_case field name."),
  label: requiredTextSchema,
  type: ActionPreviewFieldTypeSchema,
  required: z.boolean().default(false),
  source_system: ActionTargetSystemSchema,
  note: optionalTextSchema,
});

// One record per external action type. `production_allowed` is the production execution
// gate: it may be true only when the action is `Approved for Execution` with `Documented`
// evidence, so an undocumented or vendor-confirmation-required capability can never be
// marked production-eligible by accident.
export const CreateActionRegistryInputSchema = z
  .object({
    key: actionRegistryKeySchema,
    label: requiredTextSchema,
    target_system: ActionTargetSystemSchema,
    expected_action: requiredTextSchema,
    product_lane: optionalTextSchema,
    readiness: ExternalActionReadinessSchema.default("Planned"),
    evidence_status: ActionEvidenceStatusSchema,
    documented_evidence: requiredTextSchema,
    required_permissions: z.array(requiredTextSchema).default([]),
    required_plan: optionalTextSchema,
    event_ingestion_mode: ActionEventModeSchema.default("None"),
    preview_schema_note: requiredTextSchema,
    preview_payload_schema: z.array(PreviewPayloadFieldSchema).optional(),
    test_notes: optionalTextSchema,
    rollback_note: requiredTextSchema,
    connection_health_check_ref: optionalTextSchema,
    production_allowed: z.boolean().default(false),
  })
  .refine(
    (input) =>
      !input.production_allowed ||
      (input.readiness === "Approved for Execution" &&
        input.evidence_status === "Documented"),
    {
      message:
        "production_allowed requires readiness 'Approved for Execution' and 'Documented' evidence.",
      path: ["production_allowed"],
    },
  );

export type CreateActionRegistryInput = z.input<typeof CreateActionRegistryInputSchema>;
export type ParsedActionRegistryInput = z.output<typeof CreateActionRegistryInputSchema>;

const queueProcessRunRefSchema = z.object({
  id: requiredTextSchema,
  label: requiredTextSchema,
});

// Risk is classified deterministically by the repository from these signals, never
// passed in directly, so a caller cannot self-assign a lower risk level.
const queueRiskSignalsSchema = z
  .object({
    external_write: z.boolean().optional(),
    owner_or_tenant_facing: z.boolean().optional(),
    legal_financial_timing: z.boolean().optional(),
    internal_workflow_update: z.boolean().optional(),
    blocking_issue: z.boolean().optional(),
  })
  .optional();

export const CreateApprovalQueueItemInputSchema = z.object({
  process_run_ref: queueProcessRunRefSchema,
  space_id: optionalTextSchema,
  item_type: QueueItemTypeSchema,
  source_trigger_key: requiredTextSchema,
  audience_group: QueueAudienceGroupSchema.optional(),
  assignee_uid: optionalTextSchema,
  required_approver_uid: optionalTextSchema,
  due_date: isoDateSchema.optional(),
  action_needed: requiredTextSchema,
  affected_system_action: optionalTextSchema,
  direct_link: requiredTextSchema,
  risk_signals: queueRiskSignalsSchema,
  note: optionalTextSchema,
});

export const TransitionApprovalQueueItemInputSchema = z.object({
  action: QueueTransitionActionSchema,
  reason: optionalTextSchema,
  snooze_until: isoDateSchema.optional(),
  assignee_uid: optionalTextSchema,
  required_approver_uid: optionalTextSchema,
  confirm_high_risk: z.boolean().optional(),
});

export const BulkApprovalQueueInputSchema = z
  .object({
    action: QueueBulkActionSchema,
    item_ids: z.array(requiredTextSchema).min(1).max(50),
    reason: optionalTextSchema,
    snooze_until: isoDateSchema.optional(),
    assignee_uid: optionalTextSchema,
    required_approver_uid: optionalTextSchema,
    confirm_high_risk: z.boolean().optional(),
  })
  .refine((input) => new Set(input.item_ids).size === input.item_ids.length, {
    message: "Bulk action item IDs must be unique.",
    path: ["item_ids"],
  });

export const UpdateApprovalQueueEmailSettingInputSchema = z.object({
  email_enabled: z.boolean().optional(),
  recipient_roles: z
    .array(QueueNotificationRecipientRoleSchema)
    .min(1, "Select at least one recipient role.")
    .optional(),
  trigger_condition: requiredTextSchema.optional(),
  cooldown_hours: z.number().int().min(0).max(720).optional(),
  subject_preview: requiredTextSchema.optional(),
});

export const UpdateApprovalQueueNotificationInputSchema = z.object({
  action: z.enum(["mark_read"]),
});

const processDefinitionSourceLinkInputSchema = z.object({
  label: requiredTextSchema,
  url: z.string().trim().url(),
});

const processDefinitionStepInputSchema = z.object({
  id: optionalTextSchema,
  title: requiredTextSchema,
  description: optionalTextSchema,
});

const processDefinitionActionReferenceInputSchema = z.object({
  id: optionalTextSchema,
  label: requiredTextSchema,
  target_system: requiredTextSchema,
  expected_action: requiredTextSchema,
  readiness: ExternalActionReadinessSchema.default("Planned"),
  missing_connection_or_permission: optionalTextSchema,
  approval_owner_uid: optionalTextSchema,
  rollback_or_correction_note: optionalTextSchema,
  action_registry_key: optionalTextSchema,
});

export const CreateProcessDefinitionInputSchema = z.object({
  name: requiredTextSchema,
  short_outcome: requiredTextSchema,
  trigger: requiredTextSchema,
  owner_uid: requiredTextSchema,
  default_approver_uid: requiredTextSchema,
  source_links: z.array(processDefinitionSourceLinkInputSchema).default([]),
  required_starting_inputs: z.array(requiredTextSchema).default([]),
  steps: z.array(processDefinitionStepInputSchema).min(1),
  action_references: z.array(processDefinitionActionReferenceInputSchema).default([]),
  success_condition: requiredTextSchema,
  stop_condition: optionalTextSchema,
  escalation_condition: optionalTextSchema,
});

export const UpdateProcessDefinitionInputSchema = z
  .object({
    name: requiredTextSchema.optional(),
    short_outcome: requiredTextSchema.optional(),
    trigger: requiredTextSchema.optional(),
    owner_uid: requiredTextSchema.optional(),
    default_approver_uid: requiredTextSchema.optional(),
    source_links: z.array(processDefinitionSourceLinkInputSchema).optional(),
    required_starting_inputs: z.array(requiredTextSchema).optional(),
    steps: z.array(processDefinitionStepInputSchema).min(1).optional(),
    action_references: z.array(processDefinitionActionReferenceInputSchema).optional(),
    success_condition: requiredTextSchema.optional(),
    stop_condition: optionalTextSchema,
    escalation_condition: optionalTextSchema,
  })
  .refine(
    (input) => Object.keys(input).length > 0,
    "At least one process definition field is required.",
  );

export const SubmitProcessDefinitionInputSchema = z.object({
  note: optionalTextSchema,
});

export const ActivateProcessDefinitionInputSchema = z.object({
  override_reason: optionalTextSchema,
});

export const StartWorkflowTestRunInputSchema = z.object({
  due_date: isoDateSchema.optional(),
  note: optionalTextSchema,
});

export const UpdateWorkflowRunInputSchema = z
  .object({
    action: z.enum(["complete_test", "fail_test"]),
    notes: optionalTextSchema,
  })
  .refine(
    (input) => input.action !== "fail_test" || Boolean(input.notes?.trim()),
    "Failing a test run requires a plain-English reason.",
  );

export type CreateSopInput = z.input<typeof CreateSopInputSchema>;
export type UpdateSopInput = z.input<typeof UpdateSopInputSchema>;
export type CreateTemplateInput = z.input<typeof CreateTemplateInputSchema>;
export type UpdateTemplateInput = z.input<typeof UpdateTemplateInputSchema>;
export type CreateToolInput = z.input<typeof CreateToolInputSchema>;
export type UpdateToolInput = z.input<typeof UpdateToolInputSchema>;
export type CreatePlaceholderInput = z.input<typeof CreatePlaceholderInputSchema>;
export type UpdatePlaceholderInput = z.input<typeof UpdatePlaceholderInputSchema>;
export type CreateApprovalQueueItemInput = z.input<
  typeof CreateApprovalQueueItemInputSchema
>;
export type TransitionApprovalQueueItemInput = z.input<
  typeof TransitionApprovalQueueItemInputSchema
>;
export type ParsedTransitionApprovalQueueItemInput = z.output<
  typeof TransitionApprovalQueueItemInputSchema
>;
export type BulkApprovalQueueInput = z.input<typeof BulkApprovalQueueInputSchema>;
export type ParsedBulkApprovalQueueInput = z.output<typeof BulkApprovalQueueInputSchema>;
export type UpdateApprovalQueueEmailSettingInput = z.input<
  typeof UpdateApprovalQueueEmailSettingInputSchema
>;
export type ParsedUpdateApprovalQueueEmailSettingInput = z.output<
  typeof UpdateApprovalQueueEmailSettingInputSchema
>;
export type UpdateApprovalQueueNotificationInput = z.input<
  typeof UpdateApprovalQueueNotificationInputSchema
>;
export type CreateProcessDefinitionInput = z.input<
  typeof CreateProcessDefinitionInputSchema
>;
export type ParsedCreateProcessDefinitionInput = z.output<
  typeof CreateProcessDefinitionInputSchema
>;
export type UpdateProcessDefinitionInput = z.input<
  typeof UpdateProcessDefinitionInputSchema
>;
export type ParsedUpdateProcessDefinitionInput = z.output<
  typeof UpdateProcessDefinitionInputSchema
>;
export type SubmitProcessDefinitionInput = z.input<
  typeof SubmitProcessDefinitionInputSchema
>;
export type ActivateProcessDefinitionInput = z.input<
  typeof ActivateProcessDefinitionInputSchema
>;
export type StartWorkflowTestRunInput = z.input<typeof StartWorkflowTestRunInputSchema>;
export type UpdateWorkflowRunInput = z.input<typeof UpdateWorkflowRunInputSchema>;
export type ParsedUpdateWorkflowRunInput = z.output<typeof UpdateWorkflowRunInputSchema>;
export type QueueRiskSignals = NonNullable<
  z.input<typeof CreateApprovalQueueItemInputSchema>["risk_signals"]
>;
