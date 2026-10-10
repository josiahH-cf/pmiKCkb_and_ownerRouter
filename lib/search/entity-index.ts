// S203 atomically reconciled metadata generations. No source calls, full text, writes or effects.
import { createHash } from "node:crypto";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  SearchEntitySchema,
  SearchQuerySchema,
  type SearchBatch,
  type SearchEntity,
  type EntitySearchPage,
} from "./entity-types";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalize = (v: string) => v.toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
export const entityKey = (v: Pick<SearchEntity, "type" | "id">) => `${v.type}:${v.id}`;
export interface EntityIndex {
  scope: string;
  generation: string;
  records: readonly SearchEntity[];
  limitations: EntitySearchPage["limitations"];
  readAt: string;
  changed: number;
  removed: number;
}
export function buildEntityIndex(
  batches: readonly SearchBatch[],
  scope: string,
  previous?: EntityIndex,
): EntityIndex {
  const records = new Map<string, SearchEntity>(),
    limitations: EntitySearchPage["limitations"] = [];
  const prior = new Map(
    previous?.scope === scope ? previous.records.map((r) => [entityKey(r), r]) : [],
  );
  let changed = 0;
  for (const batch of batches) {
    const { entities, ...status } = batch;
    if (batch.status !== "ok") limitations.push(status);
    if (batch.status === "unavailable" || batch.status === "not_authorized") continue;
    const parsed = entities.map((e) => SearchEntitySchema.safeParse(e)),
      ids = entities.map(entityKey);
    if (parsed.some((p) => !p.success) || new Set(ids).size !== ids.length) {
      limitations.push({
        ...status,
        status: "unavailable",
        note: "This source's search metadata could not be reconciled. Retry the current source.",
      });
      continue;
    }
    for (const result of parsed) {
      if (!result.success) continue;
      const key = entityKey(result.data),
        old = prior.get(key);
      if (
        old &&
        digest({ ...old, asOf: null }) === digest({ ...result.data, asOf: null })
      )
        records.set(key, { ...old, asOf: result.data.asOf });
      else {
        records.set(key, result.data);
        changed++;
      }
    }
  }
  const sorted = [...records.values()].sort(
    (a, b) =>
      normalize(a.label).localeCompare(normalize(b.label), "en-US") ||
      entityKey(a).localeCompare(entityKey(b), "en-US"),
  );
  return {
    scope,
    generation: digest({
      records: sorted.map((r) => ({ ...r, asOf: null })),
      limitations: limitations.map((l) => ({ ...l, asOf: null })),
    }),
    records: sorted,
    limitations,
    readAt: new Date().toISOString(),
    changed,
    removed: [...prior.keys()].filter((k) => !records.has(k)).length,
  };
}
export function queryEntityIndex(index: EntityIndex, raw: unknown): EntitySearchPage {
  const query = SearchQuerySchema.parse(raw),
    tokens = normalize(query.q).split(" ").filter(Boolean),
    queryHash = digest({ q: normalize(query.q), type: query.type }),
    matches: EntitySearchPage["results"] = [];
  if (!tokens.length)
    return {
      results: [],
      nextCursor: null,
      limitations: index.limitations,
      readAt: index.readAt,
    };
  for (const entity of index.records) {
    if (query.type !== "all" && entity.type !== query.type) continue;
    const fields = [
        ...entity.fields,
        ...entity.relations.map((r) => ({ label: `Related ${r.type}`, value: r.label })),
      ],
      haystack = normalize(fields.map((f) => f.value).join(" "));
    if (!tokens.every((t) => haystack.includes(t))) continue;
    const matched = fields.filter((f) =>
      tokens.some((t) => normalize(f.value).includes(t)),
    );
    matches.push({
      entity,
      match: {
        field: [...new Set(matched.map((m) => m.label))].join("; ").slice(0, 300),
        context: matched
          .map((m) => m.value)
          .join(" · ")
          .slice(0, 500),
      },
    });
  }
  let start = 0;
  if (query.cursor) {
    try {
      const value = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"));
      if (
        Object.keys(value).sort().join(",") !== "after,generation,query,scope" ||
        value.scope !== index.scope ||
        value.generation !== index.generation ||
        value.query !== queryHash
      )
        throw Error();
      const found = matches.findIndex((r) => entityKey(r.entity) === value.after);
      if (found < 0) throw Error();
      start = found + 1;
    } catch {
      throw new EditableLayerError(
        "The search or its source changed. Start this query again to read the current results.",
        409,
      );
    }
  }
  const results = matches.slice(start, start + query.limit),
    more = start + results.length < matches.length,
    nextCursor = more
      ? Buffer.from(
          JSON.stringify({
            scope: index.scope,
            generation: index.generation,
            query: queryHash,
            after: entityKey(results.at(-1)!.entity),
          }),
        ).toString("base64url")
      : null;
  return { results, nextCursor, limitations: index.limitations, readAt: index.readAt };
}
