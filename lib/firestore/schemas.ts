import { z } from "zod";
import { SOURCE_STATES } from "@/lib/constants";

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
  source_state_hint: SourceStateSchema.default("Bailey Placeholder"),
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
});

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
export type QueueRiskSignals = NonNullable<
  z.input<typeof CreateApprovalQueueItemInputSchema>["risk_signals"]
>;
