import type { AuthenticatedUser } from "@/lib/auth/session";
import { getMaintenancePropertyPreapproval } from "@/lib/firestore/maintenance-property-preapprovals";
import type { MaintenanceTicketRecord } from "./ticket-model";
import type { MaintenancePropertyPreapproval } from "./property-preapproval";
import { readCurrentMaintenancePolicyOwnerRefs } from "./policy-source";
export interface MaintenanceWorkAuthorizationContext {
  preapproval: MaintenancePropertyPreapproval | null;
  verifiedOwnerRefs: readonly string[];
}
export async function readMaintenanceWorkAuthorization(
  actor: AuthenticatedUser,
  ticket: MaintenanceTicketRecord,
): Promise<MaintenanceWorkAuthorizationContext> {
  const preapproval = ticket.property_id
    ? await getMaintenancePropertyPreapproval(actor, ticket.property_id)
    : null;
  const verifiedOwnerRefs =
    preapproval?.policy_terms?.scope === "owner" && ticket.property_id
      ? await readCurrentMaintenancePolicyOwnerRefs(ticket.property_id)
      : [];
  return { preapproval, verifiedOwnerRefs };
}
