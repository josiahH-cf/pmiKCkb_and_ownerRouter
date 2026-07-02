import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { DOTLOOP_FOLLOWUP_ACTION_KEYS } from "@/lib/lease-renewal/dotloop-followup-draft";

/**
 * Non-executable Tenant Renewal Notice + Dotloop follow-up process-definition template (S13 Wave 2 /
 * space-teeth E3). Mirrors the maintenance/lease-renewal templates: seeds as a Draft. The steps WRAP
 * the already-built pure composers — `buildTenantOfferDraft` and the new `buildDotloopFollowUpDraft`
 * — as read/draft surfaces the desk renders. The steps do NOT execute anything; a human reviews the
 * drafts and clicks Send.
 *
 * GOVERNANCE: the two Dotloop `action_references` point at the EXISTING registry keys
 * (dotloop.loop.create_from_template, dotloop.document.upload) sourced from ACTION_REGISTRY_SEED —
 * both stay `readiness: "Needs Permission"` (non-executable). No new registry metadata is authored.
 */

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
      "Surfaces the output of the existing `buildTenantOfferDraft` composer (email + Portal Chat + text) on the desk for operator review. Draft only — a human sends.",
  },
  {
    title: "Compose Dotloop follow-up draft",
    description:
      "Surfaces the output of `buildDotloopFollowUpDraft` (the signature-chase nudge). It references the Dotloop loop/upload actions, which stay Needs Permission — non-executable. Draft only.",
  },
  {
    title: "Human approval / send",
    description:
      "A human reviews the offer + follow-up drafts and clicks Send in each channel. The app never sends and never writes to Dotloop or RentVine.",
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
      "Draft the tenant renewal offer (email + Portal Chat) and the Dotloop signature follow-up from source-tagged facts; a human reviews and sends. No app write to Dotloop/RentVine, no autonomous send.",
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
    action_references: DOTLOOP_FOLLOWUP_ACTION_KEYS.map((key) =>
      actionReferenceFromSeed(key, options.approverUid),
    ),
    success_condition:
      "The operator reviews the offer + Dotloop follow-up drafts and sends them by hand; no external write or send executes from the app.",
    stop_condition:
      "A missing fact (offered rent, lease end date, participant/template) surfaces as a Needs-Verification marker that a human resolves before sending.",
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
    readiness: entry.readiness,
    missing_connection_or_permission: entry.required_permissions?.join("; "),
    approval_owner_uid: approverUid,
    rollback_or_correction_note: entry.rollback_note,
    action_registry_key: entry.key,
  };
}
