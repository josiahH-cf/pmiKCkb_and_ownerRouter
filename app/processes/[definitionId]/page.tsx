import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProcessDefinitionDetailClient } from "@/components/workflows/ProcessDefinitionDetailClient";
import { can } from "@/lib/auth/roles";
import { primarySpaceHref, requirePageCapability } from "@/lib/auth/page-guards";
import { getProcessDefinition, listWorkflowRuns } from "@/lib/firestore/workflows";
import { canAccessProcessDefinition } from "@/lib/space-scope-resources";
import {
  isRetiredMaintenanceWorkflow,
  MAINTENANCE_RETIREMENT_MESSAGE,
} from "@/lib/maintenance/retirement";

interface ProcessDefinitionPageProps {
  params: Promise<{ definitionId: string }>;
}

export default async function ProcessDefinitionPage({
  params,
}: ProcessDefinitionPageProps) {
  const user = await requirePageCapability("read");
  const { definitionId } = await params;
  let loadError = false;
  let definition: Awaited<ReturnType<typeof getProcessDefinition>> | undefined;
  let runs: Awaited<ReturnType<typeof listWorkflowRuns>> = [];

  try {
    [definition, runs] = await Promise.all([
      getProcessDefinition(user, definitionId),
      listWorkflowRuns(user, { definitionId }),
    ]);
    if (!canAccessProcessDefinition(user, definition)) {
      redirect(primarySpaceHref());
    }
  } catch {
    loadError = true;
  }

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/processes">
          Back to Processes
        </Link>
        <h1 className="section-title">Process Definition</h1>
        {definition &&
        isRetiredMaintenanceWorkflow(definition.space_id, definition.id) ? (
          <p>{MAINTENANCE_RETIREMENT_MESSAGE}</p>
        ) : null}
        {loadError || !definition ? (
          <article className="panel">
            <p className="muted">
              This process definition is unavailable. Refresh Google credentials or check
              Firestore setup.
            </p>
          </article>
        ) : (
          <ProcessDefinitionDetailClient
            canEdit={
              can(user.role, "edit") &&
              !isRetiredMaintenanceWorkflow(definition.space_id, definition.id)
            }
            initialDefinition={definition}
            initialRuns={runs}
          />
        )}
      </section>
    </AppShell>
  );
}
