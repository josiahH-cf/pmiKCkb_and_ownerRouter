// Assemble and run the governed "create renewal-notice Gmail draft" action for the live path.
//
// This is the join between the live renewal run (recipient from resolveRenewalRecipient, notice body
// from the approved composers) and the governed executor. `buildRenewalNoticeDraftAction` produces the
// exact ExternalActionInput the LeaseGmailExecutor validates; `executeRenewalNoticeDraft` runs it
// through that executor with the live Gmail draft provider — but only after re-asserting the Action
// Registry production gate, so this helper can never create a draft for an action that governance has
// not authorized (and never for a `.send` action). Draft-only, per the owner-confirmed end state.

import { DRAFT_BANNER } from "@/lib/constants";
import type {
  ExternalActionInput,
  ExternalActionReceipt,
} from "@/lib/external-execution/types";
import { assertActionExecutable } from "@/lib/integrations/action-gate";
import {
  LiveRenewalGmailDraftProvider,
  type RenewalDraftGmailClient,
} from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import { LeaseGmailExecutor } from "@/lib/lease-renewal/execution/providers";
import type { RenewalRecipientChannel } from "@/lib/lease-renewal/recipient-resolution";

export const RENEWAL_NOTICE_DRAFT_ACTION_KEY =
  "gmail.renewal_notice.draft_create" as const;

export type RenewalNoticeTemplateRef = "owner-renewal:v1.0" | "tenant-renewal:v1.0";

const TEMPLATE_FOR_CHANNEL: Record<RenewalRecipientChannel, RenewalNoticeTemplateRef> = {
  owner: "owner-renewal:v1.0",
  tenant: "tenant-renewal:v1.0",
};

export interface RenewalNoticeDraftActionInput {
  workflowId: string;
  actionId: string;
  channel: RenewalRecipientChannel;
  templateRef: RenewalNoticeTemplateRef;
  /** The VERIFIED recipient from resolveRenewalRecipient — a Needs-Verification result must not reach here. */
  recipient: { to: string; sourceRef: string };
  /** The authenticated sender mailbox that will hold the unsent draft. */
  mailbox: { email: string; sourceRef: string };
  subject: string;
  /** The composed notice body; the verbatim DRAFT_BANNER is prepended here if not already present. */
  body: string;
  workflowContext: string;
  sourceRefs: readonly string[];
}

/**
 * Build the exact governed ExternalActionInput for gmail.renewal_notice.draft_create. Pure: it only
 * shapes values (and idempotently applies the banner); it performs no I/O and enforces no gate — the
 * executor and executeRenewalNoticeDraft own validation and the production gate.
 */
export function buildRenewalNoticeDraftAction(
  input: RenewalNoticeDraftActionInput,
): ExternalActionInput {
  if (input.templateRef !== TEMPLATE_FOR_CHANNEL[input.channel]) {
    throw new Error(
      `The renewal ${input.channel} channel requires template ${TEMPLATE_FOR_CHANNEL[input.channel]}.`,
    );
  }
  const body = input.body.startsWith(`${DRAFT_BANNER}\n\n`)
    ? input.body
    : `${DRAFT_BANNER}\n\n${input.body}`;
  return {
    dataMode: "live",
    workflowId: input.workflowId,
    actionId: input.actionId,
    actionKey: RENEWAL_NOTICE_DRAFT_ACTION_KEY,
    values: {
      workflow_context: input.workflowContext,
      template_ref: input.templateRef,
      from: input.mailbox.email,
      to: input.recipient.to,
      subject: input.subject,
      body,
      recipient_source_ref: input.recipient.sourceRef,
      mailbox_source_ref: input.mailbox.sourceRef,
      draft_banner_present: true,
    },
    sourceRefs: [...input.sourceRefs],
  };
}

/**
 * Create the real unsent draft for an assembled renewal-notice action. Re-asserts the Action Registry
 * production gate (draft action is Approved for Execution; a `.send` action would throw here), then runs
 * the governed LeaseGmailExecutor with the live Gmail draft provider. `client` is a real
 * GmailRuntimeClient in production and a fake in tests, so no test contacts Gmail.
 */
export async function executeRenewalNoticeDraft(
  client: RenewalDraftGmailClient,
  action: ExternalActionInput,
): Promise<ExternalActionReceipt> {
  assertActionExecutable(action.actionKey);
  const executor = new LeaseGmailExecutor(new LiveRenewalGmailDraftProvider(client));
  return executor.execute(action);
}
