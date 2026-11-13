// S280 R-S280-6 (ARCH-S280-4): the one rule for a difference between RentVine and the operating
// Sheet in the current rent or the lease dates.
//
// D-OP-7, as the owner extended it on November 12, 2026: RentVine is the basis for the current rent
// and the lease dates on every screen. When RentVine has a readable value and the operating Sheet
// holds a different one, the difference is information, never a decision. A decision is still
// raised when RentVine has no readable value, when a staff working value differs from RentVine,
// when the sources are not exactly RentVine and the operating Sheet, and for every other field
// (whose precedence stays unconfirmed).
//
// Pure, deterministic and client-safe. It classifies; it never applies a value, writes either source
// or chooses a winner. The reconciliation pipeline (Live renewal review, and through it the
// Dashboard's "Waiting on you" and the Approval Queue) and the lease's numbers check all read this
// one result.

import { formatCalendarDate } from "@/lib/date-display";
import {
  FIELD_TYPE_OF_FIELD,
  PRECEDENCE_TABLE,
} from "@/lib/lease-renewal/field-reconciliation-rules";
import { toRentAmount } from "@/lib/lease-renewal/rent";

/** The precedence id of a RentVine read candidate. */
export const RENTVINE_SOURCE_ID = "rentvine";
/** The precedence id of the operating Sheet's renewal tab candidate. */
export const OPERATING_SHEET_SOURCE_ID = "sheet_tab3";

/** What kind of value a RentVine-basis field holds. */
export type RentVineBasisValueKind = "rent" | "date";

const VALUE_KIND_BY_FIELD_TYPE: Readonly<Record<string, RentVineBasisValueKind>> = {
  current_rent: "rent",
  lease_dates_renewal_timing: "date",
};

/**
 * The value kind of a field whose precedence the owner confirmed with RentVine first, or null for
 * every other field. Reads the precedence table, so the rule follows the recorded confirmation.
 */
export function rentVineBasisValueKind(fieldKey: string): RentVineBasisValueKind | null {
  const fieldType = FIELD_TYPE_OF_FIELD[fieldKey];
  if (!fieldType) return null;
  const rule = PRECEDENCE_TABLE[fieldType];
  if (!rule?.confirmed || rule.order[0] !== RENTVINE_SOURCE_ID) return null;
  return VALUE_KIND_BY_FIELD_TYPE[fieldType] ?? null;
}

export interface SourceDifferenceCandidate {
  readonly source: string;
  readonly value: string | number | boolean | null;
}

export type SourceDifferenceDecisionReason =
  /** RentVine holds no readable value for the field. */
  | "rentvine_unreadable"
  /** The operating Sheet's value cannot be read as an amount or a date. */
  | "sheet_unreadable"
  /** A staff working value differs from RentVine. */
  | "working_value_differs"
  /** A source other than RentVine and the operating Sheet holds a value. */
  | "other_sources"
  /** The field's precedence is not confirmed (every field but the rent and the lease dates). */
  | "unconfirmed_field";

export interface SourceDifferenceInformation {
  readonly kind: "information";
  readonly fieldKey: string;
  readonly valueKind: RentVineBasisValueKind;
  /** Rent: the amount; date: the ISO day. */
  readonly sheetValue: number | string;
  readonly rentvineValue: number | string;
}

export type SourceDifferenceClass =
  /** Nothing to classify: the values agree, or the operating Sheet holds no value. */
  | { readonly kind: "none" }
  | SourceDifferenceInformation
  | { readonly kind: "decision"; readonly reason: SourceDifferenceDecisionReason };

export interface SourceDifferenceInput {
  readonly fieldKey: string;
  readonly candidates: readonly SourceDifferenceCandidate[];
  /** A staff working value for the field, when one is saved. */
  readonly workingValue?: string | number | null;
}

function present(candidate: SourceDifferenceCandidate): boolean {
  return candidate.value !== null && String(candidate.value).trim() !== "";
}

function comparable(value: SourceDifferenceCandidate["value"]): string {
  if (typeof value === "string") return value.trim().toLowerCase().replace(/\s+/g, " ");
  return String(value);
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_DAY = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;

/** A calendar day as YYYY-MM-DD, or null. Accepts ISO days and M/D/YYYY. */
export function sourceDifferenceDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, 10);
  let year: number, month: number, day: number;
  const iso = ISO_DAY.exec(text);
  const us = iso ? null : US_DAY.exec(value.trim());
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (us) {
    month = Number(us[1]);
    day = Number(us[2]);
    year = Number(us[3].length === 2 ? `20${us[3]}` : us[3]);
  } else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function readable(kind: RentVineBasisValueKind, value: unknown): number | string | null {
  if (kind === "rent") {
    const amount = toRentAmount(value);
    return amount !== null && amount > 0 ? amount : null;
  }
  return sourceDifferenceDay(value);
}

function same(
  kind: RentVineBasisValueKind,
  left: number | string,
  right: number | string,
) {
  return kind === "rent"
    ? Math.abs(Number(left) - Number(right)) < 0.005
    : String(left) === String(right);
}

/**
 * ARCH-S280-4: classify one field's candidates. Information only for a confirmed RentVine-basis
 * field (the current rent or the lease dates) whose candidates are exactly one readable RentVine
 * value and one operating Sheet value that differ, with no staff working value differing from
 * RentVine. Everything else that differs stays a decision.
 */
export function classifyRentVineSheetDifference(
  input: SourceDifferenceInput,
): SourceDifferenceClass {
  const values = input.candidates.filter(present);
  const sheet = values.filter(
    (candidate) => candidate.source === OPERATING_SHEET_SOURCE_ID,
  );
  const rentvine = values.filter((candidate) => candidate.source === RENTVINE_SOURCE_ID);
  const others = values.filter(
    (candidate) =>
      candidate.source !== OPERATING_SHEET_SOURCE_ID &&
      candidate.source !== RENTVINE_SOURCE_ID,
  );
  const differs =
    values.length > 1 &&
    values.some(
      (candidate) => comparable(candidate.value) !== comparable(values[0].value),
    );

  const kind = rentVineBasisValueKind(input.fieldKey);
  if (!kind)
    return differs ? { kind: "decision", reason: "unconfirmed_field" } : { kind: "none" };
  if (sheet.length === 0) return { kind: "none" };
  if (others.length > 0)
    return differs ? { kind: "decision", reason: "other_sources" } : { kind: "none" };
  if (rentvine.length !== 1 || sheet.length !== 1)
    return { kind: "decision", reason: "rentvine_unreadable" };
  const rentvineValue = readable(kind, rentvine[0].value);
  if (rentvineValue === null) return { kind: "decision", reason: "rentvine_unreadable" };
  const sheetValue = readable(kind, sheet[0].value);
  if (sheetValue === null) return { kind: "decision", reason: "sheet_unreadable" };
  if (same(kind, sheetValue, rentvineValue)) return { kind: "none" };
  const working =
    input.workingValue === undefined || input.workingValue === null
      ? null
      : readable(kind, input.workingValue);
  if (working !== null && !same(kind, working, rentvineValue))
    return { kind: "decision", reason: "working_value_differs" };
  return {
    kind: "information",
    fieldKey: input.fieldKey,
    valueKind: kind,
    sheetValue,
    rentvineValue,
  };
}

/** "$1,750.00": the information line states amounts to the cent. */
export function sourceDifferenceMoney(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function shown(kind: RentVineBasisValueKind, value: number | string): string {
  return kind === "rent"
    ? sourceDifferenceMoney(Number(value))
    : formatCalendarDate(String(value));
}

/**
 * R-S280-6: the information line, named by lease: "101 Sample Pl: the operating Sheet shows
 * $1,750.00 and RentVine shows $1,700.00. RentVine is the basis."
 */
export function sourceDifferenceInformationLine(
  leaseLabel: string,
  information: Pick<
    SourceDifferenceInformation,
    "valueKind" | "sheetValue" | "rentvineValue"
  >,
): string {
  return `${leaseLabel}: the operating Sheet shows ${shown(information.valueKind, information.sheetValue)} and RentVine shows ${shown(information.valueKind, information.rentvineValue)}. RentVine is the basis.`;
}

/** The Live renewal review group's words. */
export const SOURCE_DIFFERENCE_WORDS = {
  groupLabel: "Information",
  groupIntro:
    "RentVine is the basis for the current rent and the lease dates. These differences from the operating Sheet need no decision.",
  sheetUpdateLink: "Open the lease's Sheet update",
} as const;
