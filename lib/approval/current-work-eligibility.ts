import type { ApprovalQueueItemRecord } from "@/lib/firestore/types";
import {
  isRetiredMaintenanceOperation,
  isRetiredMaintenanceWorkflow,
  maintenanceRequestDisposition,
} from "@/lib/maintenance/retirement";

/**
 * Read-only eligibility, shared by every current-decision projection. Historical status/labels
 * are not execution authority. Use machine provenance and existing server-owned lifecycle fields;
 * ordinary knowledge tasks mentioning maintenance or proofs remain ordinary tasks.
 */
export type CurrentDecisionProvenance = Partial<
  Pick<
    ApprovalQueueItemRecord,
    | "space_id"
    | "process_run_ref"
    | "affected_system_action"
    | "direct_link"
    | "closed_at"
    | "superseded_by_item_id"
  >
>;

export function isCurrentDecisionItem(item: CurrentDecisionProvenance): boolean {
  if (
    isRetiredMaintenanceWorkflow(item.space_id, item.process_run_ref?.id) ||
    item.process_run_ref?.id?.startsWith("maintenance:") ||
    item.process_run_ref?.id?.startsWith("rentvine-work-order:") ||
    (item.affected_system_action &&
      isRetiredMaintenanceOperation(item.affected_system_action))
  )
    return false;

  if (item.direct_link?.startsWith("/") && !item.direct_link.startsWith("//")) {
    const path = item.direct_link.split(/[?#]/, 1)[0];
    if (maintenanceRequestDisposition("GET", path) !== "allow") return false;
  }

  // These are written by the existing lifecycle owner. A stale nonterminal status must not
  // reopen an exact closed/superseded record. No status, receipt or historical record is rewritten.
  if (item.closed_at && Number.isFinite(Date.parse(item.closed_at))) return false;
  if (item.superseded_by_item_id?.trim()) return false;
  return true;
}
