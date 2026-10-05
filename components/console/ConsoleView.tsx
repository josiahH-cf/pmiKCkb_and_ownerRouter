import { AskForm, type HistoryMode } from "@/components/ask/AskForm";
import { DashboardAttentionQueue } from "@/components/console/DashboardAttentionQueue";
import type {
  HistoryPageOutcome,
  SavedListOutcome,
} from "@/lib/assistant-history/client";
import {
  gatherAttentionQueue,
  unavailableAttentionQueue,
  type AttentionQueue,
} from "@/lib/attention/attention-queue";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { historyModeFor } from "@/lib/assistant-history/route-support";
import {
  historyOwnerKey,
  listAssistantConversations,
} from "@/lib/firestore/assistant-history-read";
import { listSavedQuestions } from "@/lib/firestore/assistant-saved-questions";

/** Where this user's Dashboard conversations are kept (shared with the query route). */
export function resolveHistoryMode(
  user: AuthenticatedUser,
  env: Record<string, string | undefined> = process.env,
): HistoryMode {
  return historyModeFor(user, env);
}

/**
 * The Dashboard body, rendered at both `/` (home) and `/ask` (the preserved route). Callers wrap it
 * in <AppShell>.
 *
 * S146/S147: the AI workspace is the first primary element and nothing on this page waits for a
 * panel read before it renders. The compact attention queue is the only standing non-AI panel; its
 * read starts here and streams into its own boundary, so a slow or failed read shows its own state
 * while the question box already works. Process browsing and run start live in Internal Processes,
 * Anticipated work moved there beside Start run, setup status lives in Connections and the Internal
 * Processes cards, and lease detail lives on the renewal desk.
 *
 * S148/S149: the first page of the user's own history and their saved questions are read here and
 * streamed in the same way; the workspace is keyed by the signed-in user, so another account never
 * sees this one's state.
 */
export function ConsoleView({ user }: { user: AuthenticatedUser }) {
  const canApprove = can(user.role, "approve");
  const ownerKey = historyOwnerKey(user.uid);
  const historyMode = resolveHistoryMode(user);
  // Started, not awaited: the page streams the question box first.
  const attention: Promise<AttentionQueue> = gatherAttentionQueue(user).catch(() =>
    unavailableAttentionQueue(),
  );
  const initialHistory: Promise<HistoryPageOutcome> | null =
    historyMode === "saved"
      ? listAssistantConversations(user).then(
          (page): HistoryPageOutcome => ({
            status: "ok",
            page: { ownerKey, persisted: true, ...page },
          }),
          (): HistoryPageOutcome => ({ status: "failed" }),
        )
      : null;

  const initialSaved: Promise<SavedListOutcome> | null =
    historyMode === "saved"
      ? listSavedQuestions(user).then(
          (list): SavedListOutcome => ({
            status: "ok",
            list: { ownerKey, persisted: true, ...list },
          }),
          (): SavedListOutcome => ({ status: "failed" }),
        )
      : null;

  return (
    <section className="content console">
      <h1 className="section-title">Dashboard</h1>
      <AskForm
        historyMode={historyMode}
        initialHistory={initialHistory}
        initialSaved={initialSaved}
        key={ownerKey}
        ownerKey={ownerKey}
        secondary={
          <DashboardAttentionQueue canApprove={canApprove} initial={attention} />
        }
      />
    </section>
  );
}
