import {
  isRetiredMaintenanceOperation,
  MAINTENANCE_RETIREMENT_MESSAGE,
} from "@/lib/maintenance/retirement";

export const WORKFLOW_SEND_POLICY_MESSAGE =
  "Generic client sending is unavailable. Renewal delivery requires exact staff review and confirmation. Existing delivery records keep their original meaning.";

/** Latest explicit application instruction; a previously open Registry key cannot override it. */
export function applicationEffectBlockReason(actionKey: string): string | null {
  if (isRetiredMaintenanceOperation(actionKey)) return MAINTENANCE_RETIREMENT_MESSAGE;
  if (["gmail.message.send"].includes(actionKey)) return WORKFLOW_SEND_POLICY_MESSAGE;
  return null;
}
