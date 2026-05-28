import type { Citation } from "@/lib/schemas";

export function filterValidCitations(
  citations: Citation[],
  groundingSourceIds: ReadonlySet<string>,
) {
  return citations.filter((citation) => groundingSourceIds.has(citation.source_id));
}

export function canonicalizeValidCitations(
  citations: Citation[],
  groundingCitations: readonly Citation[],
) {
  const groundingBySourceId = new Map(
    groundingCitations.map((citation) => [citation.source_id, citation]),
  );
  const seen = new Set<string>();

  return citations.flatMap((citation) => {
    const groundedCitation = groundingBySourceId.get(citation.source_id);

    if (!groundedCitation || seen.has(citation.source_id)) {
      return [];
    }

    seen.add(citation.source_id);
    return [groundedCitation];
  });
}
