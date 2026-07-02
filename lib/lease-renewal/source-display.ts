// Display-label seam for source-system names (S13 A5). Internal `source_system` / `source` values
// (for example "Rentvine (read-authoritative)" or the lowercase id "rentvine") stay byte-identical
// everywhere they matter — the reconciliation pipeline, golden data, persisted queue items, and
// write-back records. This maps them to clean operator-facing labels at the RENDER seam ONLY, so a
// screen reads "RentVine" while the stored value keeps its authoritative qualifier. Pure and
// deterministic; no I/O.

/**
 * Clean a stored source-system label for display. Strips the "(read-authoritative)" precedence
 * qualifier and normalizes the RentVine brand casing. Any other label (Renewal sheet, Google Form
 * intake, Zillow, …) is returned unchanged, so this is safe to apply at every source render point.
 * A null/undefined source (e.g. a write-back proposal with no winning source) returns "".
 */
export function displaySourceLabel(source: string | null | undefined): string {
  if (!source) return "";
  return source
    .replace(/\s*\(read-authoritative\)\s*$/i, "")
    .replace(/\brentvine\b/gi, "RentVine")
    .trim();
}
