// Canonical navigation seam for the Admin-only per-property decision history. Callers must supply a
// property key that has already been proven unambiguous; this helper refuses empty destinations and
// keeps return navigation inside the authenticated renewal surface.

export function normalizeRenewalReturnTo(
  value: string | null | undefined,
): string | null {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith("/lease-renewal")) return null;
  if (candidate.startsWith("//") || /[\u0000-\u001f\u007f]/.test(candidate)) return null;
  return candidate;
}

export function buildPropertyHistoryHref(
  propertyKey: string | null | undefined,
  returnTo?: string,
): string | null {
  const key = propertyKey?.trim();
  if (!key) return null;
  const base = `/lease-renewal/property/${encodeURIComponent(key)}`;
  const safeReturnTo = normalizeRenewalReturnTo(returnTo);
  return safeReturnTo ? `${base}?returnTo=${encodeURIComponent(safeReturnTo)}` : base;
}
