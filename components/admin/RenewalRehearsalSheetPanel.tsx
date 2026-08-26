import { DISCREPANCY_GUIDE } from "@/lib/lease-renewal/discrepancy";
import { resolveRenewalSheetBindings } from "@/lib/lease-renewal/rehearsal-sheet";

/** Admin-only links and plain-language copy-test guidance. No mutation control lives in the browser. */
export function RenewalRehearsalSheetPanel() {
  const bindings = resolveRenewalSheetBindings();
  return (
    <article className="panel" aria-labelledby="renewal-sheet-bindings-title">
      <h2 id="renewal-sheet-bindings-title">Renewal Sheet connections</h2>
      <p className="muted">
        The operating Sheet remains read-only here. A separate copy is required for any
        write/read/undo rehearsal.
      </p>
      <div className="grid two">
        <section>
          <h3>Operating Sheet</h3>
          {bindings.operating.configured ? (
            <p>
              <a href={bindings.operating.url} target="_blank" rel="noreferrer noopener">
                Open the operating renewal Sheet (view only)
              </a>
            </p>
          ) : (
            <p className="status-warning">Operating Sheet is not configured.</p>
          )}
          <p className="muted">Never use this link for a write test.</p>
        </section>
        <section>
          <h3>Rehearsal copy</h3>
          {bindings.rehearsal.status === "ready" ? (
            <>
              <p>
                <a
                  href={bindings.rehearsal.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open the rehearsal copy
                </a>
              </p>
              <p className="status-success">Separate copy is configured.</p>
            </>
          ) : bindings.rehearsal.status === "same_as_operating" ? (
            <p className="status-warning" role="alert">
              Refused: the rehearsal id points to the operating Sheet. Make a separate
              verbatim copy and configure that copy instead.
            </p>
          ) : (
            <p className="status-warning">
              No rehearsal copy is configured yet. Make a verbatim copy, then set{" "}
              <code>RENEWAL_REHEARSAL_SHEET_ID</code> to the copy&apos;s id.
            </p>
          )}
          <p className="muted">
            The copy-only proof requires a blank exact cell and a command-line
            confirmation. It writes one synthetic marker, reads it back, removes it, and
            confirms the cell is blank again.
          </p>
        </section>
      </div>
      <details>
        <summary>How we classify RentVine ↔ Sheet differences</summary>
        <div className="grid two">
          {DISCREPANCY_GUIDE.map((entry) => (
            <section key={entry.category}>
              <h3>{entry.label}</h3>
              <p>{entry.meaning}</p>
              <p className="muted">Example: {entry.syntheticExample}</p>
              <p>
                <strong>Next:</strong> {entry.nextStep}
              </p>
            </section>
          ))}
        </div>
      </details>
    </article>
  );
}
