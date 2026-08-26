export type CurrencyParseResult =
  | { ok: true; value: number }
  | {
      ok: false;
      reason: "empty" | "invalid_format" | "negative" | "not_finite";
    };

/**
 * Parse ordinary human money input without using permissive Number() coercion. Accepts optional `$`,
 * surrounding spaces, correctly grouped commas, and zero to two decimal places. Negative, exponent,
 * partial, and mixed-text forms fail closed.
 */
export function parseCurrencyInput(input: string): CurrencyParseResult {
  const trimmed = String(input).trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.startsWith("-")) return { ok: false, reason: "negative" };
  const match = /^\$?\s*((?:\d{1,3}(?:,\d{3})+)|(?:\d+))(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return { ok: false, reason: "invalid_format" };
  const value = Number(`${match[1].replaceAll(",", "")}.${match[2] ?? "0"}`);
  if (!Number.isFinite(value)) return { ok: false, reason: "not_finite" };
  return { ok: true, value };
}

export function parseOptionalCurrencyInput(
  input: string,
): { ok: true; value?: number } | Exclude<CurrencyParseResult, { ok: true }> {
  if (String(input).trim() === "") return { ok: true };
  return parseCurrencyInput(input);
}
