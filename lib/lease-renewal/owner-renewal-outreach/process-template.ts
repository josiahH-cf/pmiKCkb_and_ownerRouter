import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";

/**
 * S241: current procedural guidance, still seeded as Draft with no executable action references.
 * Publishing or checking a step never dispatches a message, starts work or approves lease terms.
 */

const OWNER_RENEWAL_OUTREACH_STEPS: ReadonlyArray<{
  title: string;
  description: string;
}> = [
  {
    title: "Gather facts",
    description:
      "Open the linked lease and review source-tagged current rent, dates, parties, contacts and Working terms. Keep source differences and unknowns visible; a checklist tick does not verify a source or change RentVine or the operating Sheet.",
  },
  {
    title: "Review market evidence and recommendation",
    description:
      "Use available Comps and the recorded recommendation with its actual basis. Distinguish a provider result, staff input and unavailable research; never invent comparables or call a current-rent range market evidence. Missing evidence limits only the output that actually requires it.",
  },
  {
    title: "Prepare and review owner outreach",
    description:
      "Review the Owner message, exact wording, recipient, sender and any resource or attachment. Copy the message or prepare an unsent Gmail draft when appropriate. Recover settled PMI decisions first; ask Dan only the precise unresolved business question. This is not a general Dan approval gate or landlord consent.",
  },
  {
    title: "Confirm delivery or manual handoff",
    description:
      "Use the linked Communications Send or Schedule control for current staff-confirmed renewal delivery, or choose the unsent Gmail/manual handoff. Resume requires a fresh review of the current message, sender, recipient, sources and timing. The operation's current confirmation, one-attempt claim, receipt and ambiguity checks still apply; old approvals cannot dispatch.",
  },
  {
    title: "Observe replies and record the owner outcome",
    description:
      "Check per-message evidence and linked replies. Prepared, Gmail draft, accepted send, recipient receipt and reply are distinct; absence of a reply is not consent. Record the actual owner or authorized representative's exact terms/outcome and evidence; a changed rent, date or charge makes that coverage stale.",
  },
  {
    title: "Continue the linked renewal",
    description:
      "Carry the actual owner outcome into the existing lease journey. Applicable approved legal forms, fees and signer delegation remain separate requirements. Both Dotloop write keys stay closed until separately authorized and activated; signing is a human handoff. Source updates retain their own exact preview, confirmation, receipt and correction controls. No step here starts or proves those effects.",
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
      "Prepare source-backed owner outreach, use current staff-confirmed renewal delivery or an unsent handoff, and record the evidenced owner outcome. This process starts no automatic send, approval or source update.",
    trigger:
      "Manual start by a team member when a lease is entering its renewal window and the owner needs an outreach decision.",
    owner_uid: options.ownerUid,
    default_approver_uid: options.approverUid,
    source_links: options.sourceLinks ?? [],
    required_starting_inputs: [
      "The linked lease and current source-tagged facts/Working terms",
      "The intended recipient and sender, verified through the existing message controls",
      "Available market evidence with its actual basis; unknown inputs remain explicit",
    ],
    steps: OWNER_RENEWAL_OUTREACH_STEPS.map((step) => ({
      title: step.title,
      description: step.description,
    })),
    action_references: [],
    success_condition:
      "The actual outreach state and owner outcome are recorded with their evidence. A copy, draft, send receipt, reply, owner approval and signature retain their separate meanings; no process tick invents completion.",
    stop_condition:
      "Hold only an operation whose actual current source, recipient, sender, policy or exact confirmation is unavailable or changed. Reconcile an ambiguous prior attempt before any retry. Unknown business/legal facts are never guessed; independent preparation remains usable.",
    escalation_condition:
      "Route a genuinely unresolved PMI business question to Dan with the existing evidence and smallest exact question. Landlord terms, legal/form use, financial policy and signer authority remain with their actual authorized approver; no job title grants that authority.",
  };
}
