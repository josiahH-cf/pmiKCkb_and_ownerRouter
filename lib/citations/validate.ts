import type { Citation } from "@/lib/schemas";

export function filterValidCitations(
  citations: Citation[],
  groundingSourceIds: ReadonlySet<string>,
) {
  return citations.filter((citation) => groundingSourceIds.has(citation.source_id));
}
