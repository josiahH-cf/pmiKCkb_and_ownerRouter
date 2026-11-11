// S264 (R-S264-1, ARCH-S264-1): the approved offer charge mappings, kept by Admin under
// Renewal packet policy → Offer charge mappings.
//
// A mapping gives one exact, stable RentVine account its meaning in a tenant offer: the verified
// display label, the offer family, the cadence it supports and when it applies. It supplies
// meaning only. A line's amount, its applicability to one lease and any case policy still need
// their own evidence: the current RentVine line, the staff review on the lease, or an approved
// policy. Each saved set is a new immutable version with its approval evidence; nothing here
// publishes a fee, a rate or a default, and nothing is read from a printed form.
//
// Pure and client-safe.

import { z } from "zod";

export const OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION = "renewal-offer-charge-mappings/v1";

/** The offer families a RentVine account may be mapped to. One-time fees are never mapped. */
export const OFFER_MAPPING_FAMILIES = [
  "pet",
  "credit_reporting",
  "utilities",
  "rbp",
  "insurance",
  "separate_requirement",
] as const;
export type OfferMappingFamily = (typeof OFFER_MAPPING_FAMILIES)[number];

/** Every family a tenant offer row can belong to, mapped or entered for one case. */
export const OFFER_CHARGE_FAMILIES = [
  "pet",
  "credit_reporting",
  "utilities",
  "rbp",
  "insurance",
  "renewal_processing",
  "pet_processing",
] as const;
export type OfferChargeFamily = (typeof OFFER_CHARGE_FAMILIES)[number];

/** Staff words for each family, as Admin chooses it. */
export const OFFER_MAPPING_FAMILY_LABELS: Readonly<Record<OfferMappingFamily, string>> = {
  pet: "Pet rent",
  credit_reporting: "Credit reporting",
  utilities: "Utilities",
  rbp: "Resident Benefits Package",
  insurance: "Insurance",
  separate_requirement: "Separate requirement, not part of the offer",
};

export const OFFER_MAPPING_APPLICABILITY = [
  "active_on_renewal_date",
  "staff_decide",
] as const;
export type OfferMappingApplicability = (typeof OFFER_MAPPING_APPLICABILITY)[number];
export const OFFER_MAPPING_APPLICABILITY_LABELS: Readonly<
  Record<OfferMappingApplicability, string>
> = {
  active_on_renewal_date: "Carries forward when active on the renewal date",
  staff_decide: "Staff decide for each lease",
};

/** The label only a verified covered water or sewer identity may use. */
export const WATER_SEWER_LABEL = "Water / sewer";

/** "Monthly" or "Every 3 months": the cadence a mapping supports, in months between charges. */
export function frequencyLabel(months: number): string {
  return months === 1 ? "Monthly" : `Every ${months} months`;
}

const PLAIN_TEXT = /[\u0000-\u001f\u007f]|\{\{|\}\}|https?:\/\/|www\./i;
const plain = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (value) => !PLAIN_TEXT.test(value),
      "Use plain text without links or tokens.",
    );

/** A real calendar day. */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Choose a real calendar date.");

export const OfferChargeMappingEntrySchema = z
  .object({
    entryId: z.string().uuid(),
    /** The stable RentVine account id; the account itself must distinguish the charge type. */
    accountId: z
      .string()
      .regex(/^[1-9]\d{0,18}$/, "Enter the RentVine account ID (digits)."),
    /** The account's name in RentVine when it was approved, for staff to recognize it. */
    accountName: plain(120),
    /** The verified label staff and the tenant offer show. Amounts and dates stay out of it. */
    displayLabel: plain(80).refine(
      (value) => !/[$@\d]/.test(value),
      "Keep amounts, dates and contacts out of the display label.",
    ),
    family: z.enum(OFFER_MAPPING_FAMILIES),
    /** Months between charges the mapping supports; 1 is monthly. */
    frequencyMonths: z.number().int().min(1).max(12),
    applicability: z.enum(OFFER_MAPPING_APPLICABILITY),
    /** For a separate requirement only: what the separate obligation is. */
    requirement: plain(240, 3).nullable(),
    /** Who approved this mapping, where and when. */
    approval: z.object({ reference: plain(300, 3), approvedOn: calendarDate }).strict(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (
      entry.displayLabel.trim().toLowerCase() === WATER_SEWER_LABEL.toLowerCase() &&
      entry.family !== "utilities"
    )
      ctx.addIssue({
        code: "custom",
        path: ["displayLabel"],
        message: `${WATER_SEWER_LABEL} is the label for a verified water or sewer utility only.`,
      });
    if (entry.family === "separate_requirement" && !entry.requirement)
      ctx.addIssue({
        code: "custom",
        path: ["requirement"],
        message: "Say what the separate requirement is.",
      });
    if (entry.family !== "separate_requirement" && entry.requirement)
      ctx.addIssue({
        code: "custom",
        path: ["requirement"],
        message: "Only a separate requirement records a requirement.",
      });
  });
export type OfferChargeMappingEntry = z.infer<typeof OfferChargeMappingEntrySchema>;

function uniqueEntries(
  entries: readonly OfferChargeMappingEntry[],
  ctx: z.RefinementCtx,
) {
  const accounts = new Set<string>();
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    if (accounts.has(entry.accountId))
      ctx.addIssue({
        code: "custom",
        path: ["entries", index, "accountId"],
        message: `RentVine account ${entry.accountId} is mapped twice. Keep one mapping per account.`,
      });
    if (ids.has(entry.entryId))
      ctx.addIssue({
        code: "custom",
        path: ["entries", index, "entryId"],
        message: "Each mapping needs its own identity.",
      });
    accounts.add(entry.accountId);
    ids.add(entry.entryId);
  });
}

export const OfferChargeMappingRecordSchema = z
  .object({
    schemaVersion: z.literal(OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION),
    version: z.number().int().positive(),
    entries: z.array(OfferChargeMappingEntrySchema).max(100),
    note: plain(300).optional(),
    updatedAt: z.string().datetime(),
    updatedByUid: z.string().trim().min(1).max(128),
  })
  .strict()
  .superRefine((record, ctx) => uniqueEntries(record.entries, ctx));
export type OfferChargeMappingRecord = z.infer<typeof OfferChargeMappingRecordSchema>;

export const SaveOfferChargeMappingsSchema = z
  .object({
    entries: z.array(OfferChargeMappingEntrySchema).max(100),
    note: plain(300).optional(),
    /** 0 when no mappings have been saved yet. */
    expectedVersion: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
  })
  .strict()
  .superRefine((input, ctx) => uniqueEntries(input.entries, ctx));
export type SaveOfferChargeMappingsInput = z.infer<typeof SaveOfferChargeMappingsSchema>;

/** The read every consumer receives; an unreadable store maps nothing. */
export interface OfferChargeMappingsRead {
  readonly readable: boolean;
  readonly record: OfferChargeMappingRecord | null;
}
export const NO_OFFER_CHARGE_MAPPINGS: OfferChargeMappingsRead = {
  readable: true,
  record: null,
};

/** The version a consumer was built on: 0 when nothing is saved, null when unreadable. */
export function offerMappingVersion(read: OfferChargeMappingsRead): number | null {
  return read.readable ? (read.record?.version ?? 0) : null;
}

/** The one mapping for an account, or null; a duplicate (never saved) reads as a conflict. */
export function mappingForAccount(
  read: OfferChargeMappingsRead,
  accountId: string,
): OfferChargeMappingEntry | "conflict" | null {
  const matches = (read.record?.entries ?? []).filter(
    (entry) => entry.accountId === accountId,
  );
  return matches.length > 1 ? "conflict" : (matches[0] ?? null);
}

/** What one save would change, for the Admin review before the compare-and-save. */
export interface OfferChargeMappingDiff {
  readonly added: readonly OfferChargeMappingEntry[];
  readonly changed: readonly {
    readonly before: OfferChargeMappingEntry;
    readonly after: OfferChargeMappingEntry;
  }[];
  readonly removed: readonly OfferChargeMappingEntry[];
}

const sameEntry = (left: OfferChargeMappingEntry, right: OfferChargeMappingEntry) =>
  JSON.stringify(left) === JSON.stringify(right);

export function diffOfferChargeMappings(
  before: readonly OfferChargeMappingEntry[],
  after: readonly OfferChargeMappingEntry[],
): OfferChargeMappingDiff {
  const prior = new Map(before.map((entry) => [entry.entryId, entry]));
  const next = new Map(after.map((entry) => [entry.entryId, entry]));
  return {
    added: after.filter((entry) => !prior.has(entry.entryId)),
    changed: after.flatMap((entry) => {
      const earlier = prior.get(entry.entryId);
      return earlier && !sameEntry(earlier, entry)
        ? [{ before: earlier, after: entry }]
        : [];
    }),
    removed: before.filter((entry) => !next.has(entry.entryId)),
  };
}

/** One mapping in staff words, for the review and the readback. */
export function describeOfferChargeMapping(entry: OfferChargeMappingEntry): string {
  const meaning =
    entry.family === "separate_requirement"
      ? `a separate requirement (${entry.requirement})`
      : `${OFFER_MAPPING_FAMILY_LABELS[entry.family]}, ${frequencyLabel(entry.frequencyMonths).toLowerCase()}, ${OFFER_MAPPING_APPLICABILITY_LABELS[entry.applicability].toLowerCase()}`;
  return `RentVine account ${entry.accountId} (${entry.accountName}) shows as "${entry.displayLabel}": ${meaning}. Approved: ${entry.approval.reference}, ${entry.approval.approvedOn}.`;
}
