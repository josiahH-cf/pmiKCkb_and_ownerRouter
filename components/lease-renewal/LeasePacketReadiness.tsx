import type { LeasePacketFamilyRow } from "@/lib/lease-documents/lease-packet-readiness";

/**
 * S235 R-S235-1: the read-only per-family readiness for this lease. Viewing writes nothing and
 * sends nothing; "Evaluate packet" stays the explicit snapshot step.
 */
export function LeasePacketReadiness({
  rows,
}: Readonly<{ rows: readonly LeasePacketFamilyRow[] }>) {
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
              </td>
              <td>{row.applicability}</td>
              <td>
                {row.original}
                <br />
                <span className="muted">{row.map}</span>
              </td>
              <td>{row.missing.length ? row.missing.join("; ") : "Nothing missing"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
