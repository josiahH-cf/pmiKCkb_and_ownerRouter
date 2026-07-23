// Assemble and run the governed "create maintenance owner-notice Gmail draft" action for the live path.
//
// This mirrors lib/lease-renewal/execution/renewal-draft-request.ts for the maintenance owner channel.
// `buildMaintenanceOwnerNoticeDraftAction` produces the exact ExternalActionInput for the already-open
// gmail.maintenance_owner_notice.draft_create gate; `executeMaintenanceOwnerNoticeDraft` runs it through
// the governed LeaseGmailExecutor with the SAME createDraft-only live provider the renewal draft uses —
// but only after re-asserting the authoritative-recipient data-safety guard and the Action Registry
// production gate. Draft-only by construction: LiveRenewalGmailDraftProvider hard-refuses every non-draft
// operation, and gmail.maintenance_owner_notice.send stays production_allowed:false. Nothing here sends.

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
import { assertAuthoritativeRenewalRecipient } from "@/lib/lease-renewal/execution/renewal-draft-request";

export const MAINTENANCE_OWNER_NOTICE_DRAFT_ACTION_KEY =
  "gmail.maintenance_owner_notice.draft_create" as const;

export const MAINTENANCE_OWNER_TEMPLATE_REF = "maintenance-owner:v1.0" as const;

export interface MaintenanceOwnerNoticeDraftActionInput {
  /** The persisted ticket id. Bound as workflowId so ticket_ref === workflowId (S38b send binding). */
  ticketRef: string;
  /** The unit tag that scopes the workflow context (never empty for a persisted, unit-matched ticket). */
  unitTag: string;
  /** The VERIFIED owner recipient, resolved authoritatively server-side (never from a form). */
  recipient: { to: string; sourceRef: string };
  /** The authenticated sender mailbox that will hold the unsent draft. */
  mailbox: { email: string; sourceRef: string };
  subject: string;
  /** The composed notice body; the verbatim DRAFT_BANNER is prepended here if not already present. */
  body: string;
}

/**
 * Build the exact governed ExternalActionInput for gmail.maintenance_owner_notice.draft_create. Pure: it
 * only shapes values (and idempotently applies the banner); it performs no I/O and enforces no gate — the
 * executor and executeMaintenanceOwnerNoticeDraft own validation and the production gate.
 */
export function buildMaintenanceOwnerNoticeDraftAction(
  input: MaintenanceOwnerNoticeDraftActionInput,
): ExternalActionInput {
  const body = input.body.startsWith(`${DRAFT_BANNER}\n\n`)
    ? input.body
    : `${DRAFT_BANNER}\n\n${input.body}`;
  return {
    dataMode: "live",
    workflowId: input.ticketRef,
    actionId: `maintenance-owner-notice-draft:${input.ticketRef}`,
    actionKey: MAINTENANCE_OWNER_NOTICE_DRAFT_ACTION_KEY,
    values: {
      workflow_context: `maintenance:${input.ticketRef}:${input.unitTag}`,
      template_ref: MAINTENANCE_OWNER_TEMPLATE_REF,
      from: input.mailbox.email,
      to: input.recipient.to,
      subject: input.subject,
      body,
      ticket_ref: input.ticketRef,
      recipient_source_ref: input.recipient.sourceRef,
      mailbox_source_ref: input.mailbox.sourceRef,
      draft_banner_present: true,
    },
    sourceRefs: [`maintenance:ticket:${input.ticketRef}`, input.recipient.sourceRef],
  };
}

/**
 * Create the real unsent draft for an assembled maintenance owner-notice action. Enforces, in order: the
 * data-safety recipient guard (sample/test/non-routable addresses can never become a real draft) and the
 * Action Registry production gate (the draft action is Approved for Execution; the paired `.send` action
 * throws here). Then runs the governed LeaseGmailExecutor with the createDraft-only live provider. `client`
 * is a real GmailRuntimeClient in production and a fake in tests, so no test contacts Gmail.
 */
export async function executeMaintenanceOwnerNoticeDraft(
  client: RenewalDraftGmailClient,
  action: ExternalActionInput,
): Promise<ExternalActionReceipt> {
  assertAuthoritativeRenewalRecipient(action);
  assertActionExecutable(action.actionKey);
  const executor = new LeaseGmailExecutor(new LiveRenewalGmailDraftProvider(client));
  return executor.execute(action);
}
