import { AppShell } from "@/components/layout/AppShell";
import { WorkflowRunClient } from "@/components/workflows/WorkflowRunClient";
import { can } from "@/lib/auth/roles";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { getWorkflowRun, listWorkflowRunTimeline } from "@/lib/firestore/workflows";

interface WorkflowRunPageProps {
  params: Promise<{ runId: string }>;
}

export default async function WorkflowRunPage({ params }: WorkflowRunPageProps) {
  const user = await requirePageCapability("read");
  const { runId } = await params;
  let loadError = false;
  let run: Awaited<ReturnType<typeof getWorkflowRun>> | undefined;
  let timeline: Awaited<ReturnType<typeof listWorkflowRunTimeline>> = [];

  try {
    [run, timeline] = await Promise.all([
      getWorkflowRun(user, runId),
      listWorkflowRunTimeline(user, runId),
    ]);
  } catch {
    loadError = true;
  }

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Workflow Run</h1>
        {loadError || !run ? (
          <article className="panel">
            <p className="muted">
              This workflow run is unavailable. Refresh Google credentials or check
              Firestore setup.
            </p>
          </article>
        ) : (
          <WorkflowRunClient
            canEdit={can(user.role, "edit")}
            initialRun={run}
            initialTimeline={timeline}
          />
        )}
      </section>
    </AppShell>
  );
}
