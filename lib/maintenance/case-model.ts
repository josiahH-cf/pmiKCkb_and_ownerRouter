import {
  UrgencyReviewSchema,
  ResponsibilityReviewSchema,
  type ResponsibilityDecision,
} from "./review-model";
// Client-safe prospective maintenance facts. Raw communications and provider effects have separate owners.
import { z } from "zod";
export const canonicalMaintenanceId = z.string().regex(/^[1-9][0-9]{0,9}$/);
export const maintenanceDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
      new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v,
    "Use a real calendar date.",
  );
const evidence = z.string().trim().min(1).max(1000);
export const CaseAssociationInputSchema = z
  .object({
    kind: z.enum(["unresolved", "property_level", "unit", "vacant", "lease"]),
    propertyId: canonicalMaintenanceId.nullable(),
    unitId: canonicalMaintenanceId.nullable(),
    leaseId: canonicalMaintenanceId.nullable(),
    ownerRef: canonicalMaintenanceId.nullable().optional(),
    eventDate: maintenanceDate,
    evidenceRef: evidence,
    reason: z.string().trim().min(1).max(4000),
  })
  .strict()
  .superRefine((v, c) => {
    const bad = (message: string) => c.addIssue({ code: "custom", message });
    if (
      v.kind === "unresolved" &&
      (v.propertyId !== null ||
        v.unitId !== null ||
        v.leaseId !== null ||
        v.ownerRef != null)
    )
      bad(
        "Keep unresolved identifiers in the reason; they are not verified canonical associations.",
      );
    if (v.kind !== "unresolved" && !v.propertyId) bad("Select the verified property.");
    if (["unit", "vacant", "lease"].includes(v.kind) && !v.unitId)
      bad("Select the verified unit.");
    if (v.kind === "lease" && !v.leaseId)
      bad("Select the actual event-date lease, with reviewed tenancy evidence.");
    if (v.kind !== "lease" && v.leaseId !== null)
      bad("A property, vacant or unresolved case cannot silently carry a lease.");
    if (v.kind === "property_level" && v.unitId !== null)
      bad("Property-level work has no selected unit.");
  });
export type CaseAssociationInput = z.infer<typeof CaseAssociationInputSchema>;
export interface CaseAssociation extends CaseAssociationInput {
  version: number;
  identityStatus: "verified" | "unresolved";
  tenancyBasis: "staff_reviewed_event_date_evidence" | "not_applicable";
  ownershipBasis?: "staff_reviewed_event_date_evidence" | "not_established";
  ownerLabel?: string | null;
  unitLabel?: string | null;
  verifiedAt: string;
  recordedBy: string;
  sourceHash: string;
}
export const FINANCIAL_KINDS = [
  "estimate",
  "quote",
  "vendor_invoice",
  "vendor_credit",
  "reviewed_vendor_cost",
  "pmi_markup",
  "pmi_adjustment",
  "owner_charge",
  "payment_claim",
] as const;
export type FinancialKind = (typeof FINANCIAL_KINDS)[number] | "payment_observation";
export const FINANCIAL_KIND_LABELS: Record<FinancialKind, string> = {
  estimate: "Proposed estimate",
  quote: "Vendor quote",
  vendor_invoice: "Vendor invoice allocation",
  vendor_credit: "Vendor credit allocation",
  reviewed_vendor_cost: "Reviewed vendor cost",
  pmi_markup: "PMI markup",
  pmi_adjustment: "PMI adjustment",
  owner_charge: "Reviewed owner charge",
  payment_claim: "Staff-recorded payment claim",
  payment_observation: "Provider-verified payment observation",
};
export const FinancialEntryInputSchema = z
  .object({
    id: z.string().uuid(),
    expectedEntryVersion: z.number().int().nonnegative(),
    kind: z.enum(FINANCIAL_KINDS),
    amountCents: z.number().int().min(-10000000000).max(10000000000),
    currency: z.literal("USD"),
    serviceDate: maintenanceDate,
    invoiceDate: maintenanceDate.nullable(),
    paymentDate: maintenanceDate.nullable(),
    vendorId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,160}$/)
      .nullable(),
    sourceRef: evidence,
    externalIdentity: z.string().trim().min(1).max(200).nullable(),
    sourceTotalCents: z.number().int().nonnegative().max(10000000000).nullable(),
    sourceLines: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(400),
            amountCents: z.number().int().nonnegative().max(10000000000),
          })
          .strict(),
      )
      .max(100),
    reviewState: z.enum(["reported", "reviewed", "void"]),
    correctionReason: z.string().trim().min(1).max(4000),
  })
  .strict()
  .superRefine((v, c) => {
    const bad = (message: string) => c.addIssue({ code: "custom", message });
    if (v.kind !== "pmi_adjustment" && v.amountCents < 0)
      bad(
        "Record a positive credit separately; only a reviewed adjustment can be negative.",
      );
    if (["vendor_invoice", "vendor_credit", "quote"].includes(v.kind)) {
      if (
        !v.vendorId ||
        !v.externalIdentity ||
        v.sourceTotalCents === null ||
        v.sourceLines.length === 0
      )
        bad(
          "Record the real vendor/source identity and complete original line totals, including tax.",
        );
      if (v.sourceTotalCents !== v.sourceLines.reduce((sum, l) => sum + l.amountCents, 0))
        bad("Original invoice/quote lines must match its exact source total.");
      if (v.sourceTotalCents !== null && v.amountCents > v.sourceTotalCents)
        bad("The allocation cannot exceed the original source total.");
    }
    if (
      ["reviewed_vendor_cost", "pmi_markup", "pmi_adjustment", "owner_charge"].includes(
        v.kind,
      ) &&
      v.reviewState === "reported"
    )
      bad("Deliberately review this financial attribution before recording it.");
    if (v.kind === "payment_claim" && !v.paymentDate)
      bad("Record the claimed payment date; this remains a staff claim.");
  });
export type FinancialEntryInput = z.infer<typeof FinancialEntryInputSchema>;
export interface FinancialEntry extends Omit<
  FinancialEntryInput,
  "expectedEntryVersion" | "kind" | "currency"
> {
  kind: FinancialKind;
  currency: string;
  version: number;
  ticket_id: string;
  recorded_by_uid: string;
  recorded_at: string;
  verification?: {
    kind: "provider_readback";
    provider: string;
    reference: string;
    resultHash: string;
    observedAt: string;
  };
}
const PaymentReadbackEvidenceSchema = z.object({
  amountCents: z.number().int().nonnegative().max(10000000000),
  currency: z.literal("USD"),
  sourceRef: evidence,
  paymentDate: maintenanceDate,
  verification: z
    .object({
      kind: z.literal("provider_readback"),
      provider: z
        .string()
        .trim()
        .min(1)
        .max(160)
        .regex(/^[^\u0000-\u001f\u007f]+$/),
      reference: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .regex(/^[^\u0000-\u001f\u007f]+$/),
      resultHash: z.string().regex(/^[a-f0-9]{64}$/),
      observedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
});
/** Completeness of retained source evidence, not authority to create an observation. Ordinary
 * staff commands exclude payment_observation; a real authoritative adapter remains a separate gate. */
export function hasCompletePaymentReadback(
  entry: FinancialEntry,
): entry is FinancialEntry & {
  verification: NonNullable<FinancialEntry["verification"]>;
} {
  return (
    entry.kind === "payment_observation" &&
    entry.reviewState !== "void" &&
    PaymentReadbackEvidenceSchema.safeParse(entry).success
  );
}
export function financialEntryLabel(entry: FinancialEntry) {
  return entry.kind === "payment_observation" && !hasCompletePaymentReadback(entry)
    ? "Payment observation, incomplete and unverified"
    : FINANCIAL_KIND_LABELS[entry.kind];
}
export function financialEvidenceSourceLabel(entry: FinancialEntry) {
  if (entry.kind === "payment_observation") {
    if (!hasCompletePaymentReadback(entry))
      return "Incomplete payment observation, unverified";
    const v = entry.verification;
    return `Provider payment readback: ${v.provider}; reference ${v.reference}; observed ${v.observedAt}; SHA-256 ${v.resultHash}`;
  }
  return entry.kind === "payment_claim"
    ? "Staff payment claim, unverified"
    : entry.reviewState === "reviewed"
      ? "PMI reviewed source"
      : "Reported source, awaiting review";
}
export interface FinancialSourceAllocation {
  totalCents: number;
  currency: string;
  sourceHash: string;
  allocations: Record<string, number>;
}
export function validateFinancialAllocation(
  existing: FinancialSourceAllocation | null,
  input: {
    allocationKey: string;
    amountCents: number;
    totalCents: number;
    currency: string;
    sourceHash: string;
    correction: boolean;
  },
): string | null {
  if (input.amountCents < 0 || input.amountCents > input.totalCents)
    return "This allocation would exceed its original source total.";
  if (!existing) return null;
  const others = Object.entries(existing.allocations).filter(
    ([key]) => key !== input.allocationKey,
  );
  if (
    existing.currency !== input.currency ||
    existing.sourceHash !== input.sourceHash ||
    existing.totalCents !== input.totalCents
  ) {
    if (!input.correction || others.length > 0)
      return "A revised source conflicts with recorded allocations. Reconcile every affected allocation before changing the original total.";
  }
  const caseId = input.allocationKey.split(":")[0];
  if (others.some(([key]) => key.split(":")[0] === caseId))
    return "This invoice is already allocated to this case. Correct that original entry instead of duplicating it.";
  if (
    others.reduce((sum, [, amount]) => sum + amount, 0) + input.amountCents >
    input.totalCents
  )
    return "The combined allocations would exceed the original source total.";
  return null;
}
export function financialProjection(entries: readonly FinancialEntry[]) {
  const valid = entries.filter((e) => e.reviewState !== "void" && e.currency === "USD");
  const sum = (kind: FinancialKind, reviewed = false) => {
    const values = valid.filter(
      (e) => e.kind === kind && (!reviewed || e.reviewState === "reviewed"),
    );
    return values.length ? values.reduce((total, e) => total + e.amountCents, 0) : null;
  };
  const verified = valid.filter(hasCompletePaymentReadback);
  const verifiedPaidCents = verified.length
      ? verified.reduce((total, e) => total + e.amountCents, 0)
      : null,
    ownerChargeCents = sum("owner_charge", true);
  const balanceCents =
    ownerChargeCents !== null && verifiedPaidCents !== null
      ? ownerChargeCents - verifiedPaidCents
      : null;
  return {
    currency: "USD" as const,
    estimateCents: sum("estimate"),
    quotedCents: sum("quote"),
    invoicedCents: sum("vendor_invoice"),
    creditsCents: sum("vendor_credit"),
    reviewedVendorCostCents: sum("reviewed_vendor_cost", true),
    markupCents: sum("pmi_markup", true),
    adjustmentCents: sum("pmi_adjustment", true),
    ownerChargeCents,
    claimedPaidCents: sum("payment_claim"),
    verifiedPaidCents,
    balanceCents,
    paymentState:
      verifiedPaidCents === null
        ? "unknown"
        : ownerChargeCents === null
          ? "observed_unallocated"
          : balanceCents! > 0
            ? "partial"
            : balanceCents === 0
              ? "paid_observed"
              : "overpayment_observed",
    unreviewedInvoices: valid.filter(
      (e) =>
        ["vendor_invoice", "vendor_credit"].includes(e.kind) &&
        e.reviewState !== "reviewed",
    ).length,
    excludedCurrencies: [
      ...new Set(entries.filter((e) => e.currency !== "USD").map((e) => e.currency)),
    ],
  };
}
export const RawSourceReferenceSchema = z
  .object({
    kind: z.enum(["message", "call_recording", "transcript"]),
    sourceRef: evidence,
    expiresAt: z.string().datetime(),
    legalHold: z.boolean(),
  })
  .strict();
export type RawSourceReference = z.infer<typeof RawSourceReferenceSchema>;
export function rawSourceAvailability(
  source: Pick<RawSourceReference, "expiresAt" | "legalHold">,
  at: Date | string | number = Date.now(),
) {
  if (source.legalHold) return "held_current_access_required";
  return !Number.isFinite(Date.parse(source.expiresAt)) ||
    new Date(at).getTime() >= Date.parse(source.expiresAt)
    ? "expired"
    : "current_access_required";
}
const command = {
  operationId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
};
export const MaintenanceCaseCommandSchema = z.discriminatedUnion("op", [
  z
    .object({ ...command, op: z.literal("urgency_review"), review: UrgencyReviewSchema })
    .strict(),
  z
    .object({
      ...command,
      op: z.literal("responsibility_review"),
      review: ResponsibilityReviewSchema,
    })
    .strict(),
  z
    .object({
      ...command,
      op: z.literal("association"),
      association: CaseAssociationInputSchema,
    })
    .strict(),
  z
    .object({ ...command, op: z.literal("financial"), entry: FinancialEntryInputSchema })
    .strict(),
  z
    .object({
      ...command,
      op: z.literal("reviewed_summary"),
      summary: z.string().trim().min(1).max(4000),
      occurredAt: z.string().datetime(),
      evidenceRefs: z.array(evidence).min(1).max(30),
      reviewedFactualSummary: z.literal(true),
      rawSources: z.array(RawSourceReferenceSchema).max(20),
    })
    .strict(),
]);
export type MaintenanceCaseCommand = z.infer<typeof MaintenanceCaseCommandSchema>;
export interface MaintenanceCaseEvent {
  id: string;
  ticket_id: string;
  ticket_version: number;
  kind: string;
  actor_kind: "staff" | "vendor" | "provider_observation";
  actor_id: string;
  occurred_at: string;
  occurrence_precision?: "date" | "instant";
  recorded_at: string;
  summary: string;
  evidence_refs: string[];
  association: CaseAssociation | null;
  financial_snapshot?: FinancialEntry;
  previous_financial_snapshot?: FinancialEntry | null;
  previous_association?: CaseAssociation | null;
  raw_sources?: RawSourceReference[];
  previous_responsibility?: ResponsibilityDecision | null;
  responsibility_snapshot?: ResponsibilityDecision;
  urgency_review?: {
    originalFacts: { summary: string; description: string };
    reviewedFacts: z.infer<typeof UrgencyReviewSchema>["facts"];
    reason: string;
    previousDecision: unknown;
    decision: unknown;
  };
}

export const MaintenanceArtifactInputSchema = z
  .object({
    operationId: z.string().uuid(),
    expectedVersion: z.number().int().nonnegative(),
    filename: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/)
      .refine((v) => !v.includes("..")),
    mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
    purpose: z.enum(["invoice", "quote", "work_photo", "reviewed_report"]),
    approvedForIndefiniteRetention: z.literal(true),
    containsRawCommunications: z.literal(false),
    base64: z
      .string()
      .min(1)
      .max(7 * 1024 * 1024),
  })
  .strict();
export type MaintenanceArtifactInput = z.infer<typeof MaintenanceArtifactInputSchema>;
export interface MaintenanceArtifactView {
  id: string;
  ticket_id: string;
  filename: string;
  mimeType: string;
  purpose: MaintenanceArtifactInput["purpose"];
  sizeBytes: number;
  sha256: string;
  state: "uploading" | "needs_review" | "retained";
  recorded_at: string;
  actor_uid: string;
  reviewed_ticket_version: number;
  product_retention_class: "indefinite";
  legal_hold: boolean;
}
