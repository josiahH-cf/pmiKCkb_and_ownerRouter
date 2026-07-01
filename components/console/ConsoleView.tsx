import { AskForm, type ProcessOption } from "@/components/ask/AskForm";
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
  let processes: ProcessOption[] = [];
  if (canStartSimulation) {
    try {
      const definitions = await listProcessDefinitions(user);
      processes = definitions.map((definition) => ({
        id: definition.id,
        name: definition.name,
        status: definition.status,
      }));
    } catch {
      processes = [];
    }
  }

  return (
    <section className="content">
      <h1 className="section-title">Console</h1>
      <p className="muted">
        Ask a grounded question, or start a process to run a safe simulation — answers
        cite approved sources, and a simulation never touches a system of record.
      </p>
      <AskForm canStartSimulation={canStartSimulation} processes={processes} />
    </section>
  );
}
