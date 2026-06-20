// Shared structural types for the lease-renewal sheet connector (Phase-1, read-only).
//
// A "grid" is the flattened export of one logical tab: rows of raw string cells. Headers are
// NOT guaranteed at row 0, column positions are not stable, and a single logical tab can be
// fractured across sub-tables (see docs/products/lease-renewal-spreadsheet-map.md §1, §7). The
// deterministic Phase-1 units key on content, never on position. This module defines no runtime
// trigger, queue, or connector — it is structural vocabulary only.

export type RawRow = readonly string[];
export type RawGrid = readonly RawRow[];

/**
 * A cell's structural address inside a logical tab. Carried by every NormalizedValue and is the
 * anchor the Phase-2 write-back re-resolves before writing (compare-and-set), so it must identify
 * a cell by resolved semantic column rather than a raw spreadsheet column letter.
 */
export interface CellAddress {
  /** Resolved logical tab name (e.g. "Renewals"), not the raw export table index. */
  tab: string;
  /** Zero-based row index within the tab's grid, in raw export order. */
  row: number;
  /** Resolved semantic column key (e.g. "renewal_date"), not a raw column letter or header. */
  column: string;
}
