import { organizationDifferenceNote } from "@/lib/lease-documents/form-notes";
import type {
  LeasePacketFamilyRow,
  PacketContextReadiness,
} from "@/lib/lease-documents/lease-packet-readiness";
import type { SelectionFreshness } from "@/lib/lease-documents/packet-selection-freshness";
import { formatCentralTime } from "@/lib/lease-documents/returned-state-view";

/**
 * S235 R-S235-1: the read-only per-family readiness for this lease. Viewing writes nothing and
 * sends nothing; "Evaluate packet" stays the explicit snapshot step.
 */
export function LeasePacketReadiness({
  rows,
  selection = null,
  context = null,
}: Readonly<{
  rows: readonly LeasePacketFamilyRow[];
  /** S235 R-S235-6: the saved Dotloop selection and its last resource observation. */
  selection?: SelectionFreshness | null;
  context?: PacketContextReadiness | null;
}>) {
  const organizationNote = organizationDifferenceNote(
    rows.map((row) => row.organizations),
  );
  return (
    <section
      aria-label="Form families for this lease"
      className="ui-stack-tight"
      data-renewal-field="packet-family-readiness"
    >
      <h3>Form families for this lease</h3>
      <p className="muted">
        Read-only. Evaluate packet records a snapshot; nothing here writes one or sends
        anything.
      </p>
      {context ? (
        <div className="ui-stack-tight" data-renewal-field="current-packet-context">
          <h4>{context.label}</h4>
          <p className="muted">
            {context.observedAt
              ? `Current facts checked ${formatCentralTime(context.observedAt) ?? "at an unreadable time"}.`
              : "Current facts unavailable."}
          </p>
          {context.basis.length ? (
            <ul>
              {context.basis.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          ) : null}
          {context.missing.length ? (
            <ul>
              {context.missing.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          ) : null}
          <p className="muted">{context.saved}</p>
        </div>
      ) : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Form family</th>
              <th scope="col">Use</th>
              <th scope="col">Applies</th>
              <th scope="col">Original and map</th>
              <th scope="col">Missing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.kind} data-family={row.kind}>
                <th scope="row">{row.label}</th>
                <td>
                  {row.use}
                  <br />
                  <span className="muted">{row.useSource}</span>
                  {row.catalogSetup.length ? (
                    <details>
                      <summary>Shared catalog setup</summary>
                      <ul>
                        {row.catalogSetup.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                      <p className="muted">
                        This is separate from this lease&apos;s output requirements.
                      </p>
                    </details>
                  ) : null}
                </td>
                <td>{row.applicability}</td>
                <td>
                  {row.original}
                  <br />
                  <span className="muted">{row.map}</span>
                  {/* S253: what the reviewed form leaves blank and what it prints. */}
                  {row.notes?.length ? (
                    <ul data-form-notes>
                      {row.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  ) : null}
                  {row.printed?.length ? (
                    <details>
                      <summary>Printed on this form</summary>
                      <ul data-form-printed>
                        {row.printed.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </td>
                <td>
                  {row.missing.length ? row.missing.join("; ") : "Nothing missing"}
                  {row.questions?.length ? (
                    <ul data-form-questions>
                      {row.questions.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ul>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {organizationNote ? (
        <p className="muted" data-renewal-field="form-organization-difference">
          {organizationNote}
        </p>
      ) : null}
      {selection ? (
        <div className="ui-stack-tight" data-renewal-field="dotloop-selection-freshness">
          <h4>Dotloop selection</h4>
          <p>{selection.selection}</p>
          <p className="muted">{selection.observation}</p>
          {selection.problems.length ? (
            <ul>
              {selection.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">The saved selection matches the latest observation.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
