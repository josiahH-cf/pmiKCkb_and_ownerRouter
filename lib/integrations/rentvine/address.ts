// The single RentVine address composer (S71, AC-S71-3).
//
// CONFIRMED live 2026-07-01 (`npm run smoke:rentvine-read -- --live`): a RentVine record carries the
// street address as SEPARATE parts — `streetNumber`, `streetName`, and an optional `address2`
// designator. `streetName` is the street NAME ONLY; it never contains the house number.
//
// Three implementations of this composition used to exist. Two were correct (the maintenance
// unit-matcher and the console live provider) and two renewal paths were wrong: both walked
// a street-name-first key list and took the first hit, and because
// `streetName` is both FIRST in that list and present on every record, it always won and the label
// was always street-only. That is a pure key-ORDER defect — nothing was truncated or redacted.
//
// This module is the surviving implementation, moved verbatim from the maintenance unit-matcher
// (whose exact output strings are pinned by passing tests), so the consolidation is a
// behaviour-preserving extraction rather than a fourth variant. It is a leaf module: it imports
// nothing, so every subsystem can depend on it without a cycle.
//
// Deliberately NOT widened. An earlier plan proposed appending `propertyAddress` to the fallback key
// list here so the renewal key set would be a superset of the old walk. That would silently change
// maintenance unit matching and a value persisted on live tickets, so the renewal-only fallback lives
// in the renewal caller instead. Keep this key set identical to what the maintenance tests pin.

/** First present string-ish value across `keys`. Trims strings; stringifies finite numbers. */
export function firstPresentString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/**
 * Compose the street label from a RentVine record append: `streetNumber` + `streetName`, plus an
 * optional `address2` designator. Falls back to a whole-address key only when no parts compose.
 * Returns null when the record carries no address at all, so callers can render a non-PII marker
 * rather than a fabricated address. Pure and deterministic.
 */
export function composeRentVineAddress(record: unknown): string | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const source = record as Record<string, unknown>;

  const streetLine = [
    firstPresentString(source, ["streetNumber"]),
    firstPresentString(source, ["streetName"]),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const designator = firstPresentString(source, ["address2"]);
  const composed = [streetLine, designator]
    .filter((part) => Boolean(part))
    .join(" ")
    .trim();
  if (composed) return composed;
  return firstPresentString(source, ["address", "address1", "addressLine1"]);
}
