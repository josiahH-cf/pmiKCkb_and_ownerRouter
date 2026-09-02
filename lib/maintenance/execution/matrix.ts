import type { ExternalActionDefinition } from "@/lib/external-execution/types";

export const MAINTENANCE_EXECUTION_ACTIONS = [
  "vendor.account.invite",
  "vendor.account.disable",
  "vendor.assignment.change",
  "vendor.gmail.connect",
  "vendor.gmail.revoke",
  "vendor.gmail.health",
  "google_drive.maintenance_photo.store",
  "rentvine.work_order.create",
  "rentvine.work_order.update_status",
  "gmail.maintenance_owner_notice.send",
  "gmail.thread.reply",
  "vendor.gmail.thread.read",
  "vendor.gmail.draft.create",
  "vendor.gmail.thread.reply",
  "vendor.gmail.label.apply",
  "leadsimple.process.update_stage",
  "leadsimple.task.create",
  "quickbooks.bill.create_draft",
  // Appended, never inserted: the definitions below bind by array index, so inserting a key
  // mid-array would silently rebind every later definition to the wrong action. S99 (reviewed)
  // removed `rentvine.work_order.assign_vendor` here and re-cut every later index: the app never
  // assigns a Vendor through the work-order feature, so no matrix row may make it reachable.
  "gmail.maintenance_owner_notice.draft_create",
  "rentvine.work_order.chat.sync",
  "gmail.maintenance_resident_reply.draft_create",
] as const;

export type MaintenanceExecutionActionKey =
  (typeof MAINTENANCE_EXECUTION_ACTIONS)[number];

export const MAINTENANCE_EXECUTION_ORDER: readonly MaintenanceExecutionActionKey[] = [
  "vendor.account.invite",
  "vendor.assignment.change",
  "vendor.gmail.connect",
  "vendor.gmail.health",
  "google_drive.maintenance_photo.store",
  "rentvine.work_order.create",
  "gmail.maintenance_owner_notice.draft_create",
  "gmail.maintenance_owner_notice.send",
  "gmail.thread.reply",
  "vendor.gmail.thread.read",
  "vendor.gmail.draft.create",
  "vendor.gmail.thread.reply",
  "vendor.gmail.label.apply",
  "leadsimple.process.update_stage",
  "leadsimple.task.create",
  "rentvine.work_order.update_status",
  "rentvine.work_order.chat.sync",
  "gmail.maintenance_resident_reply.draft_create",
  "quickbooks.bill.create_draft",
  "vendor.gmail.revoke",
  "vendor.account.disable",
];

export const MAINTENANCE_EXECUTION_DEFINITIONS: readonly ExternalActionDefinition[] = [
  def(MAINTENANCE_EXECUTION_ACTIONS[0], "App account lifecycle", "High", []),
  def(
    MAINTENANCE_EXECUTION_ACTIONS[1],
    "App account lifecycle",
    "High",
    [],
    "documented",
  ),
  // Assignment binds to the current server-loaded Vendor and ticket generations. Requiring an
  // invite execution in the same ticket scope would strand every later ticket assigned to an
  // already-active Vendor and would invite the browser to supply a dependency identifier.
  def(MAINTENANCE_EXECUTION_ACTIONS[2], "App account lifecycle", "High", []),
  def(MAINTENANCE_EXECUTION_ACTIONS[3], "Mailbox lifecycle", "High", [
    MAINTENANCE_EXECUTION_ACTIONS[0],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[4], "Mailbox lifecycle", "High", []),
  def(MAINTENANCE_EXECUTION_ACTIONS[5], "Mailbox lifecycle", "Low", [
    MAINTENANCE_EXECUTION_ACTIONS[3],
  ]),
  // Internal Editors can append a scanned ticket photo without assigning an external Vendor.
  // Vendor actors still need the S22 assigned-ticket authority check at execution time.
  def(MAINTENANCE_EXECUTION_ACTIONS[6], "Drive photos", "Medium", []),
  def(MAINTENANCE_EXECUTION_ACTIONS[7], "Rentvine create", "High", []),
  // S99: a status update targets one work order selected from a fresh exact read. It has no
  // create dependency (most updated work orders were never app-created) and the retired
  // assign-vendor step no longer exists to depend on.
  def(MAINTENANCE_EXECUTION_ACTIONS[8], "Rentvine lifecycle", "High", []),
  def(MAINTENANCE_EXECUTION_ACTIONS[9], "Owner email", "Medium", [
    MAINTENANCE_EXECUTION_ACTIONS[7],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[10], "Owner email", "Medium", [
    MAINTENANCE_EXECUTION_ACTIONS[9],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[11], "Vendor email", "Low", [
    MAINTENANCE_EXECUTION_ACTIONS[3],
    MAINTENANCE_EXECUTION_ACTIONS[2],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[12], "Vendor email", "Medium", [
    MAINTENANCE_EXECUTION_ACTIONS[11],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[13], "Vendor email", "Medium", [
    MAINTENANCE_EXECUTION_ACTIONS[12],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[14], "Vendor email", "Low", [
    MAINTENANCE_EXECUTION_ACTIONS[13],
  ]),
  def(
    MAINTENANCE_EXECUTION_ACTIONS[15],
    "LeadSimple",
    "High",
    [MAINTENANCE_EXECUTION_ACTIONS[7]],
    "vendor_required",
  ),
  def(
    MAINTENANCE_EXECUTION_ACTIONS[16],
    "LeadSimple",
    "High",
    [MAINTENANCE_EXECUTION_ACTIONS[15]],
    "vendor_required",
  ),
  def(MAINTENANCE_EXECUTION_ACTIONS[17], "QuickBooks", "High", [
    MAINTENANCE_EXECUTION_ACTIONS[8],
  ]),
  // No dependency. The owner-notice draft is composed from a persisted app ticket plus an
  // authoritatively resolved owner recipient, both enforced by the route. Depending on
  // `rentvine.work_order.create` (as the paired `.send` does) would make the draft unsatisfiable:
  // that action is "Needs Connection", so it can never produce the receipt this would require.
  // Risk is Medium to match the server policy for `workflow_draft`; the S20 bridge refuses a
  // definition whose risk disagrees with `EXECUTION_ACTION_POLICIES`.
  def(
    MAINTENANCE_EXECUTION_ACTIONS[18],
    "Owner email",
    "Medium",
    [],
    "documented",
    "Delete the unsent draft.",
  ),
  // S100: one manually confirmed consequential chat page read. The provider read-marker has no
  // rollback, so the correction is honest disclosure, never a compensating provider call.
  def(
    MAINTENANCE_EXECUTION_ACTIONS[19],
    "Rentvine chat",
    "Medium",
    [],
    "documented",
    "None. The provider may have marked messages read for managers; disclose the uncertainty and rely on deduplicated re-sync.",
  ),
  // S100: the resident reply ends in one unsent Gmail draft a person corrects in Gmail.
  def(
    MAINTENANCE_EXECUTION_ACTIONS[20],
    "Resident email",
    "Medium",
    [],
    "documented",
    "Edit or delete the unchanged unsent draft in Gmail; the app only reconciles the observed result.",
  ),
];

export const MAINTENANCE_EXECUTION_DEFINITION_MAP = new Map(
  MAINTENANCE_EXECUTION_DEFINITIONS.map((entry) => [entry.key, entry]),
);

function def(
  key: MaintenanceExecutionActionKey,
  group: string,
  risk: ExternalActionDefinition["risk"],
  dependsOn: readonly string[],
  requiredContract: ExternalActionDefinition["requiredContract"] = "documented",
  /** Override for an action whose correction is not a provider-state reconciliation. */
  correction = "Reconcile the provider reference and current state, then perform a separately reviewed correction without deleting audit.",
): ExternalActionDefinition {
  return {
    key,
    group,
    risk,
    dependsOn,
    requiredContract,
    correction,
  };
}
