import { it, expect } from "vitest";
import { buildEntityIndex, queryEntityIndex } from "@/lib/search/entity-index";
import type { SearchEntity, SearchBatch } from "@/lib/search/entity-types";
const entity = (
  id: string,
  label: string,
  type: SearchEntity["type"] = "lease",
): SearchEntity => ({
  id,
  type,
  label,
  fields: [
    { label: "Name/address", value: label },
    { label: "Reference", value: id },
  ],
  relations: [],
  href: `/lease-renewal/live/desk/lease/${id}`,
  asOf: "2026-10-09T15:00:00Z",
});
const batches = (entities: SearchEntity[]): SearchBatch[] => [
  {
    source: "renewals",
    status: "ok",
    asOf: "2026-10-09T15:00:00Z",
    note: null,
    entities,
  },
];
it("matches partial case-insensitive terms and literal punctuation only within one entity or labeled relationship", () => {
  const index = buildEntityIndex(
    batches([
      entity("1", "East 123 Miller"),
      entity("2", "East 168 Miller"),
      entity("3", "ABC Plumbing", "vendor"),
      entity("4", "West 100"),
    ]),
    "actor-scope",
  );
  expect(
    queryEntityIndex(index, { q: "EAST 1", type: "all", limit: 20 }).results.map(
      (r) => r.entity.id,
    ),
  ).toEqual(["1", "2"]);
  expect(
    queryEntityIndex(index, { q: "aBc", type: "vendor", limit: 20 }).results[0].match,
  ).toMatchObject({ field: "Name/address" });
  expect(queryEntityIndex(index, { q: ".*", type: "all", limit: 20 }).results).toEqual(
    [],
  );
  expect(
    queryEntityIndex(index, { q: "Miller West", type: "all", limit: 20 }).results,
  ).toEqual([]);
});
it("keeps equal-label canonical IDs distinct and paginates a bounded large index without omissions or duplicates", () => {
  const index = buildEntityIndex(
      batches(Array.from({ length: 123 }, (_, i) => entity(String(i + 1), "Miller"))),
      "actor-scope",
    ),
    ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page = queryEntityIndex(index, { q: "miller", type: "all", limit: 17, cursor });
    ids.push(...page.results.map((r) => r.entity.id));
    cursor = page.nextCursor;
  } while (cursor);
  expect(ids).toHaveLength(123);
  expect(new Set(ids).size).toBe(123);
});
it("rejects a cursor after source generation, query or actor scope changes and distinguishes partial reads", () => {
  const original = buildEntityIndex(
      batches([entity("1", "East 123"), entity("2", "East 168")]),
      "staff-one",
    ),
    cursor = queryEntityIndex(original, { q: "east", type: "all", limit: 1 }).nextCursor!;
  expect(() =>
    queryEntityIndex(buildEntityIndex(batches([entity("1", "Renamed")]), "staff-one"), {
      q: "east",
      type: "all",
      limit: 1,
      cursor,
    }),
  ).toThrow(/changed/);
  expect(() =>
    queryEntityIndex(original, { q: "west", type: "all", limit: 1, cursor }),
  ).toThrow(/changed/);
  expect(() =>
    queryEntityIndex(
      buildEntityIndex(
        batches([entity("1", "East 123"), entity("2", "East 168")]),
        "staff-two",
      ),
      { q: "east", type: "all", limit: 1, cursor },
    ),
  ).toThrow(/changed/);
  const partial = buildEntityIndex(
    [
      {
        ...batches([entity("1", "East 123")])[0],
        status: "partial",
        note: "More records were not read.",
      },
    ],
    "staff-one",
  );
  expect(
    queryEntityIndex(partial, { q: "east", type: "all", limit: 20 }).limitations,
  ).toEqual([expect.objectContaining({ source: "renewals", status: "partial" })]);
});
it("refuses hidden or malformed entities before counts, snippets or destinations can be returned", () => {
  const index = buildEntityIndex(
    [{ ...batches([entity("hidden", "SECRET")])[0], status: "not_authorized" }],
    "staff-one",
  );
  expect(
    queryEntityIndex(index, { q: "secret", type: "all", limit: 20 }).results,
  ).toEqual([]);
  const invalid = buildEntityIndex(
    batches([
      { ...entity("1", "Safe"), description: "PRIVATE_BODY_SENTINEL" } as SearchEntity,
    ]),
    "staff-one",
  );
  const result = queryEntityIndex(invalid, { q: "safe", type: "all", limit: 20 });
  expect(result.results).toEqual([]);
  expect(result.limitations).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain("PRIVATE_BODY_SENTINEL");
});
