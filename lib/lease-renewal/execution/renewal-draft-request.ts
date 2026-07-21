// Assemble and run the governed "create renewal-notice Gmail draft" action for the live path.
//
// This is the join between the live renewal run (recipient from resolveRenewalRecipient, notice body
// from the approved composers) and the governed executor. `buildRenewalNoticeDraftAction` produces the
// exact ExternalActionInput the LeaseGmailExecutor validates; `executeRenewalNoticeDraft` runs it
// through that executor with the live Gmail draft provider — but only after re-asserting the Action
// Registry production gate, so this helper can never create a draft for an action that governance has
// not authorized (and never for a `.send` action). Draft-only, per the owner-confirmed end state.

import { DRAFT_BANNER } from "@/lib/constants";
import {
  ExternalExecutionError,
  type ExternalActionInput,
  type ExternalActionReceipt,
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
  /** The VERIFIED recipient from resolveRenewalRecipient — a Needs-Verification result must not reach here.
   *  `channel` is carried so the assembly refuses an owner recipient on a tenant notice (and vice-versa). */
  recipient: { channel: RenewalRecipientChannel; to: string; sourceRef: string };
  /**
   * Additional authoritative CO-TENANT Cc recipients (F-LEASE-6), each resolved from the live lease with
   * its own source ref (index-aligned). Omitted for a single-tenant lease and the owner channel.
   */
  cc?: { emails: readonly string[]; sourceRefs: readonly string[] };
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
  if (input.recipient.channel !== input.channel) {
    throw new Error(
      `The resolved ${input.recipient.channel} recipient cannot be used on a ${input.channel} renewal notice.`,
    );
  }
  if (input.cc && input.cc.emails.length !== input.cc.sourceRefs.length) {
    throw new Error("Each renewal Cc recipient requires an index-aligned source ref.");
  }
  const body = input.body.startsWith(`${DRAFT_BANNER}\n\n`)
    ? input.body
    : `${DRAFT_BANNER}\n\n${input.body}`;
  const cc = input.cc?.emails.length ? input.cc : undefined;
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
      ...(cc
        ? {
            cc: cc.emails.join(", "),
            cc_source_refs: cc.sourceRefs.join(", "),
          }
        : {}),
      subject: input.subject,
      body,
      recipient_source_ref: input.recipient.sourceRef,
      mailbox_source_ref: input.mailbox.sourceRef,
      draft_banner_present: true,
    },
    sourceRefs: [...input.sourceRefs],
  };
}

// Source-ref prefixes that mark NON-authoritative (sample/test/fixture/diagnostic) data.
const NON_AUTHORITATIVE_SOURCE_PREFIXES = [
  "sample:",
  "fixture:",
  "smoke:",
  "test:",
  "dry:",
  "synthetic:",
  "browser:",
];
// Reserved / non-routable recipient domains that must never receive a real draft.
const NON_ROUTABLE_RECIPIENT =
  /(?:\.(?:invalid|test|example|localhost)|@(?:example\.(?:com|net|org)|localhost))$/i;

/**
 * Data-safety guard (NOT a governance gate): a REAL renewal draft must be addressed to an
 * authoritatively-sourced, routable recipient, so sample/test/fixture data can never become a real
 * client-facing draft — the invariant the Action Registry entry documents. Diagnostics (the smoke's
 * self-addressed draft) opt out explicitly via executeRenewalNoticeDraft's options.
 */
export function assertAuthoritativeRenewalRecipient(action: ExternalActionInput): void {
  const to = String(action.values.to ?? "")
    .trim()
    .toLowerCase();
  if (NON_ROUTABLE_RECIPIENT.test(to)) {
    throw new ExternalExecutionError(
      "Refusing to create a real draft for a non-routable (sample/test) recipient address.",
      "blocked",
    );
  }
  const sourceRef = String(action.values.recipient_source_ref ?? "")
    .trim()
    .toLowerCase();
  if (
    !sourceRef ||
    NON_AUTHORITATIVE_SOURCE_PREFIXES.some((prefix) => sourceRef.startsWith(prefix))
  ) {
    throw new ExternalExecutionError(
      "Refusing to create a real draft without an authoritative recipient source.",
      "blocked",
    );
  }
  // Every Cc co-tenant is held to the SAME bar as the primary recipient: routable and authoritatively
  // sourced, so a sample/test/fixture address can never ride along on a real draft (F-LEASE-6).
  const ccEmails = splitList(action.values.cc);
  const ccSourceRefs = splitList(action.values.cc_source_refs);
  if (ccEmails.length !== ccSourceRefs.length) {
    throw new ExternalExecutionError(
      "Each Cc recipient requires an index-aligned authoritative source.",
      "blocked",
    );
  }
  for (const ccEmail of ccEmails) {
    if (NON_ROUTABLE_RECIPIENT.test(ccEmail.toLowerCase())) {
      throw new ExternalExecutionError(
        "Refusing to create a real draft for a non-routable (sample/test) Cc recipient address.",
        "blocked",
      );
    }
  }
  for (const ccSource of ccSourceRefs) {
    const normalized = ccSource.toLowerCase();
    if (
      !normalized ||
      NON_AUTHORITATIVE_SOURCE_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    ) {
      throw new ExternalExecutionError(
        "Refusing to create a real draft with a Cc recipient that has no authoritative source.",
        "blocked",
      );
    }
  }
}

function splitList(value: unknown): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Create the real unsent draft for an assembled renewal-notice action. Enforces, in order: the
 * data-safety recipient guard (unless a diagnostic explicitly opts out) and the Action Registry
 * production gate (draft action is Approved for Execution; a `.send` action throws here). Then runs the
 * governed LeaseGmailExecutor with the live Gmail draft provider. `client` is a real GmailRuntimeClient
 * in production and a fake in tests, so no test contacts Gmail.
 */
export async function executeRenewalNoticeDraft(
  client: RenewalDraftGmailClient,
  action: ExternalActionInput,
  options: { allowNonAuthoritativeRecipient?: boolean } = {},
): Promise<ExternalActionReceipt> {
  if (!options.allowNonAuthoritativeRecipient) {
    assertAuthoritativeRenewalRecipient(action);
  }
  assertActionExecutable(action.actionKey);
  const executor = new LeaseGmailExecutor(new LiveRenewalGmailDraftProvider(client));
  return executor.execute(action);
}
