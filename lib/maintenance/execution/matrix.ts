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
  "rentvine.work_order.assign_vendor",
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
  "rentvine.work_order.assign_vendor",
  "gmail.maintenance_owner_notice.send",
  "gmail.thread.reply",
  "vendor.gmail.thread.read",
  "vendor.gmail.draft.create",
  "vendor.gmail.thread.reply",
  "vendor.gmail.label.apply",
  "leadsimple.process.update_stage",
  "leadsimple.task.create",
  "rentvine.work_order.update_status",
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
  def(MAINTENANCE_EXECUTION_ACTIONS[2], "App account lifecycle", "High", [
    MAINTENANCE_EXECUTION_ACTIONS[0],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[3], "Mailbox lifecycle", "High", [
    MAINTENANCE_EXECUTION_ACTIONS[0],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[4], "Mailbox lifecycle", "High", []),
  def(MAINTENANCE_EXECUTION_ACTIONS[5], "Mailbox lifecycle", "Low", [
    MAINTENANCE_EXECUTION_ACTIONS[3],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[6], "Drive photos", "Medium", [
    MAINTENANCE_EXECUTION_ACTIONS[2],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[7], "Rentvine create", "High", []),
  def(MAINTENANCE_EXECUTION_ACTIONS[8], "Rentvine lifecycle", "High", [
    MAINTENANCE_EXECUTION_ACTIONS[7],
    MAINTENANCE_EXECUTION_ACTIONS[2],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[9], "Rentvine lifecycle", "High", [
    MAINTENANCE_EXECUTION_ACTIONS[8],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[10], "Owner email", "Medium", [
    MAINTENANCE_EXECUTION_ACTIONS[7],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[11], "Owner email", "Medium", [
    MAINTENANCE_EXECUTION_ACTIONS[10],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[12], "Vendor email", "Low", [
    MAINTENANCE_EXECUTION_ACTIONS[3],
    MAINTENANCE_EXECUTION_ACTIONS[2],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[13], "Vendor email", "Low", [
    MAINTENANCE_EXECUTION_ACTIONS[12],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[14], "Vendor email", "Medium", [
    MAINTENANCE_EXECUTION_ACTIONS[13],
  ]),
  def(MAINTENANCE_EXECUTION_ACTIONS[15], "Vendor email", "Low", [
    MAINTENANCE_EXECUTION_ACTIONS[14],
  ]),
  def(
    MAINTENANCE_EXECUTION_ACTIONS[16],
    "LeadSimple",
    "High",
    [MAINTENANCE_EXECUTION_ACTIONS[7]],
    "vendor_required",
  ),
  def(
    MAINTENANCE_EXECUTION_ACTIONS[17],
    "LeadSimple",
    "High",
    [MAINTENANCE_EXECUTION_ACTIONS[16]],
    "vendor_required",
  ),
  def(MAINTENANCE_EXECUTION_ACTIONS[18], "QuickBooks", "High", [
    MAINTENANCE_EXECUTION_ACTIONS[9],
  ]),
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
): ExternalActionDefinition {
  return {
    key,
    group,
    risk,
    dependsOn,
    requiredContract,
    correction:
      "Reconcile the provider reference and current state, then perform a separately reviewed correction without deleting audit.",
  };
}
