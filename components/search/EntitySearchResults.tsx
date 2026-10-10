"use client";
import { useEffect, useRef, useState } from "react";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import {
  ENTITY_TYPES,
  ENTITY_LABELS,
  EntitySearchPageSchema,
  entityOpenHref,
  type EntitySearchPage,
} from "@/lib/search/entity-types";
import { formatBusinessTimestamp } from "@/lib/date-display";
export function EntitySearchResults({
  initialQuery = "",
  initialType = "all",
}: Readonly<{ initialQuery?: string; initialType?: string }>) {
  const [query, setQuery] = useState(initialQuery),
    [input, setInput] = useState(initialQuery),
    [type, setType] = useState(initialType),
    [page, setPage] = useState<EntitySearchPage | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const generation = useRef(0),
    live = useRef(true),
    olderBusy = useRef(false);
  useEffect(() => {
    live.current = true;
    const sync = () => {
      generation.current++;
      setPage(null);
      setError("");
      const q = new URLSearchParams(location.search),
        value = q.get("q") ?? "",
        filter = q.get("type") ?? "all";
      setQuery(value);
      setInput(value);
      setType((ENTITY_TYPES as readonly string[]).includes(filter) ? filter : "all");
    };
    window.addEventListener("popstate", sync);
    return () => {
      live.current = false;
      generation.current++;
      window.removeEventListener("popstate", sync);
    };
  }, []);
  useEffect(() => {
    const current = ++generation.current,
      abort = new AbortController();
    const timer = setTimeout(() => {
      setPage(null);
      setError("");
      if (!query.trim()) {
        setLoading(false);
        return;
      }
      setLoading(true);
      void (async () => {
        try {
          const response = await fetch(
            `/api/search/entities?${new URLSearchParams({ q: query, type, limit: "50" })}`,
            { cache: "no-store", signal: abort.signal },
          );
          if (!response.ok) throw Error();
          const result = EntitySearchPageSchema.parse(await response.json());
          if (live.current && !abort.signal.aborted && current === generation.current)
            setPage(result);
        } catch {
          if (live.current && !abort.signal.aborted && current === generation.current)
            setError(
              "Search could not be read. Your query and entity filter are kept; retry for current results.",
            );
        } finally {
          if (live.current && !abort.signal.aborted && current === generation.current)
            setLoading(false);
        }
      })();
    }, 0);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, type, attempt]);
  function apply(value: string, filter: string) {
    generation.current++;
    setPage(null);
    setLoading(!!value.trim());
    const u = new URL(location.href);
    u.search = new URLSearchParams({ q: value, type: filter }).toString();
    history.pushState(null, "", u);
    setQuery(value);
    setType(filter);
    setError("");
  }
  async function older() {
    if (!page?.nextCursor || olderBusy.current) return;
    olderBusy.current = true;
    setLoading(true);
    setError("");
    const current = generation.current;
    try {
      const response = await fetch(
        `/api/search/entities?${new URLSearchParams({ q: query, type, limit: "50", cursor: page.nextCursor })}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw Error();
      const result = EntitySearchPageSchema.parse(await response.json());
      if (!live.current || current !== generation.current) return;
      setPage((previous) =>
        previous
          ? {
              ...result,
              results: [
                ...new Map(
                  [...previous.results, ...result.results].map((r) => [
                    `${r.entity.type}:${r.entity.id}`,
                    r,
                  ]),
                ).values(),
              ],
            }
          : result,
      );
    } catch {
      if (live.current && current === generation.current)
        setError(
          "The next page could not be read or its source changed. Retry this page, or restart this query for the current results.",
        );
    } finally {
      olderBusy.current = false;
      if (live.current && current === generation.current) setLoading(false);
    }
  }
  return (
    <div className="ui-stack">
      <h1>Entity search</h1>
      <form
        className="ui-spread"
        onSubmit={(e) => {
          e.preventDefault();
          apply(input.trim(), type);
          if (input.trim() === query) setAttempt((n) => n + 1);
        }}
      >
        <label className="field">
          Query
          <input
            aria-label="Query"
            value={input}
            maxLength={160}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Name, address or reference"
          />
        </label>
        <label className="field">
          Entity type
          <select
            aria-label="Entity type"
            value={type}
            onChange={(e) => apply(query, e.target.value)}
          >
            <option value="all">All records</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTITY_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" type="submit">
          Search
        </button>
      </form>
      {!query ? (
        <p>Enter a name, address or reference to search authorized records.</p>
      ) : null}
      {loading ? <p role="status">Reading authorized matches…</p> : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Restart current search
          </button>
        </div>
      ) : null}
      {page ? (
        <>
          <p className="muted">
            {page.results.length} shown · read {formatBusinessTimestamp(page.readAt)}.
            Select a record to open it in a new tab.
          </p>
          {page.limitations.map((l, index) => (
            <p role="status" key={`${l.source}:${index}`}>
              {l.note ?? "Some metadata is unavailable."}
            </p>
          ))}
          {!page.results.length ? (
            <p>
              {page.limitations.length
                ? "No matches in the available sources. Other sources are limited as shown above."
                : "No matching authorized records."}
            </p>
          ) : null}
          <ul className="entity-search-results">
            {page.results.map((r) => (
              <li className="panel" key={`${r.entity.type}:${r.entity.id}`}>
                <a
                  href={entityOpenHref(r.entity)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <strong>{r.entity.label}</strong>
                </a>
                <p>
                  {ENTITY_LABELS[r.entity.type]} · reference {r.entity.id}
                </p>
                <p>
                  {r.match.field}: {r.match.context}
                </p>
                <p className="muted">
                  Metadata as of{" "}
                  {r.entity.asOf ? formatBusinessTimestamp(r.entity.asOf) : "unavailable"}
                  .
                </p>
              </li>
            ))}
          </ul>
          {page.nextCursor ? (
            <button type="button" disabled={loading} onClick={() => void older()}>
              {loading ? "Reading next page…" : "Load more results"}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
