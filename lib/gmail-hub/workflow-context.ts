import { z } from "zod";

import type { CommunicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";
import {
  EXPLICIT_DEFAULT_DESK_VIEW,
  RENEWAL_DESK_ROUTE,
  leaseWorkspaceHrefOrNull,
} from "@/lib/lease-renewal/desk-view-continuation";

export const WORKFLOW_COMMUNICATION_LANES = ["renewals", "maintenance"] as const;
export type WorkflowCommunicationLane = (typeof WORKFLOW_COMMUNICATION_LANES)[number];

export const WORKFLOW_COMMUNICATION_ENTITY_TYPES = [
  "workflow_run",
  "renewal_run",
  "renewal_lease",
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
    replyTo: z
      .object({
        sequenceId: z.string().uuid(),
        threadId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
        senderEmail: z
          .string()
          .email()
          .max(254)
          .refine((v) => v.endsWith("@pmikcmetro.com")),
        parentId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((context, issue) => {
    if (context.replyTo && context.actionKey !== "gmail.thread.reply")
      issue.addIssue({
        code: "custom",
        message:
          "A workflow reply requires one exact linked original thread and message.",
      });
    const renewalEntity =
      context.entityType === "workflow_run" ||
      context.entityType === "renewal_run" ||
      context.entityType === "renewal_lease";
    const renewalPurpose = context.purpose.startsWith("renewal_");
    if (context.lane === "renewals" && (!renewalEntity || !renewalPurpose)) {
      issue.addIssue({
        code: "custom",
        message:
          "Renewal Gmail context must reference a renewal workflow entity and purpose.",
      });
    }
    if (
      context.entityType === "renewal_lease" &&
      !["gmail.mailbox.read", "gmail.renewal_notice.send", "gmail.thread.reply"].includes(
        context.actionKey,
      )
    ) {
      issue.addIssue({
        code: "custom",
        message:
          "Renewal lease Gmail context supports bounded reads and the reviewed renewal Send/Schedule operation only.",
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

export const WORKFLOW_COMMUNICATION_WAITING_ON = [
  "team",
  "owner",
  "resident",
  "vendor",
  "outside",
  "none",
] as const;
export type WorkflowCommunicationWaitingOn =
  (typeof WORKFLOW_COMMUNICATION_WAITING_ON)[number];

/** Bodyless, client-safe projection. It intentionally contains no mailbox address or message text. */
export interface WorkflowCommunicationLink extends CommunicationsRetentionFields {
  id: string;
  actor_uid: string;
  /** Current sequence owner; absent on historical links, which retain their original meaning. */
  sequence_id?: string;
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
  /** Derived only from the newest provider-backed Gmail message, never from model output. */
  waiting_on?: WorkflowCommunicationWaitingOn;
  last_contact_at_ms?: number;
  last_contact_source?: "gmail_thread";
  last_contact_message_id?: string;
  /** Whether the exact linked thread was readable at the most recent targeted observation. */
  contact_observation_state?: "current" | "needs_verification";
  /** Bodyless bounded reason; provider error text is never stored. */
  contact_observation_reason?: "thread_unavailable" | "thread_unreadable";
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
    case "renewal_lease":
      // S166: the one real-id workspace link. A record whose id is not a lease id opens the
      // Renewals desk rather than a made-up lease path.
      return (
        leaseWorkspaceHrefOrNull(input.entity_id) ??
        `${RENEWAL_DESK_ROUTE}?${EXPLICIT_DEFAULT_DESK_VIEW}`
      );
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

/** Canonical operating destination; legacy links keep their exact workflow without gaining authority. */
export function workflowCommunicationHref(
  input: Pick<
    WorkflowCommunicationLink,
    "entity_type" | "entity_id" | "purpose" | "sequence_id"
  >,
) {
  if (
    input.sequence_id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.sequence_id,
    )
  )
    return `/gmail-hub?communication=${encodeURIComponent(input.sequence_id)}`;
  return `/gmail-hub?${new URLSearchParams({ workflow: input.entity_type, record: input.entity_id, purpose: input.purpose })}`;
}
