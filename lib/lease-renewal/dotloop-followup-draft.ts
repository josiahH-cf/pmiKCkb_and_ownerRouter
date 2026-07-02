// Dotloop follow-up DRAFT composer (S13 Wave 2 / space-teeth E3a).
//
// Composes a source-tagged follow-up nudge for a renewal Dotloop loop — the "chase the signature"
// message the team sends repeatedly today — in the same draft-only shape as the renewal/maintenance
// composers (reuses DraftFact). It REFERENCES the two EXISTING Dotloop Action Registry keys
// (dotloop.loop.create_from_template, dotloop.document.upload); it authors NO new registry metadata
// and both keys stay `readiness: "Needs Permission"` (non-executable).
//
// GOVERNANCE: draft ONLY — `production_allowed` / `send_allowed` are literal `false`; a human sends.
// Any unresolved participant / template / property field renders a visible `Needs Verification:`
// marker, never an invented value. Pure + deterministic: no I/O, no Date.now().

import type { DraftFact } from "@/lib/lease-renewal/owner-draft";

const NEEDS_VERIFICATION = "Needs Verification";

/** The two EXISTING Dotloop registry keys this draft references (never authored here). */
export const DOTLOOP_FOLLOWUP_ACTION_KEYS = [
  "dotloop.loop.create_from_template",
  "dotloop.document.upload",
] as const;

export interface DotloopParticipant {
  name?: string;
  email?: string;
  role?: string;
}

export interface DotloopFollowUpInput {
  propertyLabel?: string;
  loopName?: string;
  templateName?: string;
  participants?: readonly DotloopParticipant[];
}

export interface DotloopFollowUpDraft {
  kind: "dotloop_followup";
  subject: string;
  body: string;
  facts: DraftFact[];
  missingInputs: string[];
  /** References the two EXISTING Dotloop registry keys (both readiness "Needs Permission"). */
  actionReferenceKeys: readonly string[];
  production_allowed: false;
  send_allowed: false;
}

function isUnverified(value: string | undefined | null): boolean {
  return !value || value.startsWith(NEEDS_VERIFICATION);
}

/** Compose a source-tagged Dotloop follow-up draft. No send; missing inputs stay visible. */
export function buildDotloopFollowUpDraft(
  input: DotloopFollowUpInput,
): DotloopFollowUpDraft {
  const facts: DraftFact[] = [];
  const missingInputs: string[] = [];

  const propertyResolved = !isUnverified(input.propertyLabel);
  const property = propertyResolved
    ? (input.propertyLabel as string)
    : `[${NEEDS_VERIFICATION}: property/unit]`;
  if (!propertyResolved) missingInputs.push("property/unit");
  facts.push({
    key: "property",
    label: "Property",
    value: property,
    source: "RentVine (read-authoritative)",
    confidence: propertyResolved ? "Likely" : NEEDS_VERIFICATION,
  });

  const loopResolved = !isUnverified(input.loopName);
  const loopName = loopResolved
    ? (input.loopName as string)
    : `[${NEEDS_VERIFICATION}: Dotloop loop name]`;
  if (!loopResolved) missingInputs.push("Dotloop loop name");
  facts.push({
    key: "loop",
    label: "Dotloop loop",
    value: loopName,
    source: "Dotloop",
    confidence: loopResolved ? "Likely" : NEEDS_VERIFICATION,
  });

  const templateResolved = !isUnverified(input.templateName);
  const templateName = templateResolved
    ? (input.templateName as string)
    : `[${NEEDS_VERIFICATION}: renewal template]`;
  if (!templateResolved) missingInputs.push("Dotloop template");
  facts.push({
    key: "template",
    label: "Template",
    value: templateName,
    source: "Dotloop",
    confidence: templateResolved ? "Likely" : NEEDS_VERIFICATION,
  });

  const participants = input.participants ?? [];
  if (participants.length === 0) {
    missingInputs.push("participant(s)");
    facts.push({
      key: "participants",
      label: "Participants",
      value: `[${NEEDS_VERIFICATION}: participant name/email]`,
      source: "Dotloop / RentVine",
      confidence: NEEDS_VERIFICATION,
    });
  } else {
    participants.forEach((participant, index) => {
      const nameResolved = !isUnverified(participant.name);
      const name = nameResolved
        ? (participant.name as string)
        : `[${NEEDS_VERIFICATION}: participant name]`;
      if (!nameResolved) missingInputs.push(`participant ${index + 1} name`);
      facts.push({
        key: `participant_${index + 1}`,
        label: `Participant ${index + 1}`,
        value: participant.role ? `${name} (${participant.role})` : name,
        source: "Dotloop / RentVine",
        confidence: nameResolved ? "Likely" : NEEDS_VERIFICATION,
      });
    });
  }

  const subject = `Please sign: renewal documents for ${property}`;
  const body = [
    `Hi,`,
    ``,
    `This is a friendly follow-up on the renewal documents for ${property} in Dotloop (${loopName}).`,
    `When you have a moment, please review and e-sign so we can finalize the renewal.`,
    ``,
    `If you have any questions about the documents, just reply here and we'll help.`,
    ``,
    `Thanks,`,
    `PMI KC Metro`,
  ].join("\n");

  return {
    kind: "dotloop_followup",
    subject,
    body,
    facts,
    missingInputs,
    actionReferenceKeys: [...DOTLOOP_FOLLOWUP_ACTION_KEYS],
    production_allowed: false,
    send_allowed: false,
  };
}
