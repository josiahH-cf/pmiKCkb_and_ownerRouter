// Parse the RentVine reference embedded in a renewal-sheet cell (Phase-1 read-only; design §1.1.4).
//
// The tracking sheet hyperlinks each row back to its RentVine dashboard (show-and-tell ~00:35:47), so
// the lease/unit ID inside that link is a far stronger join key than a fuzzy tenant name — it is exact
// and survives multi-tenant leases and name-format drift. This module extracts that ID from either a
// bare URL or a `=HYPERLINK("url","text")` cell. Pure and deterministic; no I/O.

export interface RentvineRef {
  raw: string;
  leaseId?: string;
  unitId?: string;
}

/** Pull the url out of a `=HYPERLINK("url"[,"text"])` formula cell, else null. */
function hyperlinkUrl(cell: string): string | null {
  const match = cell
    .trim()
    .match(/^=HYPERLINK\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,\s*"(?:[^"\\]|\\.)*"\s*)?\)$/i);
  return match ? match[1] : null;
}

/**
 * Parse a RentVine dashboard URL into its lease/unit IDs. Tolerant of path-routed
 * (`/leases/123`, `/units/456`), hash-routed (`/#/leases/123`), and query-string
 * (`?leaseID=123`) forms. Returns null when no RentVine ID is present.
 */
export function parseRentvineRef(url: string): RentvineRef | null {
  if (!url) return null;
  const raw = url.trim();
  if (raw === "") return null;

  const leaseId =
    raw.match(/\/leases?\/(\d+)/i)?.[1] ?? raw.match(/[?&]lease(?:id)?=(\d+)/i)?.[1];
  const unitId =
    raw.match(/\/units?\/(\d+)/i)?.[1] ?? raw.match(/[?&]unit(?:id)?=(\d+)/i)?.[1];

  if (!leaseId && !unitId) return null;
  return {
    raw,
    ...(leaseId ? { leaseId } : {}),
    ...(unitId ? { unitId } : {}),
  };
}

/** Canonical join id for a ref: the lease id when present, else the unit id (prefixed so the two
 * id spaces never collide). Null when neither is present. */
export function rentvineRefId(ref: RentvineRef | null): string | null {
  if (!ref) return null;
  if (ref.leaseId) return `lease:${ref.leaseId}`;
  if (ref.unitId) return `unit:${ref.unitId}`;
  return null;
}

/** Extract a canonical RentVine join id from a sheet cell (bare URL or HYPERLINK formula). */
export function rentvineJoinIdFromCell(cell: string): string | null {
  if (!cell) return null;
  const url = hyperlinkUrl(cell) ?? cell;
  return rentvineRefId(parseRentvineRef(url));
}

export interface RentvineRowReference {
  joinId: string;
  sourceUrl: string;
}

/**
 * Resolve the row's complete RentVine reference layer. A formula hyperlink owns its cell; the
 * evaluated display text is inspected only when no formula URL exists. More than one valid
 * reference is an ambiguous entity/destination even when the URLs repeat, so the whole Sheet read
 * fails closed instead of silently selecting the first or falling back to a fuzzy name join.
 */
export function rentvineReferenceForRow(
  cells: readonly string[],
  linkUrls: readonly (string | null)[],
): RentvineRowReference | null {
  const references: RentvineRowReference[] = [];
  const width = Math.max(cells.length, linkUrls.length);
  for (let index = 0; index < width; index += 1) {
    const linkedUrl = linkUrls[index]?.trim() ?? "";
    const sourceUrl =
      linkedUrl || hyperlinkUrl(cells[index] ?? "") || (cells[index] ?? "").trim();
    if (!sourceUrl) continue;
    const joinId = rentvineRefId(parseRentvineRef(sourceUrl));
    if (joinId) references.push({ joinId, sourceUrl });
  }
  if (references.length > 1) {
    throw new Error("A Sheet data row has multiple RentVine lease destinations.");
  }
  return references[0] ?? null;
}

/** The row's sole exact RentVine join id; zero returns null and multiple references throw. */
export function rentvineJoinIdForRow(
  cells: readonly string[],
  linkUrls: readonly (string | null)[],
): string | null {
  return rentvineReferenceForRow(cells, linkUrls)?.joinId ?? null;
}

/** Per-row RentVine join ids for a display grid + its parallel hyperlink-url grid. */
export function rentvineJoinIdsForGrid(
  grid: readonly (readonly string[])[],
  links: readonly (readonly (string | null)[])[],
): (string | null)[] {
  return grid.map((row, index) => rentvineJoinIdForRow(row, links[index] ?? []));
}

/** Per-row exact references used to project the join id and destination from one decision. */
export function rentvineReferencesForGrid(
  grid: readonly (readonly string[])[],
  links: readonly (readonly (string | null)[])[],
): (RentvineRowReference | null)[] {
  return grid.map((row, index) => rentvineReferenceForRow(row, links[index] ?? []));
}
