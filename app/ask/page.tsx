import { AskForm, type ProcessOption } from "@/components/ask/AskForm";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { listProcessDefinitions } from "@/lib/firestore/workflows";

export default async function AskPage() {
  const user = await requirePageCapability("read");

  // The Console is process-aware: editors can start a process, which runs a SAFE simulation (no
  // system-of-record write). Read-only users get the grounded-answer console only.
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
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Console</h1>
        <p className="muted">
          Ask a grounded question, or start a process to run a safe simulation — answers cite
          approved sources, and a simulation never touches a system of record.
        </p>
        <AskForm canStartSimulation={canStartSimulation} processes={processes} />
      </section>
    </AppShell>
  );
}
