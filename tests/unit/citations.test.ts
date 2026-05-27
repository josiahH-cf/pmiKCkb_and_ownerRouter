import { describe, expect, it } from "vitest";
import { filterValidCitations } from "@/lib/citations/validate";

describe("citation validation", () => {
  it("strips citations not present in grounding metadata", () => {
    const citations = [
      { source_id: "source-a", title: "A", url: "https://example.com/a" },
      { source_id: "source-b", title: "B", url: "https://example.com/b" },
    ];

    expect(filterValidCitations(citations, new Set(["source-a"]))).toEqual([
      { source_id: "source-a", title: "A", url: "https://example.com/a" },
    ]);
  });
});
