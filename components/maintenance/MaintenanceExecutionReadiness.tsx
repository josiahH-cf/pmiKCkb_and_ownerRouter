import { ExternalExecutionReadiness } from "@/components/execution/ExternalExecutionReadiness";
import { MAINTENANCE_EXECUTION_DEFINITIONS } from "@/lib/maintenance/execution/matrix";

export function MaintenanceExecutionReadiness() {
  return (
    <ExternalExecutionReadiness
      definitions={MAINTENANCE_EXECUTION_DEFINITIONS}
      eyebrow="Final-V1 external execution"
      id="maintenance-execution-readiness"
      introduction="Live actions use the configured provider gate with an exact action, target preview, human confirmation, receipt, and correction path. The production Test workspace is fully usable with invented aliases. Its receipts prove the Test flow; Live provider proof comes only from a gated Live action."
      title="Maintenance provider readiness"
    />
  );
}
