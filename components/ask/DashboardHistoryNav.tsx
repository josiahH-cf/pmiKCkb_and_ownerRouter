"use client";

import { formatBusinessTimestamp } from "@/lib/date-display";
import type { HistoryConversationSummary } from "@/lib/assistant-history/client";

// S148 compact history navigation beside the AI workspace. It lists the signed-in user's saved
// conversations by their first question and time (no model naming), pages to older history, and
// keeps "nothing saved yet" distinct from a read that failed. Choosing an entry reopens it; nothing
// is asked again.

export type HistoryListStatus = "loading" | "ok" | "failed";

export interface HistoryListState {
  readonly status: HistoryListStatus;
  readonly entries: readonly HistoryConversationSummary[];
  readonly nextCursor: string | null;
  /** The status of the most recent "Show older" read; null before one is asked for. */
  readonly olderStatus: "loading" | "failed" | null;
}

export function DashboardHistoryNav({
  state,
  activeConversationId,
  onOpen,
  onRetry,
  onShowOlder,
  label = "History",
  onTogglePin,
  pinBusy,
  pinPending,
}: Readonly<{
  state: HistoryListState;
  activeConversationId: string | null;
  onOpen: (conversationId: string) => void;
  onRetry: () => void;
  onShowOlder: () => void;
  label?: "History" | "Pinned conversations";
  onTogglePin?: (entry: HistoryConversationSummary) => void;
  pinBusy?: ReadonlySet<string>;
  pinPending?: ReadonlySet<string>;
}>) {
  return (
    <nav
      aria-busy={state.status === "loading" ? "true" : undefined}
      aria-label={label}
      className="panel dashboard-nav"
    >
      <h2>{label}</h2>
      {state.status === "loading" ? (
        <p className="muted">Loading your history…</p>
      ) : state.status === "failed" ? (
        <>
          <p className="muted" data-history-state="failed">
            {label === "History"
              ? "Your history could not be loaded just now. Nothing was removed."
              : "Pinned conversations could not be loaded. Your history is kept."}
          </p>
          <button className="link-button" onClick={onRetry} type="button">
            Try again
          </button>
        </>
      ) : state.entries.length === 0 ? (
        <p className="muted" data-history-state="empty">
          {label === "History"
            ? "No saved conversations here. Questions you ask here are saved to your history."
            : "No pinned conversations yet. Pin a whole thread to return to it here."}
        </p>
      ) : (
        <>
          <ul className="dashboard-nav-list">
            {state.entries.map((entry) => (
              <li key={entry.conversationId}>
                <button
                  aria-current={
                    entry.conversationId === activeConversationId ? "true" : undefined
                  }
                  className="link-button"
                  onClick={() => onOpen(entry.conversationId)}
                  type="button"
                >
                  {entry.title}
                </button>
                {onTogglePin ? (
                  <button
                    type="button"
                    className="link-button"
                    disabled={pinBusy?.has(entry.conversationId)}
                    aria-label={
                      pinPending?.has(entry.conversationId)
                        ? `Retry pin change: ${entry.title}`
                        : `${entry.pinned ? "Unpin" : "Pin"} conversation: ${entry.title}`
                    }
                    onClick={() => onTogglePin(entry)}
                  >
                    {pinPending?.has(entry.conversationId)
                      ? "Retry pin change"
                      : entry.pinned
                        ? "Unpin conversation"
                        : "Pin conversation"}
                  </button>
                ) : null}
                <span className="muted">
                  {formatBusinessTimestamp(entry.updatedAtIso)} · {entry.turnCount}{" "}
                  {entry.turnCount === 1 ? "question" : "questions"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {state.status === "ok" ? (
        <>
          {state.olderStatus === "failed" ? (
            <p className="muted" role="status">
              Older history could not be loaded just now.
            </p>
          ) : null}
          {state.nextCursor ? (
            <button
              className="link-button"
              disabled={state.olderStatus === "loading"}
              onClick={onShowOlder}
              type="button"
            >
              {state.olderStatus === "loading"
                ? "Loading older history…"
                : state.olderStatus === "failed"
                  ? "Try older history again"
                  : label === "History"
                    ? "Show older history"
                    : "Show older pinned conversations"}
            </button>
          ) : null}
        </>
      ) : null}
    </nav>
  );
}
