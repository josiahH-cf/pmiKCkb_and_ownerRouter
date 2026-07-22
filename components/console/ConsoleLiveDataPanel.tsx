import Link from "next/link";
import type {
  ConsoleField,
  ConsoleMessagePresence,
  ConsoleProjection,
} from "@/lib/console/live-data";

export function ConsoleLiveDataPanel({
  projection,
  title = projection.mode.kind === "test" ? "Test workspace" : "Live operations",
}: Readonly<{ projection: ConsoleProjection; title?: string }>) {
  return (
    <section aria-label="Current operations" className="panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p className="muted">
            {projection.mode.kind === "test"
              ? "Invented records complete the workflow here, entirely inside the test workspace."
              : "Live facts show their source and observation time. Message bodies load only inside an authorized workflow communication panel."}
          </p>
        </div>
        <span
          className="review-pill"
          data-testid={
            projection.mode.kind === "test"
              ? "console-test-data-badge"
              : "console-live-data-badge"
          }
        >
          {projection.mode.kind === "test" ? "Test data" : "Live data"}
        </span>
      </div>

      {projection.rows.length === 0 ? (
        <div className="workflow-record-list">
          {projection.sourceHealth.map((health) => (
            <article className="compact-record" key={health.source}>
              <strong>{health.source} unavailable</strong>
              <p className="muted">{health.guidance}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="workflow-record-list">
          {projection.rows.map((row) => (
            <article className="compact-record" key={row.rowKey}>
              <div className="workflow-record-heading">
                <div>
                  <strong>{displayValue(row.property)}</strong>
                  <p className="muted">{displayValue(row.tenant)}</p>
                </div>
                <Link className="text-link" href={row.workflowHref}>
                  Open workflow
                </Link>
              </div>
              <div className="grid three">
                <Field label="Current rent" field={row.currentRent} />
                <Field label="Lease end" field={row.leaseEnd} />
                <Field label="Workflow" field={row.workflow} />
              </div>
              {row.message ? <MessageMetadata field={row.message} /> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Field<T>({ label, field }: Readonly<{ field: ConsoleField<T>; label: string }>) {
  return (
    <div>
      <strong>{label}</strong>
      <p>{displayValue(field)}</p>
      <Provenance field={field} />
    </div>
  );
}

// F-CONS-4: the landing view shows only that a linked message is present, never its subject, sender,
// recipients, or snippet. The full message is read under the workflow's authorized communication panel.
function MessageMetadata({
  field,
}: Readonly<{ field: ConsoleField<ConsoleMessagePresence> }>) {
  if (!field.value) {
    return (
      <div className="notice">
        <strong>Gmail {field.state}</strong>
        <Provenance field={field} />
      </div>
    );
  }
  return (
    <div className="notice">
      <strong>Linked message on file</strong>
      <p className="muted">Open the workflow to read it under its communication panel.</p>
      <p className="muted">Last message {field.value.timestamp}</p>
      <Provenance field={field} />
    </div>
  );
}

function Provenance<T>({ field }: Readonly<{ field: ConsoleField<T> }>) {
  return (
    <p className="muted">
      {field.source} · {field.state}
      {field.observedAt
        ? ` · observed ${field.observedAt}`
        : " · observation unavailable"}
    </p>
  );
}

function displayValue<T>(field: ConsoleField<T>) {
  if (field.state === "unavailable") return "Unavailable";
  if (field.value === undefined || field.value === null || field.value === "") {
    return "Needs review";
  }
  return String(field.value);
}
