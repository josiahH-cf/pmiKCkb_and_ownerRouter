import type { ReplyTemplate } from "@/lib/gmail-inbox-zero/drafts";
import type { LabelRule } from "@/lib/gmail-inbox-zero/rules";

/**
 * Synthetic, in-boundary sample sets for the Gmail hub's Template + Triage workspace.
 *
 * Same simulation-only posture as lib/lease-renewal/sample-desk.ts: no real mailbox content and no
 * PII. These drive the workspace UI and let an operator see evaluateInboxTriage + buildReplyDraft run
 * over PASTED TriageMessageFacts BEFORE any Gmail access is granted. Every rule/template carries the
 * Admin approval vocabulary (Proposed | Approved | Retired); only Approved ones participate in triage
 * or produce a draft, so the Proposed entries below demonstrate the governance, not a live behavior.
 *
 * Pure data — no Gmail API, no I/O, no send capability. Client-safe (imports types only).
 */
export const SAMPLE_LABEL_RULES: readonly LabelRule[] = [
  {
    id: "rule-vendor-invoice",
    label: "Draft Ready",
    plain_english: "Vendor invoice questions are ready for a drafted acknowledgement.",
    criteria: { category: "vendor" },
    match_kind: "exact",
    status: "Approved",
  },
  {
    id: "rule-walkthrough-team",
    label: "Waiting on Team",
    plain_english:
      "Anything mentioning a walkthrough is waiting on the team to schedule it.",
    criteria: { subject_contains: "walkthrough" },
    match_kind: "pattern",
    status: "Approved",
  },
  {
    id: "rule-owner-money-holdback",
    label: "Dan Decision",
    plain_english:
      "Owner money threads go to Dan for a decision — label only, never auto-draft.",
    criteria: { category: "owner_money" },
    match_kind: "exact",
    status: "Approved",
  },
  {
    id: "rule-proposed-portal",
    label: "Waiting on Outside",
    plain_english:
      "Proposed: portal-access questions wait on the resident. Requires Admin approval before it participates.",
    criteria: { subject_contains: "portal" },
    match_kind: "pattern",
    status: "Proposed",
  },
];

export const SAMPLE_REPLY_TEMPLATES: readonly ReplyTemplate[] = [
  {
    id: "tpl-vendor-ack",
    name: "Vendor invoice acknowledgement",
    body: "Thanks — we received the invoice and will review it against the work order, then follow up.",
    status: "Approved",
  },
  {
    id: "tpl-scheduling-ack",
    name: "Scheduling acknowledgement",
    body: "Thanks for the note. We are coordinating scheduling on our side and will confirm a time shortly.",
    status: "Approved",
  },
  {
    id: "tpl-proposed-portal",
    name: "Portal access help (proposed)",
    body: "Here are the steps to reset your resident portal access.",
    status: "Proposed",
  },
];
