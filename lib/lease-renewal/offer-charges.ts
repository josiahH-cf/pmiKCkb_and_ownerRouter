// S264 (R-S264-1 through R-S264-5, R-S264-7; ARCH-S264-1/2/3/5/7): the one tenant charge
// projection.
//
// It reads the approved offer charge mappings and the dated RentVine recurring charge lines, with
// the staff selection saved on the tenant message, and resolves which lines apply on the intended
// renewal date (the Working effective date):
//
//   - a mapped line active on that date that the mapping carries forward is proposed as selected,
//     with its source; staff may leave it out (with evidence) or correct its amount or date (with
//     the correction's source);
//   - an unmapped, conflicting or unsupported line, a line whose dates cannot be resolved, and a
//     mapping that leaves the decision to staff each need an exact disposition before the offer
//     is released. Unknown is neither selected nor presumed absent;
//   - an ended, not yet started or rent-account line, and a separate requirement, stay inspectable
//     and never count;
//   - a case entry (an authorized staff entry for this lease only) is its own row with its own
//     amount, cadence, date, source and, for a one-time fee, its stated trigger. Nothing here
//     publishes a mapping, a rate or a default;
//   - a family-only entry saved before row review stays inspectable and counts only after staff
//     use it or leave it out.
//
// Every RentVine charge identity and every case entry is its own row from selection through
// totals and the exact offer text: two active rows of one family both count, and a repeated
// source identity is refused before anything is counted. Totals are exact integer cents. A
// reviewed decision whose source line, renewal date or mapping changed asks for review again and
// never silently follows the new values. Insurance and resident benefits package transitions are
// decided per case with their source, and an unknown one holds the outgoing review.
//
// Pure and client-safe: the server and the editor compute the same projection.

import { z } from "zod";
import { MESSAGE_CHARGES, type MessageCharge } from "./renewal-message-content";
import {
  frequencyLabel,
  mappingForAccount,
  offerMappingVersion,
  type OfferChargeFamily,
  type OfferChargeMappingsRead,
} from "./offer-charge-mapping";
import type {
  InsuranceTransitionDecision,
  RbpChangeDecision,
  TenantResourceDecisions,
} from "./tenant-resource-decisions";

// ---- Source lines --------------------------------------------------------------------------------

/** One RentVine recurring charge line as the projection reads it. */
export interface OfferSourceLine {
  /** The stable RentVine recurring charge id. */
  readonly chargeId: string;
  readonly accountId: string;
  readonly accountName: string | null;
  readonly description: string;
  readonly classification: "rent" | "non_rent" | "unknown";
  /** The provider's amount string, exactly as read. */
  readonly amount: string;
  /** Months between charges, exactly as read. */
  readonly frequency: string;
  /** The start date as a calendar day; null when RentVine's value is not a real date. */
  readonly startDate: string | null;
  /** The end date as a calendar day; null when open or not a real date (see `endDateRaw`). */
  readonly endDate: string | null;
  readonly endDateRaw: string | null;
  /** RentVine's recurring status: 1 is active today. */
  readonly statusId: number;
  /** The exact projection's version (a hash), so a reviewed decision knows its source. */
  readonly version: string;
}

/** The charge source a projection reads: the current lines, a failed read, or no source here. */
export type OfferChargeSource =
  | {
      readonly state: "read";
      readonly asOf: string;
      readonly lines: readonly OfferSourceLine[];
      /** The version of every non-rent line together; any added, ended or changed line moves it. */
      readonly version: string;
    }
  | { readonly state: "unavailable" }
  | { readonly state: "not_read" };

// ---- The saved selection -------------------------------------------------------------------------

const CASE_FAMILIES = [
  "pet",
  "utilities",
  "rbp",
  "insurance",
  "renewal_processing",
  "pet_processing",
] as const;
export type OfferCaseFamily = (typeof CASE_FAMILIES)[number];
export const OFFER_CASE_FAMILIES: readonly OfferCaseFamily[] = CASE_FAMILIES;
const ONE_TIME_FAMILIES: ReadonlySet<OfferChargeFamily> = new Set([
  "renewal_processing",
  "pet_processing",
]);
export function isOneTimeFamily(family: OfferChargeFamily): boolean {
  return ONE_TIME_FAMILIES.has(family);
}

const evidenceText = z
  .string()
  .trim()
  .min(3)
  .max(300)
  .refine(
    (value) => !/[\u0000-\u001f\u007f]|\{\{|\}\}/.test(value),
    "Use plain text without control characters or template tokens.",
  );
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });
const cents = z.number().int().nonnegative().max(10_000_000);

const ROW_KEY =
  /^(rentvine:[1-9]\d{0,18}|legacy:(rbp|insurance|pet|utilities|renewal_processing|pet_processing))$/;

export const OfferChargeDecisionSchema = z
  .object({
    /** The RentVine line (`rentvine:<charge id>`) or earlier family entry (`legacy:<family>`). */
    rowKey: z.string().regex(ROW_KEY),
    choice: z.enum(["include", "exclude"]),
    /** Why the line is left out (required to leave it out), or why an unclear line applies. */
    reason: evidenceText.nullable(),
    /** An evidence-backed renewal amount that differs from the RentVine line. */
    renewalAmountCents: cents.nullable(),
    /** An evidence-backed date the line applies from, when it is not the renewal date. */
    effectiveDate: calendarDate.nullable(),
    /** The source of a corrected amount or date. */
    correctionSource: evidenceText.nullable(),
    /**
     * For a line no approved mapping names: what the line is for this lease only, decided with
     * its case source (the reason). It never publishes a shared mapping.
     */
    classification: z
      .enum(["pet", "utilities", "rbp", "insurance"])
      .nullable()
      .optional(),
    /** What the decision was made against; a later change asks for review again. */
    reviewed: z
      .object({
        sourceVersion: z.string().min(1).max(128).nullable(),
        renewalDate: calendarDate.nullable(),
        mappingVersion: z.number().int().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict();
export type OfferChargeDecision = z.infer<typeof OfferChargeDecisionSchema>;

export const OfferCaseEntrySchema = z
  .object({
    id: z.string().uuid(),
    family: z.enum(CASE_FAMILIES),
    amountCents: cents.nullable(),
    effectiveDate: calendarDate.nullable(),
    /** A one-time fee's stated trigger: why this lease owes it. */
    trigger: evidenceText.nullable(),
    /** The authorized case source or approved policy reference. */
    source: evidenceText.nullable(),
  })
  .strict();
export type OfferCaseEntry = z.infer<typeof OfferCaseEntrySchema>;

export const OfferChargeSelectionSchema = z
  .object({
    decisions: z.array(OfferChargeDecisionSchema).max(60),
    caseEntries: z.array(OfferCaseEntrySchema).max(12),
    transitions: z
      .object({
        /** The case choice counts only with its source; a choice without one is pending. */
        insurance: z
          .object({
            choice: z.enum(["applies", "does_not_apply"]),
            source: evidenceText.nullable(),
          })
          .strict()
          .nullable(),
        rbp: z
          .object({
            choice: z.enum(["unchanged", "new", "changed"]),
            source: evidenceText.nullable(),
          })
          .strict()
          .nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((selection, ctx) => {
    const keys = new Set<string>();
    selection.decisions.forEach((decision, index) => {
      if (keys.has(decision.rowKey))
        ctx.addIssue({
          code: "custom",
          path: ["decisions", index, "rowKey"],
          message: "Each charge line is decided once.",
        });
      keys.add(decision.rowKey);
    });
    const ids = new Set<string>();
    selection.caseEntries.forEach((entry, index) => {
      if (ids.has(entry.id))
        ctx.addIssue({
          code: "custom",
          path: ["caseEntries", index, "id"],
          message: "Each case entry is recorded once.",
        });
      ids.add(entry.id);
    });
  });
export type OfferChargeSelection = z.infer<typeof OfferChargeSelectionSchema>;

export function emptyOfferChargeSelection(): OfferChargeSelection {
  return { decisions: [], caseEntries: [], transitions: { insurance: null, rbp: null } };
}

// ---- Money ---------------------------------------------------------------------------------------

/** Exact cents from a provider or typed amount; null for anything that is not a cents amount. */
export function moneyToCents(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    const scaled = Math.round(value * 100);
    return Math.abs(value * 100 - scaled) < 1e-6 && scaled <= 10_000_000 ? scaled : null;
  }
  if (typeof value !== "string") return null;
  const match = /^\s*\$?(\d{1,7})(?:\.(\d{1,2}))?\s*$/.exec(value.replace(/,/g, ""));
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** "$978.00", from cents, with thousands separators. */
export function formatCents(value: number): string {
  const whole = Math.floor(value / 100);
  const rest = String(value % 100).padStart(2, "0");
  return `$${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${rest}`;
}

// ---- Rows ----------------------------------------------------------------------------------------

export type OfferCadence =
  | { readonly kind: "monthly" }
  | { readonly kind: "one_time" }
  | { readonly kind: "every_months"; readonly months: number };

export function cadenceLabel(cadence: OfferCadence): string {
  return cadence.kind === "monthly"
    ? "per month"
    : cadence.kind === "one_time"
      ? "one time"
      : `every ${cadence.months} months`;
}

export type OfferRowStatus =
  /** Counts toward the offer, its totals and its text. */
  | "selected"
  /** Left out by staff with the evidence that it does not apply. */
  | "excluded"
  /** Needs an exact staff disposition before the offer is released. */
  | "needs_decision"
  /** A reviewed decision whose source line, renewal date or mapping changed since. */
  | "needs_review"
  /** Ended before the renewal date: inspectable only. */
  | "historical"
  /** Starts after the renewal date: inspectable only. */
  | "future"
  /** A rent-account line: part of the base rent, never an offer charge. */
  | "rent"
  /** Mapped as a separate requirement: never an offer charge. */
  | "separate";

export type OfferRowOrigin = "rentvine" | "case" | "legacy";

export interface OfferChargeRow {
  readonly rowKey: string;
  readonly origin: OfferRowOrigin;
  readonly family: OfferChargeFamily | null;
  /** The verified label staff and the tenant offer show. */
  readonly label: string;
  /** Where the row comes from, in staff words. */
  readonly sourceLabel: string;
  /** The stable reference the message cites. */
  readonly sourceRef: string;
  readonly sourceVersion: string | null;
  /** The renewal amount: the RentVine amount, or its evidence-backed correction. */
  readonly amountCents: number | null;
  /** The RentVine line's own amount, when it has one. */
  readonly sourceAmountCents: number | null;
  readonly cadence: OfferCadence | null;
  /** The date the row applies from in the renewal. */
  readonly effectiveFrom: string | null;
  readonly sourceStart: string | null;
  readonly sourceEnd: string | null;
  readonly comparison: "unchanged" | "changed" | "new" | null;
  readonly status: OfferRowStatus;
  /** Why the row needs a decision, or what a selected row still misses. */
  readonly gaps: readonly string[];
  readonly decision: OfferChargeDecision | null;
  /** The choices the review offers for this row. */
  readonly choices: readonly ("include" | "exclude")[];
  /** A one-time fee's stated trigger. */
  readonly trigger: string | null;
  /** The mapping's separate requirement, when it is one. */
  readonly requirement: string | null;
  readonly mappingEntryId: string | null;
  /** True when this row decides whether the offer can be released. */
  readonly material: boolean;
}

export interface OfferTotalLine {
  readonly rowKey: string;
  readonly label: string;
  readonly amountCents: number | null;
}

export interface OfferChargeTotals {
  readonly baseCents: number | null;
  /** Each applicable monthly line, in order. */
  readonly monthlyLines: readonly OfferTotalLine[];
  /** Base plus every monthly line whose amount is known. */
  readonly monthlyKnownCents: number;
  /** True only when the base and every monthly line are known and nothing needed is pending. */
  readonly monthlyComplete: boolean;
  /** Recurring lines on another cadence, never added to the monthly total. */
  readonly otherRecurring: readonly (OfferTotalLine & { readonly months: number })[];
  readonly oneTimeLines: readonly OfferTotalLine[];
  readonly oneTimeKnownCents: number;
  readonly oneTimeComplete: boolean;
  /** What keeps a total incomplete, in staff words. */
  readonly gaps: readonly string[];
}

export interface OfferCompositionLine {
  readonly rowKey: string;
  readonly label: string;
  readonly amountCents: number | null;
  readonly cadence: OfferCadence | null;
  readonly effectiveDate: string | null;
  readonly comparison: "unchanged" | "changed" | "new" | null;
  readonly source: string;
}

/** What the tenant message composes from the projection. */
export interface OfferChargeComposition {
  /** The lines the offer itemizes, in order. */
  readonly lines: readonly OfferCompositionLine[];
  /** True only when the compared lines support "All other charges stay the same." */
  readonly unchangedStatement: boolean;
  readonly statementSource: string | null;
  /** Holds on the outgoing review, each with the control that resolves it. */
  readonly notes: readonly { readonly field: string; readonly message: string }[];
}

export interface OfferTransitionState<T extends string> {
  /** True when this offer has to decide the transition. */
  readonly relevant: boolean;
  readonly choice: T | null;
  readonly source: string | null;
}

export interface OfferChargeReview {
  readonly source: OfferChargeSource["state"];
  readonly renewalDate: string | null;
  readonly mappingVersion: number | null;
  readonly rows: readonly OfferChargeRow[];
  /** The first unresolved line, or the transition question, staff should resolve first. */
  readonly lead: { readonly rowKey: string | null; readonly text: string } | null;
  readonly totals: OfferChargeTotals;
  readonly composition: OfferChargeComposition;
  /** The decisions S265's resource requirements follow. */
  readonly decisions: TenantResourceDecisions;
  readonly transitions: {
    readonly insurance: OfferTransitionState<"applies" | "does_not_apply">;
    readonly rbp: OfferTransitionState<"unchanged" | "new" | "changed">;
  };
  /** Holds the outgoing review waits on (each also a composition note). */
  readonly holds: readonly string[];
  /** Earlier insurance or unchanged choices saved before row review, shown as they were. */
  readonly legacyNotes: readonly string[];
}

export interface OfferChargeProjectionInput {
  readonly leaseId: string;
  readonly source: OfferChargeSource;
  readonly mappings: OfferChargeMappingsRead;
  readonly selection: OfferChargeSelection | null;
  /** The Working renewal terms: the base and the intended renewal date. */
  readonly terms: {
    readonly rent: number | null;
    readonly effectiveDate: string | null;
  } | null;
  /** Family-only entries saved before row review, kept for inspection. */
  readonly legacyCharges?: readonly MessageCharge[];
  readonly legacyInsuranceTransition?: { applicable: boolean; source: string } | null;
  readonly legacyOtherChargesComparison?: { unchanged: boolean; source: string } | null;
  /** True when the saved selection could not be read: the review holds. */
  readonly selectionUnreadable?: boolean;
}

// ---- Field names the message routes to the review's own controls ----------------------------------

export const OFFER_CHARGE_FIELDS = {
  review: "offerCharges",
  source: "offerCharges.source",
  renewalDate: "offerCharges.renewalDate",
  insurance: "offerCharges.insuranceTransition",
  rbp: "offerCharges.rbpChange",
  row: (rowKey: string) => `offerCharge.${rowKey}`,
} as const;

/** The DOM id of one row's control in Review offer charges. */
export function offerChargeRowControlId(rowKey: string): string {
  return `renewal-offer-charge-${rowKey.replace(/[^a-z0-9]+/gi, "-")}`;
}

// ---- The projection ------------------------------------------------------------------------------

const PROVIDER_ACTIVE = 1;

function cadenceFromFrequency(frequency: string): OfferCadence | null {
  if (!/^\d{1,2}$/.test(frequency.trim())) return null;
  const months = Number(frequency);
  if (months < 1 || months > 12) return null;
  return months === 1 ? { kind: "monthly" } : { kind: "every_months", months };
}

function cadenceMonths(cadence: OfferCadence): number | null {
  return cadence.kind === "monthly"
    ? 1
    : cadence.kind === "every_months"
      ? cadence.months
      : null;
}

function rentvineRef(leaseId: string, chargeId: string) {
  return `rentvine:lease:${leaseId}:recurring-charge:${chargeId}`;
}

function lineSourceLabel(line: OfferSourceLine): string {
  const account = line.accountName
    ? `account ${line.accountName}`
    : `account ${line.accountId}`;
  return `RentVine recurring charge ${line.chargeId}, ${account}${line.description ? ` (${line.description})` : ""}`;
}

type DateRelation =
  | { kind: "applies" }
  | { kind: "historical" }
  | { kind: "future" }
  | { kind: "unknown"; why: string };

function dateRelation(line: OfferSourceLine, renewalDate: string | null): DateRelation {
  if (!line.startDate)
    return {
      kind: "unknown",
      why: "RentVine's start date for this line is not a real date.",
    };
  if (line.endDateRaw !== null && line.endDate === null)
    return {
      kind: "unknown",
      why: "RentVine's end date for this line is not a real date.",
    };
  if (!renewalDate)
    return {
      kind: "unknown",
      why: "Enter the renewal start date in Working renewal terms to decide whether this line applies.",
    };
  if (line.endDate !== null && line.endDate < renewalDate) return { kind: "historical" };
  if (line.startDate > renewalDate) return { kind: "future" };
  if (line.endDate !== null && line.endDate === renewalDate)
    return {
      kind: "unknown",
      why: "This line ends on the renewal start date, so whether it still applies is not clear.",
    };
  if (line.statusId !== PROVIDER_ACTIVE)
    return {
      kind: "unknown",
      why: "RentVine marks this line inactive while its dates cover the renewal start date.",
    };
  return { kind: "applies" };
}

function staleReason(
  decision: OfferChargeDecision,
  current: {
    sourceVersion: string | null;
    renewalDate: string | null;
    mappingVersion: number | null;
  },
  mapped: boolean,
): string | null {
  if (decision.reviewed.sourceVersion !== current.sourceVersion)
    return "RentVine changed this line after it was reviewed. Review it again.";
  if (decision.reviewed.renewalDate !== current.renewalDate)
    return "The renewal start date changed after this line was reviewed. Review it again.";
  if (mapped && decision.reviewed.mappingVersion !== current.mappingVersion)
    return "The offer charge mapping changed after this line was reviewed. Review it again.";
  return null;
}

interface RowDraft {
  row: OfferChargeRow;
  order: number;
}

/** The one projection every consumer reads. */
export function projectOfferCharges(
  input: OfferChargeProjectionInput,
): OfferChargeReview {
  const selection = input.selection ?? emptyOfferChargeSelection();
  const renewalDate = input.terms?.effectiveDate ?? null;
  const mappingVersion = offerMappingVersion(input.mappings);
  const decisions = new Map(selection.decisions.map((entry) => [entry.rowKey, entry]));
  const drafts: RowDraft[] = [];
  const holds: string[] = [];
  const legacyNotes: string[] = [];
  const push = (row: OfferChargeRow, order: number) => drafts.push({ row, order });

  // RentVine lines. A repeated charge identity is refused before anything is counted.
  const lines = input.source.state === "read" ? input.source.lines : [];
  const seen = new Map<string, number>();
  for (const line of lines) seen.set(line.chargeId, (seen.get(line.chargeId) ?? 0) + 1);
  // A repeated identity is one refused row: each row keeps one identity end to end.
  const emitted = new Set<string>();
  for (const line of lines) {
    if (emitted.has(line.chargeId)) continue;
    emitted.add(line.chargeId);
    const rowKey = `rentvine:${line.chargeId}`;
    const sourceAmountCents = moneyToCents(line.amount);
    const sourceCadence = cadenceFromFrequency(line.frequency);
    const base = {
      rowKey,
      origin: "rentvine" as const,
      sourceLabel: lineSourceLabel(line),
      sourceRef: rentvineRef(input.leaseId, line.chargeId),
      sourceVersion: line.version,
      sourceAmountCents,
      sourceStart: line.startDate,
      sourceEnd: line.endDate,
      trigger: null,
      requirement: null,
    };
    const fallbackLabel =
      line.accountName ?? line.description ?? `Account ${line.accountId}`;
    if (line.classification === "rent") {
      push(
        {
          ...base,
          family: null,
          label: fallbackLabel,
          amountCents: sourceAmountCents,
          cadence: sourceCadence,
          effectiveFrom: null,
          comparison: null,
          status: "rent",
          gaps: [],
          decision: null,
          choices: [],
          mappingEntryId: null,
          material: false,
        },
        90,
      );
      continue;
    }
    const decision = decisions.get(rowKey) ?? null;
    const relation = dateRelation(line, renewalDate);
    const mapping = mappingForAccount(input.mappings, line.accountId);
    const mapped = mapping !== null && mapping !== "conflict";
    const family =
      mapped && mapping.family !== "separate_requirement" ? mapping.family : null;
    const label = mapped ? mapping.displayLabel : fallbackLabel;
    const common = {
      ...base,
      family,
      label,
      cadence: sourceCadence,
      mappingEntryId: mapped ? mapping.entryId : null,
    };
    if (relation.kind === "historical" || relation.kind === "future") {
      push(
        {
          ...common,
          amountCents: sourceAmountCents,
          effectiveFrom: null,
          comparison: null,
          status: relation.kind,
          gaps: [],
          decision: null,
          choices: [],
          material: false,
        },
        relation.kind === "historical" ? 80 : 85,
      );
      continue;
    }
    if (mapped && mapping.family === "separate_requirement") {
      push(
        {
          ...common,
          requirement: mapping.requirement,
          amountCents: sourceAmountCents,
          effectiveFrom: null,
          comparison: null,
          status: "separate",
          gaps: [],
          decision: null,
          choices: [],
          material: false,
        },
        88,
      );
      continue;
    }
    // What keeps this line from being proposed, before any staff decision.
    const problems: string[] = [];
    if ((seen.get(line.chargeId) ?? 0) > 1)
      problems.push("RentVine lists this charge more than once, so no copy is counted.");
    if (!input.mappings.readable)
      problems.push(
        "The offer charge mappings could not be read. Reload before deciding this line.",
      );
    else if (mapping === "conflict")
      problems.push(
        "Two mappings name this account. An Admin keeps one in Offer charge mappings.",
      );
    else if (!mapping)
      problems.push(
        line.classification === "unknown"
          ? "RentVine does not say whether this account is rent, and no approved offer mapping names it."
          : `No approved offer mapping names RentVine account ${line.accountId}. An Admin adds one in Offer charge mappings, or decide it for this lease: say what it is and why it applies, or leave it out with its reason.`,
      );
    if (sourceAmountCents === null)
      problems.push("The RentVine amount for this line is not a valid amount.");
    if (!sourceCadence)
      problems.push("The RentVine frequency for this line is not a supported cadence.");
    else if (mapped && cadenceMonths(sourceCadence) !== mapping.frequencyMonths)
      problems.push(
        `The mapping supports ${frequencyLabel(mapping.frequencyMonths).toLowerCase()}, and this line is charged ${cadenceLabel(sourceCadence)}.`,
      );
    if (relation.kind === "unknown") problems.push(relation.why);
    if (mapped && mapping.applicability === "staff_decide" && problems.length === 0)
      problems.push(
        "The mapping leaves this line to staff. Choose whether it applies to this renewal.",
      );
    const current = { sourceVersion: line.version, renewalDate, mappingVersion };
    const stale = decision ? staleReason(decision, current, mapped) : null;
    // A refused line (repeated identity, unreadable mappings) can only be left out.
    const refused =
      (seen.get(line.chargeId) ?? 0) > 1 ||
      !input.mappings.readable ||
      mapping === "conflict";
    // An unmapped line may be classified for this lease only, with its case source.
    const classifiable = !refused && mapping === null;
    const includable =
      !refused &&
      (mapped || classifiable) &&
      sourceAmountCents !== null &&
      sourceCadence !== null;
    const choices: ("include" | "exclude")[] = includable
      ? ["include", "exclude"]
      : ["exclude"];
    const proposed = includable && problems.length === 0;
    const blank = {
      ...common,
      amountCents: sourceAmountCents,
      effectiveFrom: renewalDate,
      choices,
    };
    if (decision && stale) {
      push(
        {
          ...blank,
          comparison: null,
          status: "needs_review",
          gaps: [stale],
          decision,
          material: true,
        },
        10,
      );
      continue;
    }
    if (decision?.choice === "exclude") {
      push(
        {
          ...blank,
          comparison: null,
          status: decision.reason ? "excluded" : "needs_decision",
          gaps: decision.reason
            ? []
            : ["Say why this line does not apply to the renewal."],
          decision,
          material: !decision.reason,
        },
        decision.reason ? 70 : 10,
      );
      continue;
    }
    if (decision?.choice === "include" && includable) {
      // An unclear line counts only with the staff's reason that it applies.
      const unclear = !proposed;
      const corrected =
        decision.renewalAmountCents !== null &&
        decision.renewalAmountCents !== sourceAmountCents;
      const redated =
        decision.effectiveDate !== null && decision.effectiveDate !== renewalDate;
      const gaps: string[] = [];
      const classification = mapped ? null : (decision.classification ?? null);
      if (!mapped && !classification)
        gaps.push("Choose what this charge is for this lease.");
      if (unclear && !decision.reason)
        gaps.push("Say why this line applies to the renewal, with its source.");
      if ((corrected || redated) && !decision.correctionSource)
        gaps.push("Name the source of the corrected amount or date.");
      if (!(decision.effectiveDate ?? renewalDate))
        gaps.push("Enter the renewal start date in Working renewal terms.");
      push(
        {
          ...blank,
          ...(classification
            ? { family: classification, label: MESSAGE_CHARGES[classification] }
            : {}),
          amountCents: corrected ? decision.renewalAmountCents : sourceAmountCents,
          effectiveFrom: decision.effectiveDate ?? renewalDate,
          comparison: corrected || redated ? "changed" : "unchanged",
          status: "selected",
          gaps,
          decision,
          material: true,
        },
        corrected || redated ? 40 : 30,
      );
      continue;
    }
    if (proposed) {
      push(
        {
          ...blank,
          comparison: "unchanged",
          status: "selected",
          gaps: [],
          decision: null,
          material: true,
        },
        30,
      );
      continue;
    }
    push(
      {
        ...blank,
        comparison: null,
        status: "needs_decision",
        gaps: problems,
        decision,
        material: true,
      },
      10,
    );
  }

  // Family-only entries saved before row review: inspectable, counted only after a disposition.
  for (const legacy of input.legacyCharges ?? []) {
    if (legacy.applicable !== true) continue;
    const rowKey = `legacy:${legacy.id}`;
    const decision = decisions.get(rowKey) ?? null;
    const label = MESSAGE_CHARGES[legacy.id];
    const cadence: OfferCadence | null =
      legacy.cadence === "monthly"
        ? { kind: "monthly" }
        : legacy.cadence === "one_time"
          ? { kind: "one_time" }
          : null;
    const amountCents = legacy.amount === null ? null : moneyToCents(legacy.amount);
    const base = {
      rowKey,
      origin: "legacy" as const,
      family: legacy.id as OfferChargeFamily,
      label,
      sourceLabel: `Earlier entry on this message: ${legacy.source ?? "Staff entry on the message"}`,
      sourceRef: legacy.source ?? "Staff entry on the message",
      sourceVersion: null,
      amountCents,
      sourceAmountCents: amountCents,
      cadence,
      effectiveFrom: legacy.effectiveDate,
      sourceStart: null,
      sourceEnd: null,
      trigger: null,
      requirement: null,
      mappingEntryId: null,
      choices: ["include", "exclude"] as ("include" | "exclude")[],
    };
    if (decision?.choice === "include") {
      const gaps: string[] = [];
      if (amountCents === null) gaps.push(`${label}: the amount is not entered yet.`);
      if (!cadence) gaps.push(`${label}: monthly or one time is not chosen yet.`);
      if (!legacy.effectiveDate)
        gaps.push(`${label}: the start date is not entered yet.`);
      push(
        {
          ...base,
          comparison:
            legacy.comparison === "unverified"
              ? null
              : (legacy.comparison as "new" | "changed" | "unchanged"),
          status: "selected",
          gaps,
          decision,
          material: true,
        },
        cadence?.kind === "one_time" ? 50 : 40,
      );
    } else if (decision?.choice === "exclude" && decision.reason) {
      push(
        {
          ...base,
          comparison: null,
          status: "excluded",
          gaps: [],
          decision,
          material: false,
        },
        70,
      );
    } else {
      push(
        {
          ...base,
          comparison: null,
          status: "needs_decision",
          gaps: [
            "This entry was saved before each charge became its own line. Use it for this offer or leave it out.",
          ],
          decision,
          material: true,
        },
        10,
      );
    }
  }
  if (input.legacyInsuranceTransition)
    legacyNotes.push(
      `Earlier insurance transition entry: ${input.legacyInsuranceTransition.applicable ? "applies" : "does not apply"} (${input.legacyInsuranceTransition.source}).`,
    );
  if (input.legacyOtherChargesComparison)
    legacyNotes.push(
      `Earlier remaining-charges entry: ${input.legacyOtherChargesComparison.unchanged ? "unchanged" : "changes apply"} (${input.legacyOtherChargesComparison.source}). The offer now states only what its compared lines support.`,
    );

  // Case entries: authorized staff entries for this lease only.
  for (const entry of selection.caseEntries) {
    const label = MESSAGE_CHARGES[entry.family];
    const oneTime = isOneTimeFamily(entry.family);
    const gaps: string[] = [];
    if (entry.amountCents === null) gaps.push(`${label}: enter the exact amount.`);
    if (!entry.effectiveDate) gaps.push(`${label}: enter the date it applies from.`);
    if (!entry.source)
      gaps.push(`${label}: name the authorized case source or approved policy.`);
    if (oneTime && !entry.trigger) gaps.push(`${label}: state what triggers this fee.`);
    push(
      {
        rowKey: `case:${entry.id}`,
        origin: "case",
        family: entry.family,
        label,
        sourceLabel: entry.source
          ? `Case entry: ${entry.source}`
          : "Case entry without a source yet",
        sourceRef: entry.source ?? "Case entry",
        sourceVersion: null,
        amountCents: entry.amountCents,
        sourceAmountCents: null,
        cadence: oneTime ? { kind: "one_time" } : { kind: "monthly" },
        effectiveFrom: entry.effectiveDate,
        sourceStart: null,
        sourceEnd: null,
        comparison: "new",
        status: "selected",
        gaps,
        decision: null,
        choices: [],
        trigger: entry.trigger,
        requirement: null,
        mappingEntryId: null,
        material: true,
      },
      oneTime ? 60 : 45,
    );
  }

  const rows = drafts
    .map((draft, index) => ({ ...draft, index }))
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .map((draft) => draft.row);
  const selected = rows.filter((row) => row.status === "selected");
  const unresolved = rows.filter(
    (row) =>
      row.status === "needs_decision" ||
      row.status === "needs_review" ||
      (row.status === "selected" && row.gaps.length > 0),
  );

  // Transitions (R-S264-7): decided per case with their source.
  const insuranceRelevant =
    selected.some((row) => row.family === "insurance") ||
    rows.some(
      (row) =>
        row.origin === "rentvine" &&
        row.family === "insurance" &&
        (row.status === "selected" ||
          row.status === "excluded" ||
          row.status === "needs_decision" ||
          row.status === "needs_review"),
    );
  const rbpRelevant = selected.some((row) => row.family === "rbp");
  const insuranceChoice = insuranceRelevant
    ? (selection.transitions.insurance ?? null)
    : null;
  const rbpChoice = rbpRelevant ? (selection.transitions.rbp ?? null) : null;
  // A choice without its source stays unknown: source pending holds the review.
  const insuranceDecision: InsuranceTransitionDecision | null = insuranceRelevant
    ? insuranceChoice?.source
      ? insuranceChoice.choice
      : "unknown"
    : null;
  const rbpDecision: RbpChangeDecision | null = rbpRelevant
    ? rbpChoice?.source
      ? rbpChoice.choice
      : "unknown"
    : null;

  // Totals in exact cents (R-S264-3).
  const baseCents =
    input.terms?.rent === null || input.terms?.rent === undefined
      ? null
      : moneyToCents(input.terms.rent);
  const totalGaps: string[] = [];
  if (baseCents === null) totalGaps.push("The renewal base rent is not entered yet.");
  const monthlyLines: OfferTotalLine[] = [];
  const otherRecurring: (OfferTotalLine & { months: number })[] = [];
  const oneTimeLines: OfferTotalLine[] = [];
  for (const row of selected) {
    const line = { rowKey: row.rowKey, label: row.label, amountCents: row.amountCents };
    if (row.amountCents === null)
      totalGaps.push(`${row.label}: the amount is not known yet.`);
    if (!row.cadence) totalGaps.push(`${row.label}: its cadence is not known yet.`);
    else if (row.cadence.kind === "monthly") monthlyLines.push(line);
    else if (row.cadence.kind === "one_time") oneTimeLines.push(line);
    else otherRecurring.push({ ...line, months: row.cadence.months });
  }
  // A line still waiting for a decision or for its evidence keeps every total incomplete.
  const pendingNeeded = unresolved.length > 0;
  if (pendingNeeded)
    totalGaps.push("A charge line still needs a decision, so the totals may change.");
  if (input.source.state === "unavailable")
    totalGaps.push(
      "The RentVine charges could not be read, so other charges are not known.",
    );
  const known = (values: readonly OfferTotalLine[]) =>
    values.reduce((sum, value) => sum + (value.amountCents ?? 0), 0);
  const cadenceMissing = selected.some((row) => !row.cadence);
  const monthlyComplete =
    baseCents !== null &&
    monthlyLines.every((line) => line.amountCents !== null) &&
    !cadenceMissing &&
    !pendingNeeded &&
    input.source.state !== "unavailable";
  const oneTimeComplete =
    oneTimeLines.every((line) => line.amountCents !== null) &&
    !cadenceMissing &&
    !pendingNeeded &&
    input.source.state !== "unavailable";
  const totals: OfferChargeTotals = {
    baseCents,
    monthlyLines,
    monthlyKnownCents: (baseCents ?? 0) + known(monthlyLines),
    monthlyComplete,
    otherRecurring,
    oneTimeLines,
    oneTimeKnownCents: known(oneTimeLines),
    oneTimeComplete,
    gaps: [...new Set(totalGaps)],
  };

  // Holds (each also a composition note routed to its control).
  const notes: { field: string; message: string }[] = [];
  const hold = (field: string, message: string) => {
    if (!notes.some((note) => note.field === field && note.message === message))
      notes.push({ field, message });
    if (!holds.includes(message)) holds.push(message);
  };
  if (input.selectionUnreadable)
    hold(
      OFFER_CHARGE_FIELDS.review,
      "The saved charge review could not be read. Reload before releasing this offer.",
    );
  if (input.source.state === "unavailable")
    hold(
      OFFER_CHARGE_FIELDS.source,
      "The current RentVine charges could not be read. Refresh this lease and review offer charges before releasing this offer.",
    );
  if (!renewalDate && rows.some((row) => row.origin === "rentvine" && row.material))
    hold(
      OFFER_CHARGE_FIELDS.renewalDate,
      "Enter the renewal start date in Working renewal terms; it decides which RentVine charges apply.",
    );
  for (const row of unresolved)
    hold(
      OFFER_CHARGE_FIELDS.row(row.rowKey),
      `Review offer charges: ${row.label}. ${row.gaps[0] ?? "Choose whether it applies."}`,
    );

  // The unchanged statement (R-S264-4): only when every current line was compared and continues,
  // so the lines the offer itemizes are the only changes. A line left out, a line still pending
  // or a line that starts during the renewal means some charge does not stay the same.
  const currentRentvine = rows.filter(
    (row) =>
      row.origin === "rentvine" &&
      (row.status === "selected" ||
        row.status === "excluded" ||
        row.status === "needs_decision" ||
        row.status === "needs_review"),
  );
  const statementSupported =
    input.source.state === "read" &&
    unresolved.length === 0 &&
    !input.selectionUnreadable &&
    currentRentvine.length > 0 &&
    currentRentvine.every(
      (row) => row.status === "selected" && row.comparison !== null,
    ) &&
    !rows.some((row) => row.status === "future") &&
    selected.every((row) => row.cadence !== null);
  const itemized = selected.filter(
    (row) =>
      !statementSupported ||
      row.comparison !== "unchanged" ||
      row.origin !== "rentvine" ||
      row.cadence?.kind === "one_time",
  );
  const composition: OfferChargeComposition = {
    lines: itemized.map((row) => ({
      rowKey: row.rowKey,
      label: row.label,
      amountCents: row.amountCents,
      cadence: row.cadence,
      effectiveDate: row.effectiveFrom,
      comparison: row.comparison,
      source: row.sourceRef,
    })),
    unchangedStatement: statementSupported,
    statementSource:
      statementSupported && input.source.state === "read"
        ? `RentVine recurring charges read ${input.source.asOf}, compared line by line`
        : null,
    notes,
  };

  // The lead: the first unresolved line that needs staff entry, else the transition question.
  const firstRow = unresolved[0] ?? null;
  const lead = firstRow
    ? {
        rowKey: firstRow.rowKey,
        text: `${firstRow.label}: ${firstRow.gaps[0] ?? "choose whether it applies."}`,
      }
    : insuranceDecision === "unknown"
      ? {
          rowKey: null,
          text: "Choose whether the insurance transition applies to this renewal, with its source.",
        }
      : rbpDecision === "unknown"
        ? {
            rowKey: null,
            text: "Choose whether the Resident Benefits Package is new, changed or unchanged, with its source.",
          }
        : null;

  return {
    source: input.source.state,
    renewalDate,
    mappingVersion,
    rows,
    lead,
    totals,
    composition,
    decisions: {
      insuranceTransition: insuranceDecision,
      rbpChange: rbpDecision,
      informationForm: "when_usable",
    },
    transitions: {
      insurance: {
        relevant: insuranceRelevant,
        choice: insuranceChoice?.choice ?? null,
        source: insuranceChoice?.source ?? null,
      },
      rbp: {
        relevant: rbpRelevant,
        choice: rbpChoice?.choice ?? null,
        source: rbpChoice?.source ?? null,
      },
    },
    holds: [
      ...holds,
      ...(insuranceDecision === "unknown"
        ? [
            "Choose whether the insurance transition applies to this renewal, with its source, before releasing this offer.",
          ]
        : []),
      ...(rbpDecision === "unknown"
        ? [
            "Choose whether the Resident Benefits Package is new, changed or unchanged, with its source, before releasing this offer.",
          ]
        : []),
    ],
    legacyNotes,
  };
}

/** The decision a review records for a row now: the row's current source, date and mapping. */
export function reviewedStampFor(
  review: Pick<OfferChargeReview, "renewalDate" | "mappingVersion">,
  row: Pick<OfferChargeRow, "sourceVersion">,
): OfferChargeDecision["reviewed"] {
  return {
    sourceVersion: row.sourceVersion,
    renewalDate: review.renewalDate,
    mappingVersion: review.mappingVersion,
  };
}

/** Staff words for a total line: "$978.00" or "Known monthly subtotal: $933.00". */
export function describeMonthlyTotal(totals: OfferChargeTotals): string {
  return totals.monthlyComplete
    ? `Monthly total: ${formatCents(totals.monthlyKnownCents)}`
    : `Known monthly subtotal: ${formatCents(totals.monthlyKnownCents)}. Not complete yet.`;
}
export function describeOneTimeTotal(totals: OfferChargeTotals): string {
  if (totals.oneTimeLines.length === 0) return "One-time fees: none selected";
  return totals.oneTimeComplete
    ? `One-time total: ${formatCents(totals.oneTimeKnownCents)}`
    : `Known one-time subtotal: ${formatCents(totals.oneTimeKnownCents)}. Not complete yet.`;
}
