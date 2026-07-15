import { z } from "zod";

import type { CommunicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";

export const WORKFLOW_COMMUNICATION_LANES = ["renewals", "maintenance"] as const;
export type WorkflowCommunicationLane = (typeof WORKFLOW_COMMUNICATION_LANES)[number];

export const WORKFLOW_COMMUNICATION_ENTITY_TYPES = [
  "workflow_run",
  "renewal_run",
  "maintenance_ticket",
] as const;
export type WorkflowCommunicationEntityType =
  (typeof WORKFLOW_COMMUNICATION_ENTITY_TYPES)[number];

export const WORKFLOW_COMMUNICATION_PURPOSES = [
  "renewal_owner",
  "renewal_tenant",
  "maintenance_owner",
] as const;
export type WorkflowCommunicationPurpose =
  (typeof WORKFLOW_COMMUNICATION_PURPOSES)[number];

const SafeReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value));

/**
 * Browser-supplied workflow context is an untrusted reference, never authorization. Routes parse this
 * shape, then independently load the referenced KB entity and enforce the actor's space capability
 * before constructing a Gmail client.
 */
export const WorkflowCommunicationContextSchema = z
  .object({
    lane: z.enum(WORKFLOW_COMMUNICATION_LANES),
    entityType: z.enum(WORKFLOW_COMMUNICATION_ENTITY_TYPES),
    entityId: SafeReferenceSchema,
    purpose: z.enum(WORKFLOW_COMMUNICATION_PURPOSES),
    actionKey: SafeReferenceSchema,
    sourceRefs: z.array(SafeReferenceSchema).max(20).default([]),
    templateRef: SafeReferenceSchema.optional(),
    replyPolicyRef: SafeReferenceSchema.optional(),
  })
  .strict()
  .superRefine((context, issue) => {
    const renewalEntity =
      context.entityType === "workflow_run" || context.entityType === "renewal_run";
    const renewalPurpose = context.purpose.startsWith("renewal_");
    if (context.lane === "renewals" && (!renewalEntity || !renewalPurpose)) {
      issue.addIssue({
        code: "custom",
        message:
          "Renewal Gmail context must reference a renewal workflow entity and purpose.",
      });
    }
    if (
      context.lane === "maintenance" &&
      (context.entityType !== "maintenance_ticket" ||
        context.purpose !== "maintenance_owner")
    ) {
      issue.addIssue({
        code: "custom",
        message:
          "Maintenance Gmail context must reference a maintenance ticket owner communication.",
      });
    }
  });

export type WorkflowCommunicationContext = z.output<
  typeof WorkflowCommunicationContextSchema
>;

export const WORKFLOW_COMMUNICATION_STATUSES = [
  "linked",
  "draft_created",
  "sent",
  "attention_required",
] as const;
export type WorkflowCommunicationStatus =
  (typeof WORKFLOW_COMMUNICATION_STATUSES)[number];

/** Bodyless, client-safe projection. It intentionally contains no mailbox address or message text. */
export interface WorkflowCommunicationLink extends CommunicationsRetentionFields {
  id: string;
  actor_uid: string;
  mailbox_key: string;
  lane: WorkflowCommunicationLane;
  entity_type: WorkflowCommunicationEntityType;
  entity_id: string;
  purpose: WorkflowCommunicationPurpose;
  origin_action_key: string;
  source_refs: string[];
  /** SHA-256 only; the human-entered reason text is never retained. */
  reason_hash?: string;
  template_ref?: string;
  reply_policy_ref?: string;
  draft_id?: string;
  gmail_message_id?: string;
  gmail_thread_id?: string;
  status: WorkflowCommunicationStatus;
  last_message_id?: string;
  attention_at_ms?: number;
  read_at_ms?: number;
  created_at_ms: number;
  updated_at_ms: number;
  expires_at_ms: number | null;
}

export interface WorkflowCommunicationNotification {
  id: string;
  lane: WorkflowCommunicationLane;
  entity_id: string;
  title: string;
  message: string;
  href: string;
  created_at: string;
  read_at?: string;
}

export function workflowEntityKey(
  context: Pick<
    WorkflowCommunicationContext,
    "lane" | "entityType" | "entityId" | "purpose"
  >,
): string {
  return [context.lane, context.entityType, context.entityId, context.purpose]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

export function workflowActionContextKey(context: WorkflowCommunicationContext): string {
  return [
    workflowEntityKey(context),
    context.actionKey,
    context.templateRef ?? "",
    context.replyPolicyRef ?? "",
    [...new Set(context.sourceRefs)].sort().join("\u0001"),
  ]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

export function workflowEntityHref(
  input: Pick<WorkflowCommunicationLink, "entity_type" | "entity_id">,
): string {
  switch (input.entity_type) {
    case "maintenance_ticket":
      return `/maintenance?ticket_id=${encodeURIComponent(input.entity_id)}`;
    case "renewal_run":
      return `/lease-renewal/runs/${encodeURIComponent(input.entity_id)}`;
    case "workflow_run":
      return `/workflow-runs/${encodeURIComponent(input.entity_id)}`;
  }
}

export function linkMatchesContext(
  link: WorkflowCommunicationLink,
  context: WorkflowCommunicationContext,
): boolean {
  return (
    link.lane === context.lane &&
    link.entity_type === context.entityType &&
    link.entity_id === context.entityId &&
    link.purpose === context.purpose
  );
}
