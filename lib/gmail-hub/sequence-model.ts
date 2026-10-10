import { renderInlineMessageParagraph } from "@/lib/email/inline-runs";
import { z } from "zod";
import type { CommunicationSchedule } from "./schedule-calendar";
import {
  WorkflowCommunicationContextSchema,
  type WorkflowCommunicationContext,
} from "./workflow-context";

const header = z
  .string()
  .trim()
  .min(1)
  .max(998)
  .refine((s) => !/[\r\n\x00-\x1f\x7f]/.test(s));
const run = z
  .object({
    text: z.string().max(20_000),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    href: z
      .string()
      .url()
      .max(2000)
      .refine((s) => {
        const u = new URL(s);
        return (
          (u.protocol === "https:" && !u.username && !u.password) ||
          /^mailto:[^\s<>"@]+@[^\s<>"@]+$/.test(s)
        );
      })
      .optional(),
  })
  .strict();
export const RichCommunicationMessageSchema = z
  .object({
    subject: header,
    paragraphs: z.array(z.array(run).min(1).max(100)).min(1).max(200),
    attachmentIds: z.array(z.string().uuid()).max(10).default([]),
  })
  .strict()
  .refine(
    (s) => s.paragraphs.some((p) => p.some((r) => r.text.trim())),
    "Enter a message.",
  )
  .refine(
    (s) => JSON.stringify(s).length <= 100_000,
    "The message exceeds the supported size.",
  );
export type RichCommunicationMessage = z.infer<typeof RichCommunicationMessageSchema>;
export const SequenceDraftSchema = z
  .object({
    id: z.string().uuid(),
    context: WorkflowCommunicationContextSchema,
    initial: RichCommunicationMessageSchema,
    followUp: RichCommunicationMessageSchema.nullable(),
  })
  .strict()
  .refine((s) => {
    try {
      communicationSendKey(s.context);
      return true;
    } catch {
      return false;
    }
  }, "Choose a supported actual lease or maintenance communication.");
export type SequenceDraft = z.infer<typeof SequenceDraftSchema>;
export type SequenceState =
  | "draft"
  | "active"
  | "paused"
  | "cancelled"
  | "completed"
  | "needs_reconciliation";
export interface CommunicationAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}
export interface StaffBusinessSignatureSnapshot {
  uid: string;
  email: string;
  version: number;
  recordedAt: string;
  source: string;
  text: string;
  contentHash: string;
}
export interface AuthorizedMessage {
  signature?: StaffBusinessSignatureSnapshot;
  subject: string;
  plainText: string;
  htmlBody: string;
  attachments: CommunicationAttachment[];
}
export interface CommunicationReplyBinding {
  senderEmail: string;
  threadId: string;
  parentMessageId: string;
  subject: string;
  references: string[];
}
export interface CommunicationThreading {
  threadId?: string;
  inReplyTo?: string;
  references: string[];
}
export interface CommunicationAuthorization {
  reply?: CommunicationReplyBinding;
  revision: number;
  approvedByUid: string;
  senderEmail: string;
  approvedAtMs: number;
  payloadHash: string;
  materialSourceHash: string;
  to: string[];
  cc: string[];
  sourceRefs: string[];
  initial: AuthorizedMessage;
  followUp: AuthorizedMessage | null;
  schedule: CommunicationSchedule | null;
}
export interface CommunicationSequence
  extends
    SequenceDraft,
    Partial<import("./retention-policy").CommunicationsRetentionFields> {
  schemaVersion: "workflow-communication-sequence/v1";
  workflowLabel: string;
  version: number;
  responsibleUid: string;
  senderEmail: string;
  state: SequenceState;
  createdAtMs: number;
  updatedAtMs: number;
  createdByUid: string;
  authorization: CommunicationAuthorization | null;
  signatureSnapshots?: {
    initial: StaffBusinessSignatureSnapshot | null;
    followUp: StaffBusinessSignatureSnapshot | null;
  };
  nextDueAtMs: number | null;
  confirmedCount: number;
  lastSentAtMs: number | null;
  pause: {
    cause:
      | "staff"
      | "reply"
      | "bounce"
      | "changed_source"
      | "transfer"
      | "edited"
      | "source_unavailable"
      | "authorization_unavailable";
    byUid: string;
    atMs: number;
    evidenceIds: string[];
  } | null;
  unresolvedOccurrenceId: string | null;
  linkedThreads: { senderEmail: string; threadId: string }[];
  threads: {
    senderEmail: string;
    threadId: string;
    messageId: string;
    rfcMessageId: string;
    sentAtMs: number;
  }[];
  observedMessageIds: string[];
  observation: {
    checkedAtMs: number;
    state: "current" | "unavailable";
    historyId: string | null;
    mailboxHistoryIds?: Record<string, string>;
  } | null;
  lastOperation: { id: string; hash: string };
}
export interface CommunicationOccurrence {
  id: string;
  sequenceId: string;
  authorizationRevision: number;
  index: number;
  state: "claimed" | "sent" | "ambiguous" | "refused";
  senderEmail: string;
  rfcMessageId: string;
  payloadHash: string;
  claimedAtMs: number;
  threading?: CommunicationThreading;
  settledAtMs?: number;
  gmailMessageId?: string;
  gmailThreadId?: string;
  sentAtMs?: number;
  reason?: "paused_before_dispatch" | "provider_refusal" | "provider_unknown";
}
export interface VerifiedCommunicationTarget {
  reply?: CommunicationReplyBinding;
  context: WorkflowCommunicationContext;
  to: string[];
  cc: string[];
  sourceRefs: string[];
  materialSourceHash: string;
  label: string;
  blockers?: string[];
}
export function communicationSendKey(
  context: WorkflowCommunicationContext,
):
  | "gmail.renewal_notice.send"
  | "gmail.maintenance_owner_notice.send"
  | "gmail.thread.reply" {
  if (
    context.actionKey === "gmail.thread.reply" &&
    context.replyTo &&
    ((context.entityType === "renewal_lease" && context.lane === "renewals") ||
      (context.entityType === "maintenance_ticket" && context.lane === "maintenance"))
  )
    return "gmail.thread.reply";
  if (
    context.lane === "renewals" &&
    context.entityType === "renewal_lease" &&
    ["renewal_owner", "renewal_tenant"].includes(context.purpose) &&
    ["gmail.mailbox.read", "gmail.renewal_notice.send"].includes(context.actionKey)
  )
    return "gmail.renewal_notice.send";
  if (
    context.lane === "maintenance" &&
    context.entityType === "maintenance_ticket" &&
    context.purpose === "maintenance_owner" &&
    ["gmail.mailbox.read", "gmail.maintenance_owner_notice.send"].includes(
      context.actionKey,
    )
  )
    return "gmail.maintenance_owner_notice.send";
  throw new Error("This workflow has no supported Send/Schedule operation.");
}
/** Preview, copy and MIME use the same escaped structured content. */
export function renderEditableCommunicationBody(
  paragraphs: RichCommunicationMessage["paragraphs"],
): { plainText: string; htmlBody: string } {
  const rendered = paragraphs.map((p) => renderInlineMessageParagraph(p));
  return {
    plainText: rendered.map((p) => p.plainText).join("\n\n"),
    htmlBody:
      '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' +
      rendered.map((p) => "<p>" + p.html + "</p>").join("") +
      "</div>",
  };
}
export function renderCommunicationMessage(input: RichCommunicationMessage): {
  plainText: string;
  htmlBody: string;
} {
  return renderEditableCommunicationBody(
    RichCommunicationMessageSchema.parse(input).paragraphs,
  );
}
export function plainCommunicationMessage(
  subject: string,
  body: string,
): RichCommunicationMessage {
  return RichCommunicationMessageSchema.parse({
    subject,
    paragraphs: body.split(/\n\n/).map((text) => [{ text }]),
    attachmentIds: [],
  });
}
