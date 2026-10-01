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
}: Readonly<{
  state: HistoryListState;
  activeConversationId: string | null;
  onOpen: (conversationId: string) => void;
  onRetry: () => void;
  onShowOlder: () => void;
}>) {
  return (
    <nav
      aria-busy={state.status === "loading" ? "true" : undefined}
      aria-label="History"
      className="panel dashboard-nav"
    >
      <h2>History</h2>
      {state.status === "loading" ? (
        <p className="muted">Loading your history…</p>
      ) : state.status === "failed" ? (
        <>
          <p className="muted" data-history-state="failed">
            Your history could not be loaded just now. Nothing was removed.
          </p>
          <button className="link-button" onClick={onRetry} type="button">
            Try again
          </button>
        </>
      ) : state.entries.length === 0 ? (
        <p className="muted" data-history-state="empty">
          No saved conversations yet. Questions you ask here are saved to your history.
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
                <span className="muted">
                  {formatBusinessTimestamp(entry.updatedAtIso)} · {entry.turnCount}{" "}
                  {entry.turnCount === 1 ? "question" : "questions"}
                </span>
              </li>
            ))}
          </ul>
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
                  : "Show older history"}
            </button>
          ) : null}
        </>
      )}
    </nav>
  );
}
