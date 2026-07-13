import { createHash } from "node:crypto";

import { z } from "zod";

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
    confirmationToken: z
      .string()
      .min(32)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export const CreateGmailDraftSchema = PrepareGmailMessageSchema;

export const ApplyGmailLabelSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1)
      .max(225)
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
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
