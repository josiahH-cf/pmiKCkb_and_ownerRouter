import {
  LEASE_CADENCE_CONTRACT,
  LEASE_FIELD_AUTHORITY_CONTRACT,
  LEASE_LIVE_LIFECYCLE_OWNERSHIP,
  LEASE_SYSTEM_OWNERSHIP_CONTRACT,
} from "@/lib/lease-renewal/business-contract";

export function LeaseBusinessContractPanel() {
  return (
    <section aria-label="Lease Renewal operating contract" className="panel ui-stack">
      <div>
        <h2 className="section-subtitle">Lease Renewal operating contract</h2>
        <p className="muted">
          Bodyless rules only. Customer values remain on their authorized source and
          owning record.
        </p>
      </div>

      <section className="ui-callout ui-stack" aria-label="Live lifecycle ownership">
        <h3>Live lifecycle ownership</h3>
        <dl className="review-grid">
          <div>
            <dt>Current coordination surface</dt>
            <dd>{LEASE_LIVE_LIFECYCLE_OWNERSHIP.currentCoordinationSurface}</dd>
          </div>
          <div>
            <dt>Current scope</dt>
            <dd>{LEASE_LIVE_LIFECYCLE_OWNERSHIP.currentCoordinationScope}</dd>
          </div>
          <div>
            <dt>Durable per-lease Live lifecycle</dt>
            <dd>Absent: the shared Live Review must not be treated as one.</dd>
          </div>
          <div>
            <dt>Exact next action</dt>
            <dd>{LEASE_LIVE_LIFECYCLE_OWNERSHIP.exactNextAction}</dd>
          </div>
        </dl>
      </section>

      <details>
        <summary>Cadence, off-cycle, and worklog contract</summary>
        <ul className="compact-list">
          {LEASE_CADENCE_CONTRACT.map((rule) => (
            <li key={rule.id}>
              <strong>{rule.requirement}</strong>
              <br />
              <span>Owner: {rule.sourceOwner}</span>
              <br />
              <span>
                Current result: {statusLabel(rule.status)} · {rule.currentSupport}
              </span>
            </li>
          ))}
        </ul>
      </details>

      <details>
        <summary>Field authority and fallback matrix</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Authority order</th>
                <th>Fallback</th>
                <th>Disposition</th>
              </tr>
            </thead>
            <tbody>
              {LEASE_FIELD_AUTHORITY_CONTRACT.map((rule) => (
                <tr key={rule.field}>
                  <td>{rule.field}</td>
                  <td>{rule.precedence}</td>
                  <td>{rule.fallback}</td>
                  <td>{rule.disposition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Any unlisted field type is Blocked with “no precedence rule”; the app never
          guesses.
        </p>
      </details>

      <details>
        <summary>System ownership and write boundaries</summary>
        <ul className="compact-list">
          {LEASE_SYSTEM_OWNERSHIP_CONTRACT.map((system) => (
            <li key={system.system}>
              <strong>{system.system}</strong> · {system.ownership}
              <br />
              <span>Write boundary: {system.liveWrite}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function statusLabel(status: (typeof LEASE_CADENCE_CONTRACT)[number]["status"]) {
  switch (status) {
    case "supported":
      return "Supported";
    case "partial":
      return "Partial";
    case "absent":
      return "Absent";
  }
}
