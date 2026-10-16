import {
  isRetiredMaintenanceOperation,
  MAINTENANCE_RETIREMENT_MESSAGE,
} from "@/lib/maintenance/retirement";

export const WORKFLOW_SEND_POLICY_MESSAGE =
  "Client sending and scheduling are unavailable. Review an unsent Gmail draft and send it from Gmail. Existing delivery records keep their original meaning.";

/** Latest explicit application instruction; a previously open Registry key cannot override it. */
export function applicationEffectBlockReason(actionKey: string): string | null {
  if (isRetiredMaintenanceOperation(actionKey)) return MAINTENANCE_RETIREMENT_MESSAGE;
  if (
    [
      "gmail.renewal_notice.send",
      "gmail.maintenance_owner_notice.send",
      "gmail.message.send",
      "gmail.thread.reply",
    ].includes(actionKey)
  )
    return WORKFLOW_SEND_POLICY_MESSAGE;
  return null;
}
