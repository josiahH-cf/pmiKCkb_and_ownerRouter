import type { MaintenanceTicketRecord } from "./ticket-model";
import type { OperatingPolicyVersion } from "./operating-policy";
/** Stable reviewed-fact context. Ticket activity alone does not invalidate a responsibility decision. */
export function maintenanceResponsibilityContext(
  ticket: MaintenanceTicketRecord,
  policy: OperatingPolicyVersion | null,
) {
  return {
    assessment: ticket.assessment ?? null,
    association: ticket.maintenance_association ?? null,
    summary: ticket.summary,
    description: ticket.description,
    policy: policy ? { id: policy.id, version: policy.version } : null,
  };
}
