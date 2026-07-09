"use client";

import { useEffect, useState } from "react";

// Reusable unit type-ahead (slice 2a). Debounces the query against the edit-gated
// /api/maintenance/units/search endpoint (which serves from the ~10-minute TTL unit index, never a live
// per-keystroke read), lists the matches as clickable buttons, and calls onSelect with the picked unit or
// null. It degrades non-fatally (a 503/network failure shows a note, never a crash) and suppresses Enter so
// it can never submit an enclosing form. Client component: no server/firebase-admin import.

export interface UnitTypeaheadSelection {
  unitId: string;
  label: string;
}

interface UnitTypeaheadProps {
  id: string;
  label?: string;
  placeholder?: string;
  onSelect: (unit: UnitTypeaheadSelection | null) => void;
}

const DEBOUNCE_MS = 200;

export function UnitTypeahead({
  id,
  label = "Unit / location",
  placeholder = "Start typing an address or unit number",
  onSelect,
}: Readonly<UnitTypeaheadProps>) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnitTypeaheadSelection[]>([]);
  const [note, setNote] = useState("");
  // True once a suggestion is picked, so setting the input to the label does not re-trigger a search.
  const [picked, setPicked] = useState(false);

  useEffect(() => {
    if (picked) return;
    const trimmed = query.trim();

    // All state updates are deferred inside the debounce timer, never synchronous in the effect body.
    const handle = setTimeout(() => {
      if (trimmed === "") {
        setResults([]);
        setNote("");
        return;
      }
      void (async () => {
        try {
          const response = await fetch(
            `/api/maintenance/units/search?q=${encodeURIComponent(trimmed)}`,
          );
          if (!response.ok) {
            setResults([]);
            setNote(
              "Unit lookup is unavailable right now. You can keep going without it.",
            );
            return;
          }
          const payload = (await response.json()) as { units: UnitTypeaheadSelection[] };
          setResults(payload.units);
          setNote(payload.units.length === 0 ? "No matching units yet." : "");
        } catch {
          setResults([]);
          setNote("Could not reach the unit lookup. You can keep going without it.");
        }
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query, picked]);

  function choose(unit: UnitTypeaheadSelection) {
    setPicked(true);
    setQuery(unit.label);
    setResults([]);
    setNote("");
    onSelect(unit);
  }

  return (
    <div className="ui-stack">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => {
          setPicked(false);
          setQuery(event.target.value);
          onSelect(null);
        }}
        onKeyDown={(event) => {
          // Never submit an enclosing form from the type-ahead.
          if (event.key === "Enter") event.preventDefault();
        }}
      />
      {results.length > 0 ? (
        <ul className="ui-stack" role="listbox" aria-label="Unit suggestions">
          {results.map((unit) => (
            <li key={unit.unitId}>
              <button type="button" onClick={() => choose(unit)}>
                {unit.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="muted">{note}</p> : null}
    </div>
  );
}
