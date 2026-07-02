// One connector card for the Connection Center — name, what it powers, live status, and (for
// Admins) a guided "Set up" wizard plus a live "Verify connection" check where one is built (S13
// D5). Non-Admins see the same read-only status with no setup or verify affordance (decision 6).
// Server component; never renders a secret or an env var name.

import { Card, Disclosure, StatusDot } from "@/components/ui";
import { VerifyConnectionButton } from "@/components/connections/VerifyConnectionButton";
import {
  connectorConnectLabel,
  connectorMethodBadge,
} from "@/lib/connections/connector-catalog";
import type { ConnectorView } from "@/lib/connections/connection-status";
import { getHealthCheckContract } from "@/lib/integrations/health-checks";

export function ConnectorCard({
  item,
  canManage,
  verifiable,
}: Readonly<{ item: ConnectorView; canManage: boolean; verifiable: boolean }>) {
  const { def, status } = item;
  const contract = def.healthCheckRef
    ? getHealthCheckContract(def.healthCheckRef)
    : undefined;
  const connectLabel = connectorConnectLabel(def);

  return (
    // The wrapper carries a stable per-connector anchor so app-state deep links land on this exact
    // card (S13 C2): /connections#connector-{id}.
    <div id={`connector-${def.id}`}>
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

          {canManage && verifiable ? (
            <VerifyConnectionButton connectorId={def.id} connectorName={def.name} />
          ) : null}

          {canManage ? (
            <Disclosure summary={`Set up ${def.name}`}>
              <div className="ui-stack">
                <p>
                  <strong>How you&rsquo;ll connect:</strong> {connectLabel}. The app
                  stores your credentials securely and checks the connection. No files to
                  edit, no tests to run.
                </p>
                {contract ? (
                  <div>
                    <p className="muted">What the app checks:</p>
                    <ul className="compact-list">
                      {contract.steps.map((step) => (
                        <li key={step.id}>{step.description}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </Disclosure>
          ) : (
            <p className="muted">An Admin connects and verifies this.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
