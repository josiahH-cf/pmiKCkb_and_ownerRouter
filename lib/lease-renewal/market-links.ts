// Deep-link helpers for the operator's comp research (Slice 3). Pure + deterministic.
//
// Boundary (D07/D08): the ONLY datum that enters the URL is the property address — never tenant PII,
// never a rent figure. A blank address yields null so the UI shows no dead link.

/** Build a Zillow comps-search URL seeded from a property address. Returns null for a blank address. */
export function zillowSearchUrl(address: string | null | undefined): string | null {
  const trimmed = (address ?? "").trim();
  if (trimmed === "") return null;
  return `https://www.zillow.com/homes/${encodeURIComponent(trimmed)}_rb/`;
}
