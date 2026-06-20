// Per-cell typed normalization for the renewal sheet connector (Phase-1, read-only).
//
// The sheet encodes one fact many ways: dates in six formats, yes/Yes/YES/y, n/a, TRUE/FALSE,
// "$" currency, and workflow state buried in free text with staff names (map §3, §7). This module
// turns a single raw cell into a typed NormalizedValue carrying its canonical value, a confidence
// rung, and its structural CellAddress. It is value-driven (a date column holding an email
// normalizes as an email, surfacing the mismatch) with an optional column hint for the few
// genuinely ambiguous cases (names). Pure and deterministic; no I/O, no external system.
//
// INVARIANT: ingest never assigns "Conflict" confidence. Conflict is a *reconciliation* outcome
// across sources, not a property of a single cell — so NormalizedConfidence excludes it by type.

import { RENEWAL_FACT_CONFIDENCE } from "@/lib/lease-renewal/constants";
import type { CellAddress } from "@/lib/lease-renewal/sheet-types";

type RenewalFactConfidence = (typeof RENEWAL_FACT_CONFIDENCE)[number];
export type NormalizedConfidence = Exclude<RenewalFactConfidence, "Conflict">;

/** Confidence rungs available at ingest, best-first. "Conflict" is deliberately absent. */
export const NORMALIZED_CONFIDENCE_LADDER: readonly NormalizedConfidence[] =
  RENEWAL_FACT_CONFIDENCE.filter(
    (rung): rung is NormalizedConfidence => rung !== "Conflict",
  );

export type NormalizedType =
  | "empty"
  | "email"
  | "boolean"
  | "currency"
  | "yes_no"
  | "date"
  | "status"
  | "name"
  | "text";

export interface NormalizedValue {
  raw: string;
  type: NormalizedType;
  /** Canonical value: ISO date (YYYY-MM-DD or YYYY-MM), number, boolean, token, or null. */
  value: string | number | boolean | null;
  confidence: NormalizedConfidence;
  cell: CellAddress;
  notes: string[];
}

// Workflow-state tokens that live in free text instead of a structured status field (map §3).
const STATUS_TOKENS = new Set([
  "dont renew",
  "not renewing",
  "needs renewed",
  "eviction",
  "abandonment",
  "pending",
  "working",
  "completed",
  "decided to move out",
]);

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Reject impossible calendar dates (Feb 30, Apr 31, non-leap Feb 29). A month/day-range check alone
 * is not enough — round-trip through a UTC date and require it to land on the same y/m/d, so a
 * malformed value falls through to unparseable (null + Needs Review per design §3) instead of
 * emitting a fabricated ISO date that would masquerade as a Verified fact downstream.
 */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

interface ParsedDate {
  iso: string;
  confidence: NormalizedConfidence;
}

/** Parse the date formats the sheet mixes within a single column. Returns null if unparseable. */
export function parseSheetDate(value: string): ParsedDate | null {
  const trimmed = value.trim();

  // M/D/YYYY, M/D/YY, MM-DD-YYYY (US month-first).
  const numeric = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    let year = Number(numeric[3]);
    const twoDigitYear = numeric[3].length === 2;
    if (twoDigitYear) year += 2000;
    if (isRealCalendarDate(year, month, day)) {
      return {
        iso: `${year}-${pad2(month)}-${pad2(day)}`,
        confidence: twoDigitYear ? "Likely" : "Verified",
      };
    }
    return null;
  }

  // MM/YYYY (month + 4-digit year, no day).
  const monthYear = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (monthYear) {
    const month = Number(monthYear[1]);
    if (month >= 1 && month <= 12) {
      return { iso: `${monthYear[2]}-${pad2(month)}`, confidence: "Likely" };
    }
    return null;
  }

  // "Month D, YYYY" / "Month YYYY".
  const named = trimmed
    .toLowerCase()
    .match(/^([a-z]{3,9})\.?\s+(?:(\d{1,2}),?\s+)?(\d{4})$/);
  if (named) {
    const month = MONTHS[named[1].slice(0, 3)];
    if (month) {
      const year = Number(named[3]);
      const day = named[2] ? Number(named[2]) : undefined;
      if (day !== undefined && !isRealCalendarDate(year, month, day)) {
        return null;
      }
      const iso = day
        ? `${named[3]}-${pad2(month)}-${pad2(day)}`
        : `${named[3]}-${pad2(month)}`;
      return { iso, confidence: "Likely" };
    }
  }

  return null;
}

/**
 * Normalize one raw cell into a typed NormalizedValue. Value-driven; pass hint "name" for columns
 * the schema knows hold names so plain text is typed as a name rather than generic text.
 */
export function normalizeCell(
  raw: string,
  cell: CellAddress,
  hint?: NormalizedType,
): NormalizedValue {
  const base = { raw, cell };
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { ...base, type: "empty", value: null, confidence: "Verified", notes: [] };
  }

  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed)) {
    return { ...base, type: "email", value: trimmed, confidence: "Verified", notes: [] };
  }

  if (/^(true|false)$/i.test(trimmed)) {
    return {
      ...base,
      type: "boolean",
      value: /^true$/i.test(trimmed),
      confidence: "Verified",
      notes: [],
    };
  }

  if (/^\$\s?\d[\d,]*(\.\d+)?$/.test(trimmed)) {
    const amount = Number(trimmed.replace(/[$,\s]/g, ""));
    return {
      ...base,
      type: "currency",
      value: amount,
      confidence: "Verified",
      notes: [],
    };
  }

  if (/^(yes|y)$/i.test(trimmed)) {
    return { ...base, type: "yes_no", value: true, confidence: "Verified", notes: [] };
  }
  if (/^no$/i.test(trimmed)) {
    return { ...base, type: "yes_no", value: false, confidence: "Verified", notes: [] };
  }
  if (/^n\/?a$/i.test(trimmed)) {
    return {
      ...base,
      type: "yes_no",
      value: null,
      confidence: "Likely",
      notes: ["n/a — not applicable"],
    };
  }

  const fullDate = parseSheetDate(trimmed);
  if (fullDate) {
    return {
      ...base,
      type: "date",
      value: fullDate.iso,
      confidence: fullDate.confidence,
      notes: [],
    };
  }

  // "yes <date>" / "yes, pending" — a yes/no answer with workflow state appended in free text.
  const leading = trimmed.match(/^(yes|no)\b[\s,]+(.+)$/i);
  if (leading) {
    const answer = /^yes$/i.test(leading[1]);
    const trailing = leading[2].trim();
    const trailingIsDate = parseSheetDate(trailing) !== null;
    return {
      ...base,
      type: "yes_no",
      value: answer,
      confidence: trailingIsDate ? "Likely" : "Needs Review",
      notes: [`trailing free text: "${trailing}"`],
    };
  }

  if (STATUS_TOKENS.has(trimmed.toLowerCase())) {
    return {
      ...base,
      type: "status",
      value: trimmed.toLowerCase(),
      confidence: "Likely",
      notes: [],
    };
  }

  if (hint === "name") {
    return { ...base, type: "name", value: trimmed, confidence: "Likely", notes: [] };
  }

  // Non-empty but unparseable: surface as text. Buried-state free text (e.g. "ESTELLE WORKING ON")
  // is low-confidence so reconciliation/severity can route it for review.
  const looksLikeBuriedState =
    /[a-z].*\s.*[a-z]/i.test(trimmed) && !/^[A-Za-z]+$/.test(trimmed);
  return {
    ...base,
    type: "text",
    value: trimmed,
    confidence: looksLikeBuriedState ? "Needs Review" : "Likely",
    notes: [],
  };
}
