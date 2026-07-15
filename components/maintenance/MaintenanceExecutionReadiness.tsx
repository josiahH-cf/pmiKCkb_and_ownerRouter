import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { MAINTENANCE_EXECUTION_DEFINITIONS } from "@/lib/maintenance/execution/matrix";

export function MaintenanceExecutionReadiness() {
  const groups = [
    ...new Set(MAINTENANCE_EXECUTION_DEFINITIONS.map((entry) => entry.group)),
  ];
  return (
    <article className="panel">
      <p className="eyebrow">Final-V1 external execution</p>
      <h2>Maintenance provider readiness</h2>
      <p>
        Local fake-provider previews, one-attempt receipts, reconciliation, and correction
        paths are under test. No account, mailbox, photo, work order, message, process, or
        Bill executes until its exact contract, mapping, connection, Registry review, and
        live authority are present.
      </p>
      <ul>
        {groups.map((group) => {
          const definitions = MAINTENANCE_EXECUTION_DEFINITIONS.filter(
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
