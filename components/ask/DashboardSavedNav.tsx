"use client";

import { useId, useState } from "react";

import { formatBusinessTimestamp } from "@/lib/date-display";
import type { SavedQuestionView } from "@/lib/assistant-history/client";

// S149 compact saved-question navigation beside the AI workspace. Pinned items come first. Each
// item offers two distinct actions: "Open last answer" shows what is stored (no request beyond
// reading it, no model call) and "Run for current results" runs the saved question again, which
// adds a new answer and never changes the earlier one. Navigation alone never runs anything.

export type SavedListStatus = "loading" | "ok" | "failed";

export interface SavedListState {
  readonly status: SavedListStatus;
  readonly items: readonly SavedQuestionView[];
  readonly truncated: boolean;
  /** The outcome of the latest pin, label or run attempt, announced politely. */
  readonly message: string | null;
}

const RELATIVE_WORDS: Record<string, string> = {
  today: "today",
  this_week: "this week",
  next_week: "next week",
  this_month: "this month",
  next_month: "next month",
  last_month: "last month",
  overdue: "overdue",
};

/** How a saved question's period behaves when it runs again. */
export function savedPeriodLine(item: SavedQuestionView): string | null {
  const range = item.originalRange;
  if (!range) return null;
  if (range.intent === "fixed")
    return `Period: ${range.label}. It stays fixed on every run.`;
  const words = RELATIVE_WORDS[range.preset] ?? "the same relative period";
  return `Period: ${words}, worked out again on each run. The last answer covered ${range.label}.`;
}

export function DashboardSavedNav({
  state,
  busy,
  onOpen,
  onRun,
  onTogglePin,
  onRename,
  onRetry,
}: Readonly<{
  state: SavedListState;
  /** Items with a request in flight, so their controls cannot be pressed twice. */
  busy: ReadonlySet<string>;
  onOpen: (item: SavedQuestionView) => void;
  onRun: (item: SavedQuestionView) => void;
  onTogglePin: (item: SavedQuestionView) => void;
  onRename: (item: SavedQuestionView, label: string) => void;
  onRetry: () => void;
}>) {
  return (
    <nav
      aria-busy={state.status === "loading" ? "true" : undefined}
      aria-label="Saved questions"
      className="panel dashboard-nav"
    >
      <h2>Saved questions</h2>
      <p
        aria-atomic="true"
        aria-live="polite"
        className="muted"
        data-testid="saved-status"
      >
        {state.message ?? ""}
      </p>
      {state.status === "loading" ? (
        <p className="muted">Loading your saved questions…</p>
      ) : state.status === "failed" ? (
        <>
          <p className="muted" data-saved-state="failed">
            Your saved questions could not be loaded just now. Nothing was removed.
          </p>
          <button className="link-button" onClick={onRetry} type="button">
            Try again
          </button>
        </>
      ) : state.items.length === 0 ? (
        <p className="muted" data-saved-state="empty">
          No saved questions yet. Use Save question on an answer to keep it here.
        </p>
      ) : (
        <>
          <ul className="dashboard-nav-list dashboard-saved-list">
            {state.items.map((item) => (
              <SavedItem
                busy={busy.has(item.savedId)}
                item={item}
                key={item.savedId}
                onOpen={onOpen}
                onRename={onRename}
                onRun={onRun}
                onTogglePin={onTogglePin}
              />
            ))}
          </ul>
          {state.truncated ? (
            <p className="muted">Showing your 100 most recently saved questions.</p>
          ) : null}
        </>
      )}
    </nav>
  );
}

function SavedItem({
  item,
  busy,
  onOpen,
  onRun,
  onTogglePin,
  onRename,
}: Readonly<{
  item: SavedQuestionView;
  busy: boolean;
  onOpen: (item: SavedQuestionView) => void;
  onRun: (item: SavedQuestionView) => void;
  onTogglePin: (item: SavedQuestionView) => void;
  onRename: (item: SavedQuestionView, label: string) => void;
}>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.label);
  const inputId = useId();
  const period = savedPeriodLine(item);
  return (
    <li data-pinned={item.pinned ? "true" : undefined} data-testid="saved-item">
      <p className="dashboard-saved-label">
        {item.pinned ? <span className="dashboard-saved-pin">Pinned</span> : null}
        {item.label}
      </p>
      <p className="muted">
        Last answered {formatBusinessTimestamp(item.lastAnsweredAtIso)}.
        {item.structured
          ? " Running it again reads current records without a new interpretation."
          : " Asking it again gives a newly generated answer."}
      </p>
      {period ? <p className="muted">{period}</p> : null}
      <div className="dashboard-saved-actions">
        <button className="link-button" onClick={() => onOpen(item)} type="button">
          Open last answer
        </button>
        <button
          className="link-button"
          disabled={busy}
          onClick={() => onRun(item)}
          type="button"
        >
          {item.structured ? "Run for current results" : "Ask again"}
        </button>
        <button
          aria-pressed={item.pinned}
          className="link-button"
          disabled={busy}
          onClick={() => onTogglePin(item)}
          type="button"
        >
          {item.pinned ? "Unpin" : "Pin"}
        </button>
        <button
          aria-expanded={editing}
          className="link-button"
          disabled={busy}
          onClick={() => {
            setDraft(item.label);
            setEditing((open) => !open);
          }}
          type="button"
        >
          Rename
        </button>
      </div>
      {editing ? (
        <form
          aria-label={`Rename ${item.label}`}
          className="dashboard-saved-rename"
          onSubmit={(event) => {
            event.preventDefault();
            const label = draft.trim();
            if (!label) return;
            setEditing(false);
            if (label !== item.label) onRename(item, label);
          }}
        >
          <label className="field-label" htmlFor={inputId}>
            Label
          </label>
          <input
            id={inputId}
            maxLength={80}
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
          <div className="ui-row">
            <button className="secondary-button" type="submit">
              Save label
            </button>
            <button
              className="link-button"
              onClick={() => setEditing(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
