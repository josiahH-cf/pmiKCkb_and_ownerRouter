import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProcessDefinitionDetailClient } from "@/components/workflows/ProcessDefinitionDetailClient";
import { can } from "@/lib/auth/roles";
import { primarySpaceHref, requirePageCapability } from "@/lib/auth/page-guards";
import { getProcessDefinition, listWorkflowRuns } from "@/lib/firestore/workflows";
import { canAccessProcessDefinitionId } from "@/lib/space-scope-resources";

interface ProcessDefinitionPageProps {
  params: Promise<{ definitionId: string }>;
}

export default async function ProcessDefinitionPage({
  params,
}: ProcessDefinitionPageProps) {
  const user = await requirePageCapability("read");
  const { definitionId } = await params;
  if (!canAccessProcessDefinitionId(user, definitionId)) {
    redirect(primarySpaceHref(user));
  }
  let loadError = false;
  let definition: Awaited<ReturnType<typeof getProcessDefinition>> | undefined;
  let runs: Awaited<ReturnType<typeof listWorkflowRuns>> = [];

  try {
    [definition, runs] = await Promise.all([
      getProcessDefinition(user, definitionId),
      listWorkflowRuns(user, { definitionId }),
    ]);
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
        {loadError || !definition ? (
          <article className="panel">
            <p className="muted">
              This process definition is unavailable. Refresh Google credentials or check
              Firestore setup.
            </p>
          </article>
        ) : (
          <ProcessDefinitionDetailClient
            canEdit={can(user.role, "edit")}
            canManageAdmin={can(user.role, "manageAdmin")}
            initialDefinition={definition}
            initialRuns={runs}
          />
        )}
      </section>
    </AppShell>
  );
}
