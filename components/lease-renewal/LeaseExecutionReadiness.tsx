import { ExternalExecutionReadiness } from "@/components/execution/ExternalExecutionReadiness";
import { LEASE_EXECUTION_DEFINITIONS } from "@/lib/lease-renewal/execution/matrix";

export function LeaseExecutionReadiness() {
  return (
    <ExternalExecutionReadiness
      definitions={LEASE_EXECUTION_DEFINITIONS}
      eyebrow="Final-V1 external execution"
      id="lease-execution-readiness"
      introduction="Review each Lease Renewal action's immutable risk, exact Registry posture, dependencies, evidence, and safe correction path before considering any provider execution."
      title="Lease provider readiness"
    />
  );
}
