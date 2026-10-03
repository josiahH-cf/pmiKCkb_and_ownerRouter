import { z } from "zod";
import {
  MESSAGE_CHARGES,
  MessageChargeSchema,
  MessageLinkSchema,
  RenewalMessageEditsSchema,
} from "@/lib/lease-renewal/renewal-message-content";
import {
  AuthoredSubjectSchema,
  RefinedBodySchema,
} from "@/lib/lease-renewal/refined-message";

const source = z.string().trim().min(1).max(240);
export const MessagePreparationInputsSchema = z
  .object({
    edits: RenewalMessageEditsSchema,
    compScreenshotReceiptId: z
      .string()
      .regex(/^comp_store_[a-f0-9]{48}$/)
      .nullable()
      .default(null),
    charges: z
      .array(MessageChargeSchema)
      .max(6)
      .refine(
        (values) => new Set(values.map((value) => value.id)).size === values.length,
        "Record each charge once.",
      ),
    leaseOrigin: z
      .object({ kind: z.enum(["pmi", "third_party"]), source })
      .strict()
      .nullable(),
    insuranceTransition: z
      .object({ applicable: z.boolean(), source })
      .strict()
      .nullable(),
    otherChargesComparison: z
      .object({ unchanged: z.boolean(), source })
      .strict()
      .nullable(),
    signature: z
      .object({
        name: source,
        role: source.nullable(),
        phone: source.nullable(),
        hours: source.nullable(),
        website: MessageLinkSchema.nullable(),
        source,
      })
      .strict()
      .nullable(),
  })
  .strict();
export type MessagePreparationInputs = z.infer<typeof MessagePreparationInputsSchema>;
export function emptyMessagePreparationInputs(): MessagePreparationInputs {
  return {
    edits: { responseRequest: "" },
    compScreenshotReceiptId: null,
    charges: Object.keys(MESSAGE_CHARGES).map((id) => ({
      id: id as keyof typeof MESSAGE_CHARGES,
      applicable: null,
      amount: null,
      cadence: null,
      effectiveDate: null,
      source: null,
      comparison: "unverified",
    })),
    leaseOrigin: null,
    insuranceTransition: null,
    otherChargesComparison: null,
    signature: null,
  };
}
/**
 * S161/S162: one autosave of a message. No cycle is asked for: the first save of a lease's message
 * establishes its work record, and a later save may name the record it was editing so a change of
 * record is detected. Nothing here is a review or an approval. The two retired fields are still
 * accepted (and ignored) so a page loaded before this release keeps saving.
 */
export const SaveMessagePreparationSchema = z
  .object({
    leaseId: z.string().regex(/^[1-9]\d*$/),
    cycleId: z.string().uuid().optional(),
    channel: z.enum(["owner", "tenant"]),
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
    /** Retired: source freshness no longer gates a save. */
    sourceFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    /** Retired: there is no review step. */
    reviewed: z.boolean().optional(),
    adoptSignature: z.boolean().optional().default(false),
    inputs: MessagePreparationInputsSchema,
    /** The authored body for this revision; null or absent keeps the composed body. */
    bodyOverride: RefinedBodySchema.nullable().optional(),
    /** S161: the authored subject for this revision; null or absent keeps the composed subject. */
    subjectOverride: AuthoredSubjectSchema.nullable().optional(),
  })
  .strict();
export const MessagePreparationRecordSchema = z
  .object({
    schemaVersion: z.literal("renewal-message-preparation/v2"),
    leaseId: z.string().regex(/^[1-9]\d*$/),
    cycleId: z.string().uuid(),
    channel: z.enum(["owner", "tenant"]),
    revision: z.number().int().positive(),
    inputs: MessagePreparationInputsSchema,
    reviewedSourceFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    signatureActorUid: z.string().min(1).nullable(),
    signatureEmail: z.string().email().nullable(),
    updatedAt: z.string().datetime(),
    updatedByUid: z.string().min(1),
  })
  .strict();
export type MessagePreparationRecord = z.infer<typeof MessagePreparationRecordSchema>;
