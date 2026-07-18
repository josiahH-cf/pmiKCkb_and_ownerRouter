import Link from "next/link";
import type { ProcessDefinitionRecord, WorkflowRunRecord } from "@/lib/firestore/types";

/**
 * Read-only, advisory view of the process a Space carries (Spaces ⊇ Processes). It surfaces the
 * definition + recent SAFE simulation runs beside the Space and deep-links to the full process
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
  if (!definition) {
    return (
      <div className="panel">
        <h2>Process</h2>
        <p className="muted">
          This Space has a process, but its definition has not been seeded yet. Once it is
          seeded it will show here.
        </p>
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

      <h3>Recent test runs</h3>
      {runs.length === 0 ? (
        <p className="muted">No test runs yet.</p>
      ) : (
        <ul className="compact-list">
          {runs.map((run) => (
            <li key={run.id}>
              {run.status}: {run.next_action} · Definition version:{" "}
              {run.definition_version_id ?? "Not pinned (draft)"}
              {run.source_publication_pin
                ? ` · Test source publication: ${run.source_publication_pin.version_id}`
                : ""}
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
