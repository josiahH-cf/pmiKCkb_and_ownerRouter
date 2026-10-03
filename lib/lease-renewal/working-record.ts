// S157/S156/S158: the lease-bound staff working record. It holds what staff know and choose to
// work with (a working current rent, working renewal terms, an operator-selected Sheet lookup),
// one independently saved field at a time. It is application information only: saving a field
// never reads or writes RentVine, the operating Sheet, Gmail or RentCast, and a working value is
// never evidence that a source changed. Source values stay visible beside it.

import { z } from "zod";

import { SHEET_FIELD_LABELS } from "@/lib/lease-renewal/sheet-writeback/field-intent";

export const RENEWAL_WORKING_RECORD_SCHEMA_VERSION = "renewal-working-record/v1";

const workingDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Enter a valid date.",
  );
const workingMoney = z
  .number()
  .finite()
  .positive()
  .max(1_000_000)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001,
    "Use cents precision.",
  );

/** One operator-selected operating-Sheet row for this lease, inside the configured workbook. */
export const WorkingSheetRowSchema = z
  .object({
    tabTitle: z.string().trim().min(1).max(200),
    rowNumber: z.number().int().min(2).max(100_000),
  })
  .strict();
export type WorkingSheetRow = z.infer<typeof WorkingSheetRowSchema>;

/** One operator-selected cell for a single existing mapped field. */
export const WorkingSheetCellSchema = z
  .object({
    tabTitle: z.string().trim().min(1).max(200),
    cell: z
      .string()
      .trim()
      .regex(/^[A-Z]{1,3}[1-9][0-9]{0,5}$/, "Enter one cell such as G42."),
  })
  .strict();
export type WorkingSheetCell = z.infer<typeof WorkingSheetCellSchema>;

export type WorkingFieldKind = "money" | "date" | "sheet_row" | "sheet_cell";

/** The fixed working fields. Sheet-cell lookups add one key per recognized Sheet field. */
export const WORKING_FIELDS = {
  current_rent: { label: "Working current rent", kind: "money" },
  terms_rent: { label: "Working renewal rent", kind: "money" },
  terms_effective_date: { label: "Working renewal effective date", kind: "date" },
  terms_end_date: { label: "Working renewal end date", kind: "date" },
  sheet_row: { label: "Selected operating Sheet row", kind: "sheet_row" },
} as const satisfies Record<string, { label: string; kind: WorkingFieldKind }>;
export type FixedWorkingField = keyof typeof WORKING_FIELDS;

export const SHEET_CELL_FIELD_PREFIX = "sheet_cell.";

/**
 * S158: a cell may be selected only for one of the existing recognized operating-Sheet business
 * fields (the same allowlist a supported field update is limited to). Identity columns, the
 * audience email fields and any invented field are not selectable.
 */
export const SHEET_CELL_FIELDS = Object.keys(SHEET_FIELD_LABELS) as readonly string[];

export type WorkingValue = number | string | WorkingSheetRow | WorkingSheetCell;

/** The working-record key that holds the selected cell for one recognized Sheet field. */
export function sheetCellWorkingField(field: string): string {
  return `${SHEET_CELL_FIELD_PREFIX}${field}`;
}

/** The recognized Sheet field a `sheet_cell.<field>` key names, or null for any other key. */
export function sheetCellFieldOf(field: string): string | null {
  if (!field.startsWith(SHEET_CELL_FIELD_PREFIX)) return null;
  const name = field.slice(SHEET_CELL_FIELD_PREFIX.length);
  return SHEET_CELL_FIELDS.includes(name) ? name : null;
}

export function workingFieldKind(field: string): WorkingFieldKind | null {
  if (field in WORKING_FIELDS) return WORKING_FIELDS[field as FixedWorkingField].kind;
  return sheetCellFieldOf(field) ? "sheet_cell" : null;
}

export function workingFieldLabel(field: string): string {
  if (field in WORKING_FIELDS) return WORKING_FIELDS[field as FixedWorkingField].label;
  const cellField = sheetCellFieldOf(field);
  const fieldLabel = cellField
    ? (SHEET_FIELD_LABELS as Record<string, string | undefined>)[cellField]
    : undefined;
  return fieldLabel
    ? `Selected operating Sheet cell for ${fieldLabel.toLowerCase()}`
    : "Selected operating Sheet cell";
}

/** Validates one field's value. A failure is that field's alone; other fields still save. */
export function parseWorkingFieldValue(
  field: string,
  value: unknown,
): { ok: true; value: WorkingValue } | { ok: false; error: string } {
  const kind = workingFieldKind(field);
  if (!kind) return { ok: false, error: "This working field is not recognized." };
  const schema =
    kind === "money"
      ? workingMoney
      : kind === "date"
        ? workingDate
        : kind === "sheet_row"
          ? WorkingSheetRowSchema
          : WorkingSheetCellSchema;
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data as WorkingValue }
    : {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "This value cannot be saved.",
      };
}

/** How a working value came to be: typed by staff, or a source value staff chose to adopt. */
export const WORKING_VALUE_ORIGINS = ["staff_entry", "adopted_source"] as const;
export type WorkingValueOrigin = (typeof WORKING_VALUE_ORIGINS)[number];

export interface WorkingFieldEntry {
  /** Null after staff deliberately cleared the working value. */
  value: WorkingValue | null;
  revision: number;
  eventId: string;
  recordedAt: string;
  recordedByUid: string;
  recordedByLabel: string;
  origin: WorkingValueOrigin;
  /** The source staff adopted the value from, when origin is adopted_source. */
  sourceLabel?: string;
  /** Optional staff context, such as a call. Never required and never inferred. */
  context?: string;
}

export interface RenewalWorkingRecord {
  schemaVersion: typeof RENEWAL_WORKING_RECORD_SCHEMA_VERSION;
  leaseId: string;
  revision: number;
  fields: Record<string, WorkingFieldEntry>;
}

export interface RenewalWorkingActivity {
  id: string;
  leaseId: string;
  field: string;
  previousValue: WorkingValue | null;
  value: WorkingValue | null;
  revision: number;
  recordedAt: string;
  recordedByUid: string;
  recordedByLabel: string;
  origin: WorkingValueOrigin;
  sourceLabel?: string;
  context?: string;
}

export function workingEntry(
  record: RenewalWorkingRecord | null | undefined,
  field: string,
): WorkingFieldEntry | null {
  return record?.fields[field] ?? null;
}

function numberValue(record: RenewalWorkingRecord | null | undefined, field: string) {
  const value = workingEntry(record, field)?.value;
  return typeof value === "number" ? value : null;
}
function dateValue(record: RenewalWorkingRecord | null | undefined, field: string) {
  const value = workingEntry(record, field)?.value;
  return typeof value === "string" ? value : null;
}

/** The working current rent staff entered or adopted, or null when none is held. */
export function workingCurrentRent(
  record: RenewalWorkingRecord | null | undefined,
): number | null {
  return numberValue(record, "current_rent");
}

export interface WorkingRenewalTerms {
  rent: number | null;
  effectiveDate: string | null;
  endDate: string | null;
  /** Highest field revision among the three; identifies the terms an exact action was bound to. */
  revision: number;
}

/** The three independently saved working terms. Any of them may still be unknown. */
export function workingRenewalTerms(
  record: RenewalWorkingRecord | null | undefined,
): WorkingRenewalTerms {
  const revision = Math.max(
    0,
    ...(["terms_rent", "terms_effective_date", "terms_end_date"] as const).map(
      (field) => workingEntry(record, field)?.revision ?? 0,
    ),
  );
  return {
    rent: numberValue(record, "terms_rent"),
    effectiveDate: dateValue(record, "terms_effective_date"),
    endDate: dateValue(record, "terms_end_date"),
    revision,
  };
}

export interface CompleteRenewalTerms {
  rent: number;
  effectiveDate: string;
  endDate: string;
}

/**
 * Complete, ordered working terms for an exact operation that consumes all three. Incomplete or
 * out-of-order terms are a missing input to that one operation, never a reason to refuse a save.
 */
export function completeWorkingTerms(
  terms: WorkingRenewalTerms,
): CompleteRenewalTerms | null {
  return terms.rent !== null &&
    terms.effectiveDate !== null &&
    terms.endDate !== null &&
    terms.endDate > terms.effectiveDate
    ? { rent: terms.rent, effectiveDate: terms.effectiveDate, endDate: terms.endDate }
    : null;
}

export function sameWorkingValue(
  left: WorkingValue | null,
  right: WorkingValue | null,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
