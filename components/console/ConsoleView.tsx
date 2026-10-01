import { AskForm } from "@/components/ask/AskForm";
import { DashboardAttentionQueue } from "@/components/console/DashboardAttentionQueue";
import {
  gatherAttentionQueue,
  unavailableAttentionQueue,
  type AttentionQueue,
} from "@/lib/attention/attention-queue";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";

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
 */
export function ConsoleView({ user }: { user: AuthenticatedUser }) {
  const canApprove = can(user.role, "approve");
  // Started, not awaited: the page streams the question box first.
  const attention: Promise<AttentionQueue> = gatherAttentionQueue(user).catch(() =>
    unavailableAttentionQueue(),
  );

  return (
    <section className="content console">
      <h1 className="section-title">Dashboard</h1>
      <p className="muted console-purpose">
        Ask about the leases, work, approvals and processes you can see. Answers appear
        below your question.
      </p>
      <AskForm
        secondary={
          <DashboardAttentionQueue canApprove={canApprove} initial={attention} />
        }
      />
    </section>
  );
}
