"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { registerTransientLayer, activateTransientLayer } from "@/lib/ui/transient-layer";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import {
  PHONE_HEADER_QUERY,
  useNarrowViewport,
} from "@/components/hooks/useNarrowViewport";
import {
  SEARCHABLE_ENTITY_TYPES,
  ENTITY_LABELS,
  EntitySearchPageSchema,
  entityOpenHref,
  type EntitySearchPage,
} from "@/lib/search/entity-types";
export function GlobalEntitySearch() {
  const [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [page, setPage] = useState<EntitySearchPage | null>(null),
    [active, setActive] = useState(-1),
    [open, setOpen] = useState(false),
    [status, setStatus] = useState<"empty" | "loading" | "ok" | "failed">("empty"),
    [attempt, setAttempt] = useState(0),
    [popupBlocked, setPopupBlocked] = useState(false);
  const id = useId(),
    generation = useRef(0),
    input = useRef<HTMLInputElement>(null);
  const layerId = `entity-search:${id}`;
  // S281 R-S281-7: at 760 px and narrower the header is one row, so search is a trigger that
  // opens the search field in place over that row. Nothing is hidden: the field is the same one,
  // shown when the trigger is chosen, and a query keeps it open.
  const narrow = useNarrowViewport(PHONE_HEADER_QUERY);
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusField = useRef(false);
  const focusTrigger = useRef(false);
  const collapsed = narrow && !expanded && !query;
  useLayoutEffect(() => {
    if (collapsed) {
      if (!focusTrigger.current) return;
      focusTrigger.current = false;
      trigger.current?.focus();
      return;
    }
    if (!focusField.current) return;
    focusField.current = false;
    input.current?.focus();
  }, [collapsed]);
  function collapseSearch() {
    if (!narrow || query) return;
    focusTrigger.current = true;
    setExpanded(false);
  }
  useEffect(
    () =>
      registerTransientLayer({
        id: layerId,
        family: "search",
        close: () => {
          setOpen(false);
          setActive(-1);
        },
      }),
    [layerId],
  );
  function openSearch() {
    activateTransientLayer({ id: layerId, family: "search" });
    setOpen(true);
  }
  useEffect(() => {
    const current = ++generation.current,
      abort = new AbortController();
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setPage(null);
        setStatus("empty");
        return;
      }
      setStatus("loading");
      void (async () => {
        try {
          const response = await fetch(
            `/api/search/entities?${new URLSearchParams({ q: query.trim(), type, limit: "8" })}`,
            { cache: "no-store", signal: abort.signal },
          );
          if (!response.ok) throw Error();
          const result = EntitySearchPageSchema.parse(await response.json());
          if (abort.signal.aborted || generation.current !== current) return;
          setPage(result);
          setActive(-1);
          setStatus("ok");
        } catch {
          if (abort.signal.aborted || generation.current !== current) return;
          setPage(null);
          setActive(-1);
          setStatus("failed");
        }
      })();
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
      generation.current++;
    };
  }, [query, type, attempt]);
  function change(value: string) {
    setQuery(value);
    setStatus(value.trim() ? "loading" : "empty");
    setActive(-1);
    setPage(null);
    openSearch();
    setPopupBlocked(false);
  }
  function navigate(href: string) {
    const tab = window.open(href, "_blank", "noopener,noreferrer");
    if (!tab) setPopupBlocked(true);
    setOpen(false);
    setActive(-1);
  }
  const resultsHref = `/search?${new URLSearchParams({ q: query.trim(), type })}`;
  if (collapsed)
    return (
      <div className="global-entity-search" data-search-collapsed>
        <button
          aria-expanded={false}
          aria-label="Search records"
          className="global-entity-search-trigger"
          onClick={() => {
            focusField.current = true;
            setExpanded(true);
          }}
          ref={trigger}
          type="button"
        >
          Search
        </button>
      </div>
    );
  return (
    <div
      className="global-entity-search"
      data-search-expanded={narrow ? true : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
          setActive(-1);
          // S281 R-S281-7: an empty phone search folds back into its trigger.
          if (narrow && !query && event.relatedTarget) setExpanded(false);
        }
      }}
    >
      <div className="global-entity-search-fields">
        <label className="sr-only" htmlFor={`${id}-query`}>
          Search records
        </label>
        <input
          id={`${id}-query`}
          ref={input}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && !!query.trim()}
          aria-controls={`${id}-options`}
          aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
          autoComplete="off"
          placeholder="Search names, addresses, IDs"
          maxLength={160}
          value={query}
          onFocus={openSearch}
          onClick={openSearch}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              if (!query.trim()) return;
              if (active >= 0 && page?.results[active])
                navigate(entityOpenHref(page.results[active].entity));
              else navigate(resultsHref);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              setActive(-1);
              collapseSearch();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              openSearch();
              const size = page?.results.length ?? 0;
              if (size)
                setActive((old) =>
                  e.key === "ArrowDown"
                    ? (old + 1) % size
                    : old <= 0
                      ? size - 1
                      : old - 1,
                );
            }
          }}
        />
        <label className="sr-only" htmlFor={`${id}-type`}>
          Search entity type
        </label>
        <select
          id={`${id}-type`}
          aria-label="Search entity type"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setStatus(query.trim() ? "loading" : "empty");
            setActive(-1);
            setPage(null);
            openSearch();
          }}
        >
          <option value="all">All records</option>
          {SEARCHABLE_ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ENTITY_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      {open && query.trim() ? (
        <div className="global-entity-search-popover">
          <p className="muted" role="status">
            {status === "loading"
              ? "Searching authorized records…"
              : status === "failed"
                ? "Search is unavailable. Your query is kept."
                : status === "ok"
                  ? page?.results.length
                    ? `${page.results.length} suggestions. Use arrows to choose, or Enter to view all results.`
                    : page?.limitations.length
                      ? "No matches in the available sources."
                      : "No matching records."
                  : "Type a name, address or reference."}
          </p>
          {status === "failed" ? (
            <button
              type="button"
              onClick={() => {
                setAttempt((n) => n + 1);
                input.current?.focus();
              }}
            >
              Retry search
            </button>
          ) : null}
          <ul id={`${id}-options`} role="listbox" aria-label="Record suggestions">
            {page?.results.map((result, index) => (
              <li key={`${result.entity.type}:${result.entity.id}`} role="presentation">
                <a
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={active === index}
                  tabIndex={-1}
                  href={entityOpenHref(result.entity)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setOpen(false);
                    setActive(-1);
                  }}
                >
                  <strong>{result.entity.label}</strong>
                  <span>
                    {ENTITY_LABELS[result.entity.type]} · {result.entity.id}
                  </span>
                  <span className="muted">
                    {result.match.field}: {result.match.context}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {page?.limitations.map((limitation, index) => (
            <p className="muted" key={`${limitation.source}:${index}`}>
              {limitation.note ?? "Some metadata is unavailable."}
            </p>
          ))}
          <a href={resultsHref} target="_blank" rel="noopener noreferrer">
            View all matching results
          </a>
        </div>
      ) : null}
      {popupBlocked ? (
        <p className="global-search-popup-status" role="status">
          If your browser kept the tab closed,{" "}
          <a href={resultsHref} target="_blank" rel="noopener noreferrer">
            open search results
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}
