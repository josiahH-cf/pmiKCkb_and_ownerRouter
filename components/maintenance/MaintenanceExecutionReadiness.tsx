import { ExternalExecutionReadiness } from "@/components/execution/ExternalExecutionReadiness";
import { MAINTENANCE_EXECUTION_DEFINITIONS } from "@/lib/maintenance/execution/matrix";

export function MaintenanceExecutionReadiness() {
  return (
    <ExternalExecutionReadiness
      definitions={MAINTENANCE_EXECUTION_DEFINITIONS}
      eyebrow="Final-V1 external execution"
      id="maintenance-execution-readiness"
      introduction="Review each Maintenance action's immutable risk, exact Registry posture, dependencies, evidence, and safe correction path before considering any account, mailbox, photo, work-order, communication, process, or accounting execution."
      title="Maintenance provider readiness"
    />
  );
}
