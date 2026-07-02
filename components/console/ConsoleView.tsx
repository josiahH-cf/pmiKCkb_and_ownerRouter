import {
  AskForm,
  type ConsoleNextAction,
  type ProcessOption,
} from "@/components/ask/AskForm";
import { gatherNeedsDecisionInbox } from "@/lib/approval/needs-decision-gather";
import {
  resolveConnectionsState,
  resolveCoverageState,
} from "@/lib/ask/app-state-context";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { listProcessDefinitions } from "@/lib/firestore/workflows";

/**
 * The Console body — the app's front door. Rendered at both `/` (home) and `/ask` (the preserved
 * route), so the Console is reachable from the brand/home and its own URL. Callers wrap it in
 * <AppShell> (this returns only the inner section, never the shell, to avoid double-wrapping).
 *
 * Process-aware: editors can start a process, which runs a SAFE simulation (no system-of-record
 * write). Read-only users get the grounded-answer console only.
 */
export async function ConsoleView({ user }: { user: AuthenticatedUser }) {
  const canStartSimulation = can(user.role, "edit");
  // One definitions read serves both the process picker and the coverage count (C3).
  let definitions: Awaited<ReturnType<typeof listProcessDefinitions>> = [];
  try {
    definitions = await listProcessDefinitions(user);
  } catch {
    definitions = [];
  }
  const processes: ProcessOption[] = canStartSimulation
    ? definitions.map((definition) => ({
        id: definition.id,
        name: definition.name,
        status: definition.status,
      }))
    : [];

  // Live, value-free counts for the command buttons + the one-line next right action (S13 C3).
  // Approvals come from the SAME merged needs-decision gather every other surface answers from
  // (B5/C4 — one honest number); all reads are read-only and non-fatal.
  const inbox = await gatherNeedsDecisionInbox(user);
  const connections = resolveConnectionsState();
  const coverage = await resolveCoverageState(
    user,
    new Set(definitions.map((definition) => definition.id)),
  );
  const commandCounts = {
    approvals: inbox.counts.total,
    connections: connections.items.length,
    coverage: coverage.items.length,
  };
  const topRow = inbox.rows.at(0);
  const nextAction: ConsoleNextAction | null = topRow
    ? { count: inbox.counts.total, label: topRow.label, href: topRow.href }
    : null;

  return (
    <section className="content">
      <h1 className="section-title">Console</h1>
      <p className="muted">
        Ask a grounded question, or start a process as a test run. Answers cite approved
        sources, and a test run never touches a system of record.
      </p>
      <AskForm
        canStartSimulation={canStartSimulation}
        commandCounts={commandCounts}
        nextAction={nextAction}
        processes={processes}
      />
    </section>
  );
}
