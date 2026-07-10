import { AppShell } from "@/components/layout/AppShell";
import { WorkflowRunClient } from "@/components/workflows/WorkflowRunClient";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth/roles";
import { primarySpaceHref, requirePageCapability } from "@/lib/auth/page-guards";
import { getWorkflowRun, listWorkflowRunTimeline } from "@/lib/firestore/workflows";
import { canAccessWorkflowRun } from "@/lib/space-scope-resources";

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
    run = await getWorkflowRun(user, runId);
  } catch {
    loadError = true;
  }

  if (run && !canAccessWorkflowRun(user, run)) {
    redirect(primarySpaceHref(user));
  }

  if (run) {
    try {
      timeline = await listWorkflowRunTimeline(user, runId);
    } catch {
      loadError = true;
    }
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
