// Renewal-notice SEND POLICY (S13 follow-on to F5). Decision 3 (owner 2026-07-02): an approved notice
// becomes an UNSENT Gmail draft that a human opens and clicks Send on — never an autonomous send. This
// module builds the UNSENT DRAFT REQUEST from a composed owner/tenant renewal draft: the exact
// recipient, subject, and body (with the verbatim DRAFT_BANNER prepended) that a future, client-
// approved `gmail.renewal_notice.draft_create` action would hand to the Gmail API.
//
// GOVERNANCE: pure text composition only, EXACTLY like lib/gmail-inbox-zero/drafts.ts — this module
// creates NO Gmail draft and has NO send capability. `production_allowed` and `send_allowed` are literal
// false. A missing recipient renders a visible `Needs Verification:` marker; a recipient is never
// invented. This module creates no Gmail draft; the live draft-create runtime is the separate governed
// executor for the Action Registry action `gmail.renewal_notice.draft_create`, now authorized
// (production_allowed:true as of 2026-07-19, F-SEND-AUTHORIZED). That executor drafts only a real run's
// verified recipient, never this sample-desk text. Pure + deterministic: no I/O, no Date.now.

import { DRAFT_BANNER, UNVERIFIED_PLACEHOLDER } from "@/lib/constants";
import type { OwnerRenewalDraft } from "@/lib/lease-renewal/owner-draft";
import type { TenantOfferDraft } from "@/lib/lease-renewal/tenant-draft";

export type RenewalNoticeChannel = "owner" | "tenant";

export interface RenewalNoticeDraftRequest {
  kind: "gmail_renewal_notice_draft";
  channel: RenewalNoticeChannel;
  /** Recipient email, or a `Needs Verification:` marker when absent (never invented). */
  to: string;
  subject: string;
  /** The message body with the verbatim DRAFT_BANNER prepended, so a human sees it in Gmail. */
  body: string;
  /** Inputs that were absent and rendered as `Needs Verification:` markers. */
  missingInputs: string[];
  /** Hard invariants — this never executes and never sends. Both are always false. */
  production_allowed: false;
  send_allowed: false;
}

/** Prepend the verbatim DRAFT_BANNER to a composed body (idempotent — never double-bannered). */
function withBanner(body: string): string {
  return body.startsWith(DRAFT_BANNER) ? body : `${DRAFT_BANNER}\n\n${body}`;
}

function resolveRecipient(
  recipientEmail: string | undefined,
  label: string,
  missingInputs: string[],
): string {
  const trimmed = recipientEmail?.trim();
  if (trimmed) return trimmed;
  missingInputs.push(`${label} email`);
  return UNVERIFIED_PLACEHOLDER.replace("<fact>", `${label} email`);
}

export interface OwnerNoticeSendInput {
  draft: OwnerRenewalDraft;
  ownerEmail?: string;
}

/** Build the unsent-draft request for an OWNER renewal email. Reuses the built owner composer. */
export function buildOwnerNoticeDraftRequest(
  input: OwnerNoticeSendInput,
): RenewalNoticeDraftRequest {
  const missingInputs = [...input.draft.missingInputs];
  const to = resolveRecipient(input.ownerEmail, "owner", missingInputs);
  return {
    kind: "gmail_renewal_notice_draft",
    channel: "owner",
    to,
    subject: input.draft.subject,
    body: withBanner(input.draft.body),
    missingInputs,
    production_allowed: false,
    send_allowed: false,
  };
}

export interface TenantNoticeSendInput {
  draft: TenantOfferDraft;
  tenantEmail?: string;
}

/** Build the unsent-draft request for a TENANT renewal offer (the email channel). The portal-chat +
 *  text channels stay separate human-send surfaces; only email becomes a Gmail draft. */
export function buildTenantNoticeDraftRequest(
  input: TenantNoticeSendInput,
): RenewalNoticeDraftRequest {
  const missingInputs: string[] = [];
  const to = resolveRecipient(input.tenantEmail, "tenant", missingInputs);
  const email = input.draft.channels.email;
  return {
    kind: "gmail_renewal_notice_draft",
    channel: "tenant",
    to,
    subject: email.subject ?? "Your lease renewal",
    body: withBanner(email.body),
    missingInputs,
    production_allowed: false,
    send_allowed: false,
  };
}
