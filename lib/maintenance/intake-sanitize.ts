// Text sanitizer for the public tokenized maintenance intake (A5). Every value on the public route is
// attacker-controlled, so before it is stored (and later shown to staff in the triage queue) it is
// neutralized here. This is PURE (no deps) and shared by the route + writer so there is one code path.
//
// What it defends against:
//   - Control characters (C0/C1) that corrupt logs/terminals — stripped (TAB + LF are kept so
//     multi-line descriptions survive).
//   - Unicode bidi overrides + zero-width/invisible characters (Trojan-Source style spoofing) — stripped.
//   - Denormalized Unicode — collapsed with NFC so equal-looking strings compare/store consistently.
//   - Formula/CSV injection: a leading =, +, -, @ (or a control char) makes spreadsheet tools execute
//     the cell if staff ever export the queue — neutralized by prefixing a single quote.
//   - Unbounded length — every field is hard-capped.

// Build a character-class regex from numeric code-point ranges so the SOURCE stays pure ASCII (no
// literal invisible/control characters live in this file — they are only materialized at runtime).
function classFromRanges(ranges: ReadonlyArray<readonly [number, number]>): RegExp {
  let cls = "";
  for (const [lo, hi] of ranges) {
    cls += String.fromCodePoint(lo);
    if (hi !== lo) cls += `-${String.fromCodePoint(hi)}`;
  }
  return new RegExp(`[${cls}]`, "g");
}

// C0 controls except TAB (0x09) and LF (0x0A) — CR is normalized to LF first — plus DEL and all C1.
const DISALLOWED_CONTROLS = classFromRanges([
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
]);

// Bidi controls (Trojan Source), zero-width joiners/spaces, invisible math operators, isolates, and BOM.
const INVISIBLE_AND_BIDI = classFromRanges([
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
]);

const CSV_INJECTION_LEADING = /^[=+\-@\t\r]/;

export const INTAKE_FIELD_LIMITS = {
  summary: 200,
  description: 4000,
  contact: 200,
  propertyKey: 128,
} as const;

export type IntakeFieldName = keyof typeof INTAKE_FIELD_LIMITS;

/**
 * Sanitize one intake text field: NFC-normalize, collapse CR/CRLF to LF, strip invisibles/bidi +
 * disallowed controls, trim, hard-cap to the field limit, then neutralize a formula-injection leading
 * char. Returns "" for nullish/non-string input.
 */
export function sanitizeIntakeText(value: unknown, field: IntakeFieldName): string {
  if (typeof value !== "string") return "";

  let out = value.normalize("NFC");
  out = out.replace(/\r\n?/g, "\n");
  out = out.replace(INVISIBLE_AND_BIDI, "");
  out = out.replace(DISALLOWED_CONTROLS, "");
  out = out.trim();

  const limit = INTAKE_FIELD_LIMITS[field];
  if (out.length > limit) {
    out = out.slice(0, limit).trim();
  }

  if (CSV_INJECTION_LEADING.test(out)) {
    out = `'${out}`;
  }

  return out;
}

/**
 * A propertyKey must be a compact, safe identifier (no spaces/controls/injection). Returns the trimmed
 * key if it matches the allowed shape, else null so callers fail closed.
 */
export function normalizeIntakePropertyKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.normalize("NFC").trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > INTAKE_FIELD_LIMITS.propertyKey ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}
