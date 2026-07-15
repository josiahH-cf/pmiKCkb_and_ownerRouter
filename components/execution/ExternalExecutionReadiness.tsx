import { StatusPill } from "@/components/ui/StatusPill";
import {
  EXECUTION_ACTION_POLICIES,
  hasExecutionActionPolicy,
} from "@/lib/execution/risk-policy";
import type { ExternalActionDefinition } from "@/lib/external-execution/types";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";

const REGISTRY_BY_KEY = new Map(
  ACTION_REGISTRY_SEED.map((entry) => [entry.key, entry] as const),
);

const LOCAL_EVIDENCE_LIMIT =
  "Typed synthetic adapters and invented test aliases are local/emulator-only evidence. They do not satisfy a real provider contract, mapping, connection, permission, live authority, or production proof.";

const RECOMMENDED_PRODUCTION_DEFAULT =
  "Keep closed until the exact real contract, mapping, connection, permission, per-action live authority, and provider plus reconciliation proof are recorded.";

interface ExternalExecutionReadinessProps {
  definitions: readonly ExternalActionDefinition[];
  eyebrow: string;
  id: string;
  introduction: string;
  title: string;
}

export function ExternalExecutionReadiness({
  definitions,
  eyebrow,
  id,
  introduction,
  title,
}: Readonly<ExternalExecutionReadinessProps>) {
  const registryEligibleCount = definitions.filter(
    (definition) => REGISTRY_BY_KEY.get(definition.key)?.production_allowed === true,
  ).length;

  return (
    <article aria-labelledby={`${id}-title`} className="panel ui-stack">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{introduction}</p>
        <p>
          <strong>Local-test boundary:</strong> {LOCAL_EVIDENCE_LIMIT}
        </p>
        <p role="status">
          <strong>{registryEligibleCount}</strong> of{" "}
          <strong>{definitions.length}</strong> actions are Registry-eligible. Eligibility
          is not production acceptance; the exact workflow instance still has to pass
          every server-owned gate.
        </p>
      </div>

      <ol aria-label={`${title} actions`} className="ui-stack">
        {definitions.map((definition) => (
          <ActionReadiness key={definition.key} definition={definition} />
        ))}
      </ol>
    </article>
  );
}

function ActionReadiness({
  definition,
}: Readonly<{ definition: ExternalActionDefinition }>) {
  const registry = REGISTRY_BY_KEY.get(definition.key);
  const immutableRisk = hasExecutionActionPolicy(definition.key)
    ? EXECUTION_ACTION_POLICIES[definition.key].defaultRisk
    : definition.risk;
  const registryEligible = registry?.production_allowed === true;
  const gateLabel = registryEligible ? "Registry eligible" : "Production closed";
  const gateState = registry
    ? registryEligible
      ? "Registry-eligible — production_allowed=true. Exact workflow, source, role, confirmation/approval, and provider gates still apply."
      : "Closed — Action Registry production_allowed=false; no production execution is authorized."
    : "Closed — no Action Registry record exists; no production execution is authorized.";

  return (
    <li data-action-key={definition.key}>
      <details className="ui-disclosure">
        <summary>
          <strong>{definition.group}</strong>
          <br />
          <code style={{ overflowWrap: "anywhere" }}>{definition.key}</code>{" "}
          <StatusPill value={immutableRisk}>{immutableRisk} risk</StatusPill>{" "}
          <StatusPill value={registryEligible ? "Ready for Approval" : "Blocked"}>
            {gateLabel}
          </StatusPill>
        </summary>

        <div className="panel ui-stack">
          <dl className="queue-detail-grid">
            <div className="queue-detail-field">
              <dt>Exact action key</dt>
              <dd data-readiness-field="action-key">
                <code>{definition.key}</code>
              </dd>
            </div>
            <div className="queue-detail-field">
              <dt>Immutable risk</dt>
              <dd data-readiness-field="risk">{immutableRisk}</dd>
            </div>
            <div className="queue-detail-field">
              <dt>Registry readiness</dt>
              <dd data-readiness-field="registry-readiness">
                {registry?.readiness ?? "Not registered"}
              </dd>
            </div>
            <div className="queue-detail-field">
              <dt>Registry evidence status</dt>
              <dd data-readiness-field="registry-evidence-status">
                {registry?.evidence_status ?? "No evidence record"}
              </dd>
            </div>
            <div className="queue-detail-field">
              <dt>Production gate</dt>
              <dd data-readiness-field="production-gate">{gateState}</dd>
            </div>
            <div className="queue-detail-field">
              <dt>Target / health-check contract</dt>
              <dd>
                {registry?.target_system ?? "Unknown target"} ·{" "}
                <code>{registry?.connection_health_check_ref ?? "not-recorded"}</code>
              </dd>
            </div>
          </dl>

          <div>
            <h3 className="section-subtitle">Dependency keys</h3>
            {definition.dependsOn.length > 0 ? (
              <ul data-readiness-field="dependencies">
                {definition.dependsOn.map((dependency) => (
                  <li key={dependency}>
                    <code>{dependency}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p data-readiness-field="dependencies">
                None — no predecessor action receipt is required.
              </p>
            )}
          </div>

          <div>
            <h3 className="section-subtitle">Registry evidence</h3>
            <p data-readiness-field="registry-evidence">
              {registry?.documented_evidence ??
                "No Registry evidence is recorded. Add reviewed provider evidence before considering execution."}
            </p>
          </div>

          <div>
            <h3 className="section-subtitle">Required permission evidence</h3>
            {registry?.required_permissions?.length ? (
              <ul>
                {registry.required_permissions.map((permission) => (
                  <li key={permission}>{permission}</li>
                ))}
              </ul>
            ) : (
              <p>No permission evidence is recorded; keep the action closed.</p>
            )}
          </div>

          <div>
            <h3 className="section-subtitle">Correction path</h3>
            <p data-readiness-field="correction">{definition.correction}</p>
          </div>

          <div>
            <h3 className="section-subtitle">Recommended production default</h3>
            <p data-readiness-field="recommended-default">
              {RECOMMENDED_PRODUCTION_DEFAULT}
            </p>
            <p data-readiness-field="local-evidence-limit">{LOCAL_EVIDENCE_LIMIT}</p>
          </div>
        </div>
      </details>
    </li>
  );
}
