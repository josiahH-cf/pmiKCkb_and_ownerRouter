import { AppShell } from "@/components/layout/AppShell";
import { WorkflowRunClient } from "@/components/workflows/WorkflowRunClient";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth/roles";
import { primarySpaceHref, requirePageCapability } from "@/lib/auth/page-guards";
import {
  getProcessDefinition,
  getWorkflowRun,
  listWorkflowRunTimeline,
} from "@/lib/firestore/workflows";
import { listStepChecksForRun } from "@/lib/firestore/workflow-run-step-checks";
import type {
  ProcessDefinitionStep,
  WorkflowRunStepCheckRecord,
} from "@/lib/firestore/types";
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
  let steps: ProcessDefinitionStep[] = [];
  let checks: WorkflowRunStepCheckRecord[] = [];

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
      const [loadedTimeline, definition, loadedChecks] = await Promise.all([
        listWorkflowRunTimeline(user, runId),
        getProcessDefinition(user, run.definition_id),
        listStepChecksForRun(user, runId),
      ]);
      timeline = loadedTimeline;
      steps = definition.steps;
      checks = loadedChecks;
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
            initialChecks={checks}
            initialRun={run}
            initialSteps={steps}
            initialTimeline={timeline}
          />
        )}
      </section>
    </AppShell>
  );
}
