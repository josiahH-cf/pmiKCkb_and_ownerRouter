import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";

/**
 * Non-executable Owner Renewal Outreach process-definition template (S13 Wave 2 / space-teeth E4).
 * Mirrors the maintenance/lease-renewal templates: seeds as a Draft. The steps WRAP the already-built
 * pure `buildOwnerRenewalDraft` composer verbatim as a read/draft surface the desk renders — the steps
 * do NOT execute anything; Dan approves and a human sends.
 *
 * GOVERNANCE: `action_references: []` — owner outreach is a Gmail DRAFT only; no external write action
 * is proposed. Missing market inputs render as visible Needs-Verification markers, never invented.
 */

const OWNER_RENEWAL_OUTREACH_STEPS: ReadonlyArray<{
  title: string;
  description: string;
}> = [
  {
    title: "Gather facts",
    description:
      "Read the outreach facts: address + current rent (RentVine, read-authoritative), a market comp range (Zillow), and the specific market number (PMI rental-analysis tool). Missing market inputs render as visible Needs-Verification markers, never invented.",
  },
  {
    title: "Compose owner outreach draft",
    description:
      "Surfaces the output of the existing `buildOwnerRenewalDraft` composer verbatim (address, current rent, comp range, suggested number, comps-screenshot placeholder), every fact source-tagged. Draft only.",
  },
  {
    title: "Dan approves",
    description:
      "Dan reviews the drafted outreach and the facts it rests on, and records the renewal decision (offer / hold / amount). No app action executes.",
  },
  {
    title: "Human sends",
    description:
      "A human sends the approved owner email. The app never sends and never writes to a system of record.",
  },
];

/** The Owner Renewal Outreach step titles, in order. */
export const OWNER_RENEWAL_OUTREACH_STEP_TITLES: readonly string[] =
  OWNER_RENEWAL_OUTREACH_STEPS.map((step) => step.title);

export interface OwnerRenewalOutreachTemplateOptions {
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
}

export function buildOwnerRenewalOutreachProcessTemplate(
  options: OwnerRenewalOutreachTemplateOptions,
): CreateProcessDefinitionInput {
  return {
    name: "Owner Renewal Outreach + Comp Lookup",
    short_outcome:
      "Draft the owner renewal outreach email from source-tagged facts (current rent + market comps); Dan approves and a human sends. Missing market inputs stay visible; no autonomous send, no system-of-record write.",
    trigger:
      "Manual start by a team member when a lease is entering its renewal window and the owner needs an outreach decision.",
    owner_uid: options.ownerUid,
    default_approver_uid: options.approverUid,
    source_links: options.sourceLinks ?? [],
    required_starting_inputs: [
      "Property address (content-keyed)",
      "Current rent (RentVine, read-authoritative)",
      "Market comps (Zillow range + PMI rental-analysis number, operator-entered)",
    ],
    steps: OWNER_RENEWAL_OUTREACH_STEPS.map((step) => ({
      title: step.title,
      description: step.description,
    })),
    action_references: [],
    success_condition:
      "Dan approves the outreach draft and the facts it rests on; a human sends the email. No external write or send executes from the app.",
    stop_condition:
      "A missing market input (comp range, specific number) surfaces as a Needs-Verification marker that blocks the owner send until a human supplies it.",
    escalation_condition:
      "Owner non-response or a pricing dispute routes to Dan/Josiah Admin triage.",
  };
}
