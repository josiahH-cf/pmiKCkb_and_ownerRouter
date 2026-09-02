// S100 resident-reply draft builder: assembles the exact governed-draft action for ONE unsent
// Gmail draft to the one server-verified resident email. The browser supplies subject/body only;
// the recipient, mailbox, and provider target always come from the server-side fresh
// re-resolution against the authoritative lease-tenants relation.

import { DRAFT_BANNER } from "@/lib/constants";
import { deterministicDraftRfcMessageId } from "@/lib/external-execution/draft-identity";
import type { ExternalActionPreparationInput } from "@/lib/external-execution/s20-bridge";
import { RESIDENT_REPLY_DRAFT_KEY } from "@/lib/maintenance/execution/chat-sync-service";

export const RESIDENT_DRAFT_CONTRACT_REF = "documented:gmail:drafts.create:v1";
export const RESIDENT_DRAFT_CONNECTION_REF = "gmail-dwd-maintenance-draft:production";
export const RESIDENT_DRAFT_MAPPING_REF = "maintenance-resident-reply:v1";

export function buildResidentReplyDraftAction(input: {
  ticketRef: string;
  messageRef: string;
  recipient: { to: string; sourceRef: string };
  mailbox: { email: string; sourceRef: string };
  subject: string;
  body: string;
}): ExternalActionPreparationInput {
  const body = input.body.startsWith(`${DRAFT_BANNER}\n\n`)
    ? input.body
    : `${DRAFT_BANNER}\n\n${input.body}`;
  const identity = {
    dataMode: "live" as const,
    workflowId: input.ticketRef,
    actionId: `maintenance-resident-reply-draft:${input.ticketRef}:${input.messageRef}`,
    actionKey: RESIDENT_REPLY_DRAFT_KEY,
  };
  return {
    ...identity,
    contractRef: RESIDENT_DRAFT_CONTRACT_REF,
    connectionRef: RESIDENT_DRAFT_CONNECTION_REF,
    mappingRef: RESIDENT_DRAFT_MAPPING_REF,
    values: {
      rfc_message_id: deterministicDraftRfcMessageId(identity, input.mailbox.email),
      workflow_context: `maintenance:${input.ticketRef}:resident-reply`,
      ticket_ref: input.ticketRef,
      message_ref: input.messageRef,
      recipient_source_ref: input.recipient.sourceRef,
      mailbox_source_ref: input.mailbox.sourceRef,
      from: input.mailbox.email,
      to: input.recipient.to,
      subject: input.subject,
      body,
      draft_banner_present: true,
    },
    sourceRefs: [
      `maintenance:ticket:${input.ticketRef}`,
      `rentvine:chat-message:${input.messageRef}`,
      input.recipient.sourceRef,
    ],
  };
}
