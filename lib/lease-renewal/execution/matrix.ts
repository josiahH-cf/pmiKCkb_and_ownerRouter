import type { ExternalActionDefinition } from "@/lib/external-execution/types";

export const LEASE_EXECUTION_ACTIONS = [
  "gmail.renewal_notice.draft_create",
  "gmail.renewal_notice.send",
  "gmail.thread.reply",
  "gmail.label.apply",
  "rentvine.renewal.portal_message.send",
  "sms.renewal_message.send",
  // S98: the retired broad Sheet identifier is replaced by the two exact keys (append, then
  // supported-field update).
  "google_sheets.renewal_checklist.row_append",
  "google_sheets.renewal_checklist.field_update",
  "dotloop.loop.create_from_template",
  "dotloop.document.upload",
  // S97: the retired broad writeback identifier is replaced by the three exact keys in their
  // canonical effect order (dates, existing-charge updates, new charges).
  "rentvine.lease.renewal_dates.update",
  "rentvine.lease.recurring_charge.update",
  "rentvine.lease.recurring_charge.create",
  "boom.resident.enroll",
] as const;

export type LeaseExecutionActionKey = (typeof LEASE_EXECUTION_ACTIONS)[number];

export const LEASE_EXECUTION_DEFINITIONS: readonly ExternalActionDefinition[] = [
  definition(
    LEASE_EXECUTION_ACTIONS[0],
    "Gmail renewal",
    "Medium",
    [],
    "Delete the unsent draft.",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[1],
    "Gmail renewal",
    "Medium",
    [LEASE_EXECUTION_ACTIONS[0]],
    "Send a source-backed correction on the linked thread; never retract silently.",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[2],
    "Gmail renewal",
    "Medium",
    [LEASE_EXECUTION_ACTIONS[1]],
    "Reconcile the RFC Message-ID and send a corrected linked reply only after review.",
  ),
  // No dependency. The governed label organizes a thread already linked to the workflow; it is not
  // downstream of any message effect. It previously depended on `gmail.renewal_notice.send`, which
  // D33 retired as a permanent non-target — that dependency could never acquire a receipt, so the
  // action was unsatisfiable by construction. The linked-thread requirement is enforced by the
  // workflow context, not by another action's receipt.
  definition(
    LEASE_EXECUTION_ACTIONS[3],
    "Gmail renewal",
    "Low",
    [],
    "Restore the prior governed label set.",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[4],
    "Portal chat",
    "Medium",
    [],
    "Post a reviewed correction through the same documented portal thread.",
    "vendor_required",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[5],
    "SMS",
    "Medium",
    [],
    "Send a reviewed correction through the same provider conversation.",
    "vendor_required",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[6],
    "Sheet writeback",
    "High",
    [LEASE_EXECUTION_ACTIONS[1]],
    "Only the exact unchanged receipt-bound appended row may be deleted under a separately confirmed reversal with absence readback.",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[7],
    "Sheet writeback",
    "High",
    [LEASE_EXECUTION_ACTIONS[1]],
    "A separately previewed and confirmed correction compare-and-sets the exact receipted prior value back into the same cell.",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[8],
    "Dotloop",
    "High",
    [LEASE_EXECUTION_ACTIONS[6]],
    "Archive/correct the loop under the documented Dotloop account contract.",
    "vendor_required",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[9],
    "Dotloop",
    "High",
    [LEASE_EXECUTION_ACTIONS[8]],
    "Remove or supersede the wrong document without rewriting audit.",
    "vendor_required",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[10],
    "Rentvine renewal",
    "High",
    [LEASE_EXECUTION_ACTIONS[9]],
    "A separately previewed and confirmed reversal restores the exact receipted prior dates.",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[11],
    "Rentvine renewal",
    "High",
    [LEASE_EXECUTION_ACTIONS[10]],
    "A separately previewed and confirmed reversal restores the exact receipted prior changed fields.",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[12],
    "Rentvine renewal",
    "High",
    [LEASE_EXECUTION_ACTIONS[11]],
    "Only the exact unchanged receipt-bound created charge may be deleted after fresh canonical equality and a new confirmation.",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[13],
    "Boom",
    "High",
    [LEASE_EXECUTION_ACTIONS[12]],
    "Use the documented Boom de-enrollment/correction path.",
    "vendor_required",
  ),
];

export const LEASE_EXECUTION_DEFINITION_MAP = new Map(
  LEASE_EXECUTION_DEFINITIONS.map((entry) => [entry.key, entry]),
);

function definition(
  key: LeaseExecutionActionKey,
  group: string,
  risk: ExternalActionDefinition["risk"],
  dependsOn: readonly string[],
  correction: string,
  requiredContract: ExternalActionDefinition["requiredContract"] = "documented",
): ExternalActionDefinition {
  return { key, group, risk, dependsOn, correction, requiredContract };
}
