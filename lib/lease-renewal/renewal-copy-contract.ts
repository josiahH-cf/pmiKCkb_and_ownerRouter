import { z } from "zod";

export const RENEWAL_COPY_TEMPLATE_REFS = [
  "owner-renewal:v1.0",
  "tenant-renewal:v1.0",
] as const;

export type RenewalCopyChannel = "owner" | "tenant";
export type RenewalCopyTemplateRef = (typeof RENEWAL_COPY_TEMPLATE_REFS)[number];
export type RenewalCopyPublicationStatus = "review_only" | "approved" | "retired";

export interface RenewalCopyRegionSource {
  id: string;
  label: string;
  defaultText: string;
  maxLength: number;
}

export interface RenewalCopyTemplateSource {
  channel: RenewalCopyChannel;
  ref: RenewalCopyTemplateRef;
  version: "v1.0";
  compatibility: "renewal-v1";
  regions: readonly RenewalCopyRegionSource[];
  lockedFactKeys: readonly string[];
  requiredLockedFactKeys: readonly string[];
  mandatorySentences: readonly string[];
  forbiddenPhrases: readonly string[];
}

const ownerRegions = Object.freeze([
  Object.freeze({
    id: "salutation",
    label: "Opening",
    defaultText: "Hello,",
    maxLength: 160,
  }),
  Object.freeze({
    id: "owner_request",
    label: "Owner decision request",
    defaultText: "Please let me know your thoughts on offering them a renewal.",
    maxLength: 700,
  }),
]);

const tenantRegions = Object.freeze([
  Object.freeze({
    id: "response_request",
    label: "Tenant response request",
    defaultText:
      "Please let us know if you plan to stay or leave as soon as possible, and we'll get the documents out if you plan to stay.",
    maxLength: 700,
  }),
]);

export const RENEWAL_COPY_TEMPLATE_SOURCES = Object.freeze({
  owner: Object.freeze({
    channel: "owner",
    ref: "owner-renewal:v1.0",
    version: "v1.0",
    compatibility: "renewal-v1",
    regions: ownerRegions,
    lockedFactKeys: Object.freeze([
      "address",
      "current_rent",
      "market_range",
      "market_trend",
      "market_number",
      "comps_screenshot",
    ]),
    requiredLockedFactKeys: Object.freeze([
      "address",
      "current_rent",
      "market_range",
      "market_number",
    ]),
    mandatorySentences: Object.freeze(["PMI KC Metro"]),
    forbiddenPhrases: Object.freeze([]),
  }),
  tenant: Object.freeze({
    channel: "tenant",
    ref: "tenant-renewal:v1.0",
    version: "v1.0",
    compatibility: "renewal-v1",
    regions: tenantRegions,
    lockedFactKeys: Object.freeze([
      "tenant_name",
      "lease_end_date",
      "owner_decision",
      "offered_rent",
      "charge_rbp",
      "charge_insurance",
      "info_form_url",
    ]),
    requiredLockedFactKeys: Object.freeze([
      "tenant_name",
      "lease_end_date",
      "owner_decision",
      "offered_rent",
    ]),
    mandatorySentences: Object.freeze(["PMI KC Metro"]),
    forbiddenPhrases: Object.freeze([]),
  }),
}) satisfies Readonly<Record<RenewalCopyChannel, RenewalCopyTemplateSource>>;

export const CURRENT_RENEWAL_COPY_PUBLICATION = Object.freeze({
  owner: Object.freeze({
    status: "review_only" as const,
    reason:
      "Client-approved owner wording, required/forbidden copy, editable regions, and channel-evidence rules have not been supplied.",
  }),
  tenant: Object.freeze({
    status: "review_only" as const,
    reason:
      "Client-approved tenant wording, required/forbidden copy, editable regions, and channel-evidence rules have not been supplied.",
  }),
});

const regionText = z.string().trim().min(1).max(700);

export const OwnerRenewalCopySelectionSchema = z
  .object({
    templateRef: z.literal("owner-renewal:v1.0"),
    templateVersion: z.literal("v1.0"),
    editableRegions: z
      .object({
        salutation: z.string().trim().min(1).max(160),
        owner_request: regionText,
      })
      .strict(),
  })
  .strict();

export const TenantRenewalCopySelectionSchema = z
  .object({
    templateRef: z.literal("tenant-renewal:v1.0"),
    templateVersion: z.literal("v1.0"),
    editableRegions: z.object({ response_request: regionText }).strict(),
  })
  .strict();

export const RenewalCopySelectionSchema = z.discriminatedUnion("templateRef", [
  OwnerRenewalCopySelectionSchema,
  TenantRenewalCopySelectionSchema,
]);

export type OwnerRenewalCopySelection = z.infer<typeof OwnerRenewalCopySelectionSchema>;
export type TenantRenewalCopySelection = z.infer<typeof TenantRenewalCopySelectionSchema>;
export type RenewalCopySelection = z.infer<typeof RenewalCopySelectionSchema>;

export function defaultRenewalCopySelection(channel: "owner"): OwnerRenewalCopySelection;
export function defaultRenewalCopySelection(
  channel: "tenant",
): TenantRenewalCopySelection;
export function defaultRenewalCopySelection(
  channel: RenewalCopyChannel,
): RenewalCopySelection;
export function defaultRenewalCopySelection(
  channel: RenewalCopyChannel,
): RenewalCopySelection {
  const source = RENEWAL_COPY_TEMPLATE_SOURCES[channel];
  const editableRegions = Object.fromEntries(
    source.regions.map((region) => [region.id, region.defaultText]),
  );
  return RenewalCopySelectionSchema.parse({
    templateRef: source.ref,
    templateVersion: source.version,
    editableRegions,
  });
}

export const RenewalCopyTemplateSummarySchema = z
  .object({
    ref: z.enum(RENEWAL_COPY_TEMPLATE_REFS),
    version: z.literal("v1.0"),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["review_only", "approved", "retired"]),
  })
  .strict();

export type RenewalCopyTemplateSummary = z.infer<typeof RenewalCopyTemplateSummarySchema>;

export const RenewalCopyAssistRequestSchema = z
  .object({
    templateRef: z.enum(RENEWAL_COPY_TEMPLATE_REFS),
    templateVersion: z.literal("v1.0"),
  })
  .strict();

export type RenewalCopyAssistRequest = z.infer<typeof RenewalCopyAssistRequestSchema>;

export const RenewalCopyAssistOutcomeSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("refused"),
      template: RenewalCopyTemplateSummarySchema,
      selection: RenewalCopySelectionSchema,
      usedModel: z.literal(false),
      refusedBeforeModel: z.boolean(),
      errors: z.array(z.string().min(1)),
    })
    .strict(),
  z
    .object({
      status: z.literal("ready"),
      template: RenewalCopyTemplateSummarySchema,
      selection: RenewalCopySelectionSchema,
      usedModel: z.boolean(),
      refusedBeforeModel: z.literal(false),
      errors: z.array(z.string().min(1)),
    })
    .strict(),
]);

export type RenewalCopyAssistOutcome = z.infer<typeof RenewalCopyAssistOutcomeSchema>;

export function renewalCopyChannelForRef(
  ref: RenewalCopyTemplateRef,
): RenewalCopyChannel {
  return ref.startsWith("owner-") ? "owner" : "tenant";
}
