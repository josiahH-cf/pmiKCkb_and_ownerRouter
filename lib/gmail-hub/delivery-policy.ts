import type { CommunicationSequence } from "./sequence-model";
import type { WorkflowCommunicationContext } from "./workflow-context";

/** New exact staff confirmation is required; historical schedules never become a dispatch backlog. */
export const RENEWAL_DELIVERY_POLICY_VERSION = "renewal-confirmed-delivery/2026-10-20";
export function isRenewalDeliveryContext(context: WorkflowCommunicationContext) {
  return (
    context.lane === "renewals" &&
    context.entityType === "renewal_lease" &&
    ["renewal_owner", "renewal_tenant"].includes(context.purpose)
  );
}
export function hasCurrentRenewalAuthorization(sequence: CommunicationSequence) {
  return (
    isRenewalDeliveryContext(sequence.context) &&
    sequence.authorization?.deliveryPolicyVersion === RENEWAL_DELIVERY_POLICY_VERSION
  );
}
