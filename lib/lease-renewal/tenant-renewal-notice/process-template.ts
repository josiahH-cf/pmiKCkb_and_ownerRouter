import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { DOTLOOP_FOLLOWUP_ACTION_KEYS } from "@/lib/lease-renewal/dotloop-followup-draft";
import type { LeaseExecutionActionKey } from "@/lib/lease-renewal/execution/matrix";

/**
 * Non-executable Tenant Renewal Notice + Dotloop follow-up process-definition template (S13 Wave 2 /
 * space-teeth E3). Mirrors the maintenance/lease-renewal templates: seeds as a Draft. The steps WRAP
 * the already-built pure composers — `buildTenantOfferDraft` and the new `buildDotloopFollowUpDraft`
 * — as source-backed preview surfaces. Enabled channel actions execute only after exact human
 * confirmation, and consequential Dotloop actions require exact-preview Admin approval.
 *
 * GOVERNANCE: every action reference points at an existing S25 Registry key. A globally promoted
 * Gmail action is still Planned for this Draft workflow until the renewal-specific mapping and proof
 * exist. No autonomous, bulk, scheduled, or model-triggered send is exposed.
 */

export const TENANT_RENEWAL_NOTICE_ACTION_KEYS = [
  "gmail.renewal_notice.draft_create",
  "gmail.renewal_notice.send",
  "gmail.thread.reply",
  "gmail.label.apply",
  "rentvine.renewal.portal_message.send",
  "sms.renewal_message.send",
  ...DOTLOOP_FOLLOWUP_ACTION_KEYS,
] as const satisfies readonly LeaseExecutionActionKey[];

const TENANT_RENEWAL_NOTICE_STEPS: ReadonlyArray<{
  title: string;
  description: string;
}> = [
  {
    title: "Gather facts",
    description:
      "Read the renewal facts (lease end date, owner-approved offered rent, any RBP/insurance charges, the info-gathering form link). Missing facts render as visible Needs-Verification markers, never invented.",
  },
  {
    title: "Compose tenant offer draft",
    description:
      "Surface the output of `buildTenantOfferDraft` as separate email, Portal Chat, and SMS exact previews. A verified recipient and authoritative values are required for each channel.",
  },
  {
    title: "Compose Dotloop follow-up draft",
    description:
      "Surface `buildDotloopFollowUpDraft` and the exact configured loop, participant, and document previews. Dotloop stays Blocked until its account contract, mapping, connection, and Admin approval are present.",
  },
  {
    title: "Exact-confirmed execution",
    description:
      "Execute only individually enabled actions: each communication needs its own exact human confirmation and receipt; Dotloop needs exact-preview Admin approval. No autonomous, bulk, scheduled, or model-triggered send.",
  },
];

/** The Tenant Renewal Notice step titles, in order. */
export const TENANT_RENEWAL_NOTICE_STEP_TITLES: readonly string[] =
  TENANT_RENEWAL_NOTICE_STEPS.map((step) => step.title);

export interface TenantRenewalNoticeTemplateOptions {
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
}

export function buildTenantRenewalNoticeProcessTemplate(
  options: TenantRenewalNoticeTemplateOptions,
): CreateProcessDefinitionInput {
  return {
    name: "Tenant Renewal Notice + Dotloop Follow-Up",
    short_outcome:
      "Prepare source-backed email, Portal Chat, SMS, and Dotloop actions; execute only individually enabled, exact-confirmed or Admin-approved actions, never an autonomous send.",
    trigger:
      "Manual start by a team member when an owner-approved renewal offer is ready to send to the tenant.",
    owner_uid: options.ownerUid,
    default_approver_uid: options.approverUid,
    source_links: options.sourceLinks ?? [],
    required_starting_inputs: [
      "Lease / tenant reference (content-keyed)",
      "Owner-approved offered rent",
      "Lease end date",
    ],
    steps: TENANT_RENEWAL_NOTICE_STEPS.map((step) => ({
      title: step.title,
      description: step.description,
    })),
    action_references: TENANT_RENEWAL_NOTICE_ACTION_KEYS.map((key) =>
      actionReferenceFromSeed(key, options.approverUid),
    ),
    success_condition:
      "Every applicable enabled channel and document action has its own reconciled receipt after exact confirmation or Admin approval; one channel never claims success for another.",
    stop_condition:
      "A missing or conflicting recipient, offered rent, lease end date, participant, document, template, mapping, provider contract, connection, or authority blocks the affected action.",
    escalation_condition:
      "Signature stalls or disputes route to Dan/Josiah Admin triage.",
  };
}

function actionReferenceFromSeed(key: string, approverUid: string) {
  const entry = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === key);
  if (!entry) {
    throw new Error(`Action Registry seed entry ${key} is missing.`);
  }
  return {
    label: entry.label,
    target_system: entry.target_system,
    expected_action: entry.expected_action,
    readiness: entry.production_allowed ? "Planned" : entry.readiness,
    missing_connection_or_permission: entry.required_permissions?.join("; "),
    approval_owner_uid: approverUid,
    rollback_or_correction_note: entry.rollback_note,
    action_registry_key: entry.key,
  };
}
