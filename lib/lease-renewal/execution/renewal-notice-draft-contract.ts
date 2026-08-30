import { z } from "zod";

import {
  RenewalCopySelectionSchema,
  RenewalCopyTemplateSummarySchema,
  renewalCopyChannelForRef,
} from "@/lib/lease-renewal/renewal-copy-contract";

// Browser-safe, shared contract for the renewal draft surface. The browser, route, and service all
// consume this file. The request may identify only the current server-matched template version and
// supply allowlisted prose-region choices; publication authority, mailbox, recipient, live facts,
// approved copy sources, and provider construction remain server-only.

const positiveMoney = z.number().finite().positive();
const chargeMoney = z.number().finite().nonnegative();

export const RenewalDraftConfirmationSchema = z
  .object({
    executionId: z
      .string()
      .trim()
      .regex(/^exec_[a-f0-9]{40}$/),
    previewHash: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const RenewalDraftReconciliationSchema = z
  .object({
    executionId: z
      .string()
      .trim()
      .regex(/^exec_[a-f0-9]{40}$/),
  })
  .strict();

export const TenantRenewalDraftOfferSchema = z
  .object({
    channel: z.literal("tenant"),
    ownerDecision: z.enum(["keep_same", "increase", "custom"]),
    offeredRent: positiveMoney,
    charges: z
      .object({ rbp: chargeMoney.optional(), insurance: chargeMoney.optional() })
      .strict()
      .optional(),
    infoFormUrl: z.string().trim().url().optional(),
  })
  .strict();

const OwnerRenewalDraftMarketSchema = z
  .object({
    specificNumber: positiveMoney.optional(),
    rangeLow: positiveMoney.optional(),
    rangeHigh: positiveMoney.optional(),
  })
  .strict()
  .superRefine((market, context) => {
    if (
      market.rangeLow !== undefined &&
      market.rangeHigh !== undefined &&
      market.rangeLow > market.rangeHigh
    ) {
      context.addIssue({
        code: "custom",
        message: "Comp range low cannot exceed comp range high.",
        path: ["rangeLow"],
      });
    }
  });

export const OwnerRenewalDraftOfferSchema = z
  .object({
    channel: z.literal("owner"),
    market: OwnerRenewalDraftMarketSchema,
  })
  .strict();

export const RenewalNoticeDraftOfferSchema = z.discriminatedUnion("channel", [
  TenantRenewalDraftOfferSchema,
  OwnerRenewalDraftOfferSchema,
]);

export const RenewalNoticeDraftRequestSchema = z
  .object({
    leaseId: z.string().trim().min(1).max(120),
    offer: RenewalNoticeDraftOfferSchema,
    copy: RenewalCopySelectionSchema.optional(),
    // Preview omits both fields. Create carries exact confirmation. Read-only recovery carries only
    // the consumed execution identity. A boolean is invalid and no request may do both operations.
    confirm: RenewalDraftConfirmationSchema.optional(),
    reconcile: RenewalDraftReconciliationSchema.optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.confirm && request.reconcile) {
      context.addIssue({
        code: "custom",
        message: "A draft request cannot confirm and reconcile at the same time.",
        path: ["reconcile"],
      });
    }
    if (
      request.copy &&
      renewalCopyChannelForRef(request.copy.templateRef) !== request.offer.channel
    ) {
      context.addIssue({
        code: "custom",
        message: "Owner and tenant renewal copy cannot cross channels.",
        path: ["copy"],
      });
    }
  });

export type RenewalNoticeDraftRequest = z.infer<typeof RenewalNoticeDraftRequestSchema>;
export type RenewalNoticeDraftOffer = RenewalNoticeDraftRequest["offer"];
export type RenewalDraftConfirmation = z.infer<typeof RenewalDraftConfirmationSchema>;

export const RenewalNoticeDraftRecipientSchema = z
  .object({
    to: z.string().trim().min(1),
    sourceRef: z.string().trim().min(1),
    cc: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

const outcomeChannel = z.enum(["tenant", "owner"]);
const executionId = RenewalDraftConfirmationSchema.shape.executionId;
export const RenewalDraftAttachmentSummarySchema = z
  .object({
    label: z.string().trim().min(1).max(300),
    filename: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(5 * 1024 * 1024),
  })
  .strict();

export const RenewalNoticeDraftOutcomeSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("review_only"),
      channel: outcomeChannel,
      recipient: RenewalNoticeDraftRecipientSchema,
      subject: z.string(),
      body: z.string(),
      template: RenewalCopyTemplateSummarySchema,
      copy: RenewalCopySelectionSchema,
      reasons: z.array(z.string().min(1)),
      attachment: RenewalDraftAttachmentSummarySchema.optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal("blocked"),
      channel: outcomeChannel,
      reasons: z.array(z.string().min(1)),
    })
    .strict(),
  z
    .object({
      status: z.literal("preview"),
      channel: outcomeChannel,
      recipient: RenewalNoticeDraftRecipientSchema,
      subject: z.string(),
      body: z.string(),
      executionId,
      previewHash: RenewalDraftConfirmationSchema.shape.previewHash,
      template: RenewalCopyTemplateSummarySchema,
      attachment: RenewalDraftAttachmentSummarySchema.optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal("created"),
      channel: outcomeChannel,
      recipient: RenewalNoticeDraftRecipientSchema,
      subject: z.string(),
      draftId: z.string().trim().min(1),
      executionId,
      template: RenewalCopyTemplateSummarySchema,
      attachment: RenewalDraftAttachmentSummarySchema.optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal("needs_reconciliation"),
      channel: outcomeChannel,
      executionId,
      reason: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("reconciliation"),
      channel: outcomeChannel,
      executionId,
      resolution: z.enum(["created", "not_found", "needs_review"]),
      reason: z.string().min(1),
      duplicate: z.boolean().optional(),
      draftId: z.string().trim().min(1).optional(),
    })
    .strict(),
]);

export type RenewalNoticeDraftOutcome = z.infer<typeof RenewalNoticeDraftOutcomeSchema>;
export type RenewalNoticeDraftPreviewOutcome = Extract<
  RenewalNoticeDraftOutcome,
  { status: "preview" }
>;

/**
 * Client-only freshness identity for the fields the operator can mutate. This is not an authority
 * or security hash; the server-owned preview hash remains the exact-confirmation boundary.
 */
export function renewalDraftInputFingerprint(
  request: Pick<RenewalNoticeDraftRequest, "leaseId" | "offer" | "copy">,
): string {
  return JSON.stringify(
    canonicalize({
      leaseId: request.leaseId,
      offer: request.offer,
      copy: request.copy ?? null,
    }),
  );
}

export interface RenewalDraftPreviewBinding {
  executionId: string;
  previewHash: string;
  inputFingerprint: string;
}

export function bindRenewalDraftPreview(
  request: Pick<RenewalNoticeDraftRequest, "leaseId" | "offer" | "copy">,
  outcome: RenewalNoticeDraftPreviewOutcome,
): RenewalDraftPreviewBinding {
  return {
    executionId: outcome.executionId,
    previewHash: outcome.previewHash,
    inputFingerprint: renewalDraftInputFingerprint(request),
  };
}

export function isRenewalDraftPreviewCurrent(
  binding: RenewalDraftPreviewBinding | null,
  request: Pick<RenewalNoticeDraftRequest, "leaseId" | "offer" | "copy">,
): binding is RenewalDraftPreviewBinding {
  return (
    binding !== null && binding.inputFingerprint === renewalDraftInputFingerprint(request)
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}
