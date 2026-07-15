import type { ExternalActionDefinition } from "@/lib/external-execution/types";

export const LEASE_EXECUTION_ACTIONS = [
  "gmail.renewal_notice.draft_create",
  "gmail.renewal_notice.send",
  "gmail.thread.reply",
  "gmail.label.apply",
  "google_sheets.renewal_checklist.writeback",
  "rentvine.lease.renewal_writeback",
  "dotloop.loop.create_from_template",
  "dotloop.document.upload",
  "rentvine.renewal.portal_message.send",
  "sms.renewal_message.send",
  "boom.resident.enroll",
] as const;

export type LeaseExecutionActionKey = (typeof LEASE_EXECUTION_ACTIONS)[number];

export const LEASE_EXECUTION_DEFINITIONS: readonly ExternalActionDefinition[] = [
  definition(
    LEASE_EXECUTION_ACTIONS[0],
    "Gmail renewal",
    "Low",
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
  definition(
    LEASE_EXECUTION_ACTIONS[3],
    "Gmail renewal",
    "Low",
    [LEASE_EXECUTION_ACTIONS[1]],
    "Restore the prior governed label set.",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[4],
    "Sheet writeback",
    "High",
    [LEASE_EXECUTION_ACTIONS[1]],
    "Compare-and-set the prior verified value in a new proposal.",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[5],
    "Rentvine renewal",
    "High",
    [LEASE_EXECUTION_ACTIONS[4]],
    "Use the documented provider correction contract; endpoint remains unavailable until confirmed.",
    "undocumented",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[6],
    "Dotloop",
    "High",
    [LEASE_EXECUTION_ACTIONS[5]],
    "Archive/correct the loop under the documented Dotloop account contract.",
    "vendor_required",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[7],
    "Dotloop",
    "High",
    [LEASE_EXECUTION_ACTIONS[6]],
    "Remove or supersede the wrong document without rewriting audit.",
    "vendor_required",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[8],
    "Portal chat",
    "Medium",
    [LEASE_EXECUTION_ACTIONS[1]],
    "Post a reviewed correction through the same documented portal thread.",
    "vendor_required",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[9],
    "SMS",
    "Medium",
    [LEASE_EXECUTION_ACTIONS[1]],
    "Send a reviewed correction through the same provider conversation.",
    "vendor_required",
  ),
  definition(
    LEASE_EXECUTION_ACTIONS[10],
    "Boom",
    "High",
    [LEASE_EXECUTION_ACTIONS[5]],
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
