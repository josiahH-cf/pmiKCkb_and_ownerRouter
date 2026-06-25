// One connector card for the Connection Center — name, what it powers, live status, and a guided
// "Set up" wizard. App-managed: the wizard explains that PMI stores credentials and runs the
// verification (no .env edits, no CLI). Server component; never renders a secret or an env var name.

import { Button, Card, Disclosure, StatusDot } from "@/components/ui";
import {
  connectorConnectLabel,
  connectorMethodBadge,
} from "@/lib/connections/connector-catalog";
import type { ConnectorView } from "@/lib/connections/connection-status";
import { getHealthCheckContract } from "@/lib/integrations/health-checks";

export function ConnectorCard({ item }: Readonly<{ item: ConnectorView }>) {
  const { def, status } = item;
  const contract = def.healthCheckRef
    ? getHealthCheckContract(def.healthCheckRef)
    : undefined;
  const connectLabel = connectorConnectLabel(def);

  return (
    <Card>
      <div className="ui-stack">
        <div className="ui-spread">
          <strong>{def.name}</strong>
          <StatusDot label={status.label} status={status.state} />
        </div>
        <p className="muted">{def.powers}</p>
        <div className="ui-row">
          <span className="ui-tag">{connectorMethodBadge(def.method)}</span>
          <span className="muted">{status.detail}</span>
        </div>

        <Disclosure summary={`Set up ${def.name}`}>
          <div className="ui-stack">
            <p>
              <strong>How you&rsquo;ll connect:</strong> {connectLabel}. PMI stores your
              credentials securely and verifies the connection for you — no files to edit,
              no tests to run.
            </p>
            {contract ? (
              <div>
                <p className="muted">What PMI verifies:</p>
                <ul className="compact-list">
                  {contract.steps.map((step) => (
                    <li key={step.id}>{step.description}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="ui-row">
              <Button aria-describedby={`connect-note-${def.id}`} disabled>
                {connectLabel}
              </Button>
              <span className="muted" id={`connect-note-${def.id}`}>
                Available in the next release.
              </span>
            </div>
          </div>
        </Disclosure>
      </div>
    </Card>
  );
}
