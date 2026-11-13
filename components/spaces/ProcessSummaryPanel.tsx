import Link from "next/link";
import type { ProcessDefinitionRecord, WorkflowRunRecord } from "@/lib/firestore/types";
import { isGuidanceOnlyWorkflowRun } from "@/lib/processes/guidance-only";
import { workflowRunNextAction } from "@/lib/processes/run-next-action";

/**
 * Read-only, advisory view of the process a Space carries (Spaces ⊇ Processes). It surfaces the
 * definition + recent ordinary runs beside the Space and deep-links to the full process
 * engine at /processes/{id} — it never edits, activates, or runs anything (the engine stays the
 * canonical edit surface). `definition` is null when it is not seeded yet.
 */
export function ProcessSummaryPanel({
  definitionId,
  definition,
  runs,
}: {
  definitionId: string;
  definition: ProcessDefinitionRecord | null;
  runs: readonly WorkflowRunRecord[];
}) {
  // S286 R-S286-3: an earlier renewal run is a record, not work; it supplies no next action here.
  const recentRuns = runs.filter((run) => !isGuidanceOnlyWorkflowRun(run));
  if (!definition) {
    return (
      <div className="panel">
        <h2>Process</h2>
        <p className="muted">Process definition unavailable.</p>
        <Link className="text-link" href={`/processes/${definitionId}`}>
          View full process →
        </Link>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="section-heading-row">
        <div>
          <h2>{definition.name}</h2>
          <p className="muted">{definition.short_outcome}</p>
        </div>
        <span className="review-pill">{definition.status}</span>
      </div>
      <p className="muted">
        Immutable version: {definition.active_version_id ?? "Not published"}
      </p>

      <h3>Steps</h3>
      <ol className="compact-list">
        {definition.steps.map((step) => (
          <li key={step.id}>{step.title}</li>
        ))}
      </ol>

      <h3>Recent runs</h3>
      {recentRuns.length === 0 ? (
        <p className="muted">No workflow runs yet.</p>
      ) : (
        <ul className="compact-list">
          {recentRuns.map((run) => (
            <li key={run.id}>
              {run.status}: {workflowRunNextAction(run)} · Definition version:{" "}
              {run.definition_version_id ?? "Not pinned (draft)"}
            </li>
          ))}
        </ul>
      )}

      <Link className="text-link" href={`/processes/${definition.id}`}>
        View full process →
      </Link>
    </div>
  );
}
