import { createHash } from "node:crypto";

import { z } from "zod";

import { DRAFT_BANNER } from "@/lib/constants";
import { GMAIL_INBOX_ZERO_LABELS } from "@/lib/gmail-inbox-zero/constants";
import { GMAIL_MANUAL_LABEL_RULE_REF } from "@/lib/gmail-hub/governed-artifacts";
import { WorkflowCommunicationContextSchema } from "@/lib/gmail-hub/workflow-context";
import type { GmailOutgoingMessage } from "@/lib/gmail-runtime/types";

const EmailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const HeaderSchema = z
  .string()
  .trim()
  .min(1)
  .max(998)
  .refine((value) => !/[\r\n]/.test(value));
const BodySchema = z.string().trim().min(1).max(50_000);
const GmailIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);
const RfcMessageIdSchema = z
  .string()
  .trim()
  .max(500)
  .regex(/^<[^<>\s@]+@[^<>\s@]+>$/);

export const PrepareGmailMessageSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("new"),
      to: z.array(EmailSchema).min(1).max(10),
      cc: z.array(EmailSchema).max(10).default([]),
      bcc: z.array(EmailSchema).max(10).default([]),
      subject: HeaderSchema,
      body: BodySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("reply"),
      threadId: GmailIdSchema,
      body: BodySchema,
    })
    .strict(),
]);
export type PrepareGmailMessageInput = z.output<typeof PrepareGmailMessageSchema>;

export const WorkflowPrepareGmailMessageSchema = z
  .object({
    context: WorkflowCommunicationContextSchema,
    message: PrepareGmailMessageSchema,
  })
  .strict();
export type WorkflowPrepareGmailMessageInput = z.output<
  typeof WorkflowPrepareGmailMessageSchema
>;

export const GmailOutgoingMessageSchema: z.ZodType<GmailOutgoingMessage> = z
  .object({
    from: EmailSchema,
    to: z.array(EmailSchema).min(1).max(10),
    cc: z.array(EmailSchema).max(10),
    bcc: z.array(EmailSchema).max(10),
    subject: HeaderSchema,
    body: BodySchema,
    messageId: RfcMessageIdSchema,
    threadId: GmailIdSchema.optional(),
    inReplyTo: RfcMessageIdSchema.optional(),
    references: z.array(RfcMessageIdSchema).max(20),
  })
  .strict();

export const ConfirmedGmailSendSchema = z
  .object({
    context: WorkflowCommunicationContextSchema,
    confirmationToken: z
      .string()
      .min(32)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/),
    payload: GmailOutgoingMessageSchema,
  })
  .strict();

export const ReconcileGmailSendSchema = z
  .object({
    context: WorkflowCommunicationContextSchema,
    confirmationToken: z
      .string()
      .min(32)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export const CreateGmailDraftSchema = WorkflowPrepareGmailMessageSchema.superRefine(
  (input, issue) => {
    if (input.message.kind !== "reply") {
      issue.addIssue({
        code: "custom",
        message:
          "The shared Gmail draft action creates workflow-linked reply drafts only.",
      });
    }
    if (!input.context.templateRef) {
      issue.addIssue({
        code: "custom",
        message: "An approved reply template reference is required.",
      });
    }
    if (!input.message.body.startsWith(DRAFT_BANNER)) {
      issue.addIssue({
        code: "custom",
        message: "An unsent Gmail draft must carry the review-before-sending banner.",
      });
    }
  },
);

export const ApplyGmailLabelSchema = z
  .object({
    context: WorkflowCommunicationContextSchema,
    label: z.enum(GMAIL_INBOX_ZERO_LABELS),
    reason: z.string().trim().min(1).max(500),
    ruleRef: z.literal(GMAIL_MANUAL_LABEL_RULE_REF),
  })
  .strict();

export const WorkflowThreadContextQuerySchema = z
  .string()
  .trim()
  .min(2)
  .max(4_000)
  .transform((value, issue) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      issue.addIssue({ code: "custom", message: "Invalid Gmail workflow context." });
      return z.NEVER;
    }
  })
  .pipe(WorkflowCommunicationContextSchema);

export const LinkWorkflowCommunicationSchema = z
  .object({
    context: WorkflowCommunicationContextSchema,
    threadId: GmailIdSchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export function hashGmailPayload(payload: GmailOutgoingMessage): string {
  const parsed = GmailOutgoingMessageSchema.parse(payload);
  return sha256(
    JSON.stringify({
      from: parsed.from,
      to: parsed.to,
      cc: parsed.cc,
      bcc: parsed.bcc,
      subject: parsed.subject,
      body: parsed.body,
      messageId: parsed.messageId,
      threadId: parsed.threadId ?? null,
      inReplyTo: parsed.inReplyTo ?? null,
      references: parsed.references,
    }),
  );
}

export function hashConfirmationToken(token: string): string {
  return sha256(token);
}

export function assertAuthenticatedSender(
  payload: GmailOutgoingMessage,
  authenticatedEmail: string,
): void {
  const parsed = GmailOutgoingMessageSchema.parse(payload);
  const email = authenticatedEmail.trim().toLowerCase();
  if (parsed.from !== email) {
    throw new GmailBoundaryError("Gmail From must match the signed-in user.");
  }
}

export class GmailBoundaryError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "GmailBoundaryError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
