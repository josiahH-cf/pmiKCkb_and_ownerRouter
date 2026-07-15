import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { LEASE_EXECUTION_DEFINITIONS } from "@/lib/lease-renewal/execution/matrix";

export function LeaseExecutionReadiness() {
  const groups = [...new Set(LEASE_EXECUTION_DEFINITIONS.map((entry) => entry.group))];
  return (
    <article className="panel">
      <p className="eyebrow">Final-V1 external execution</p>
      <h2>Provider readiness</h2>
      <p>
        Local previews, one-attempt receipts, reconciliation, and correction contracts are
        under test. A provider stays Blocked until its documented account contract,
        mapping, connection, Registry review, and exact live authority are present.
      </p>
      <ul>
        {groups.map((group) => {
          const definitions = LEASE_EXECUTION_DEFINITIONS.filter(
            (entry) => entry.group === group,
          );
          const closed = definitions.filter(
            (entry) =>
              !ACTION_REGISTRY_SEED.find((candidate) => candidate.key === entry.key)
                ?.production_allowed,
          ).length;
          return (
            <li key={group}>
              <strong>{group}</strong> — {closed} of {definitions.length} actions remain
              closed
            </li>
          );
        })}
      </ul>
    </article>
  );
}
