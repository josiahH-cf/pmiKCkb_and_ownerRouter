// Compose a renewal-notice draft PREVIEW for the live path — the reusable core a route/UI calls before
// a human confirms creation. It joins the three governed pieces: recipient resolution (from the live
// lease), the approved-decision composer + authority validation (renderGovernedArtifactInstance), and
// the governed action assembly (buildRenewalNoticeDraftAction). It performs NO I/O and creates NO
// draft — it returns either a `ready` result carrying the exact ExternalActionInput to hand to
// executeRenewalNoticeDraft after confirmation, or a `blocked` result with the human-readable reasons
// (unverified recipient, or missing/unverified notice inputs). Nothing here can send.

import type { RawLease } from "@/lib/integrations/rentvine/client";
import type { ExternalActionInput } from "@/lib/external-execution/types";
import {
  renderGovernedArtifactInstance,
  type AuthoritativeAddress,
} from "@/lib/gmail-hub/governed-artifacts";
import {
  buildRenewalNoticeDraftAction,
  type RenewalNoticeTemplateRef,
} from "@/lib/lease-renewal/execution/renewal-draft-request";
import type { OwnerDraftInput } from "@/lib/lease-renewal/owner-draft";
import {
  resolveRenewalRecipient,
  type RenewalRecipientChannel,
  type RenewalRecipientFieldMap,
} from "@/lib/lease-renewal/recipient-resolution";
import type { TenantOfferInput } from "@/lib/lease-renewal/tenant-draft";

const TEMPLATE_FOR_CHANNEL: Record<RenewalRecipientChannel, RenewalNoticeTemplateRef> = {
  owner: "owner-renewal:v1.0",
  tenant: "tenant-renewal:v1.0",
};

interface CommonPreviewInput {
  /** The live Rentvine lease view the recipient is resolved from. */
  lease: RawLease;
  /** The authenticated sender mailbox that would hold the draft. */
  mailbox: { email: string; sourceRef: string };
  workflowId: string;
  actionId: string;
  workflowContext: string;
  sourceRefs: readonly string[];
  recipientFieldMap?: RenewalRecipientFieldMap;
}

export type RenewalDraftPreviewInput =
  | (CommonPreviewInput & { channel: "owner"; decision: OwnerDraftInput })
  | (CommonPreviewInput & { channel: "tenant"; decision: TenantOfferInput });

export type RenewalDraftPreview =
  | {
      status: "ready";
      channel: RenewalRecipientChannel;
      recipient: { to: string; sourceRef: string };
      subject: string;
      /** The composed body, with the review-before-sending banner applied. */
      body: string;
      /** The exact governed action to hand to executeRenewalNoticeDraft after human confirmation. */
      action: ExternalActionInput;
    }
  | {
      status: "blocked";
      channel: RenewalRecipientChannel;
      /** Human-readable reasons: an unverified recipient, or missing/unverified notice inputs. */
      reasons: string[];
    };

/**
 * Build a ready-or-blocked renewal-notice draft preview. Pure and deterministic. The recipient is
 * resolved authoritatively from the lease (never invented); the notice is composed and authority-checked
 * by the governed artifact renderer; and only when both succeed is a real assembled action returned.
 */
export function buildRenewalNoticeDraftPreview(
  input: RenewalDraftPreviewInput,
): RenewalDraftPreview {
  const resolution = resolveRenewalRecipient({
    lease: input.lease,
    channel: input.channel,
    ...(input.recipientFieldMap ? { fieldMap: input.recipientFieldMap } : {}),
  });
  if (!resolution.verified || !resolution.to || !resolution.recipientSourceRef) {
    return {
      status: "blocked",
      channel: input.channel,
      reasons: resolution.missing.map((item) => `Recipient ${item} needs verification.`),
    };
  }

  const recipient: AuthoritativeAddress = {
    email: resolution.to,
    sourceRef: resolution.recipientSourceRef,
    verified: true,
  };
  const mailbox: AuthoritativeAddress = {
    email: input.mailbox.email,
    sourceRef: input.mailbox.sourceRef,
    verified: true,
  };

  const instance =
    input.channel === "owner"
      ? renderGovernedArtifactInstance({
          artifactRef: "owner-renewal:v1.0",
          values: input.decision,
          recipient,
          mailbox,
          sourceRefs: input.sourceRefs,
        })
      : renderGovernedArtifactInstance({
          artifactRef: "tenant-renewal:v1.0",
          values: input.decision,
          recipient,
          mailbox,
          sourceRefs: input.sourceRefs,
        });

  if (instance.status === "blocked") {
    return { status: "blocked", channel: input.channel, reasons: instance.reasons };
  }

  const rendered = instance.rendered;
  let subject: string;
  let body: string;
  if (rendered.kind === "owner_renewal_email") {
    subject = rendered.subject;
    body = rendered.body;
  } else if (rendered.kind === "tenant_renewal_offer") {
    subject = rendered.channels.email.subject ?? "Your lease renewal";
    body = rendered.channels.email.body;
  } else {
    return {
      status: "blocked",
      channel: input.channel,
      reasons: ["The composed artifact was not a renewal notice."],
    };
  }

  const action = buildRenewalNoticeDraftAction({
    workflowId: input.workflowId,
    actionId: input.actionId,
    channel: input.channel,
    templateRef: TEMPLATE_FOR_CHANNEL[input.channel],
    recipient: {
      channel: input.channel,
      to: resolution.to,
      sourceRef: resolution.recipientSourceRef,
    },
    mailbox: input.mailbox,
    subject,
    body,
    workflowContext: input.workflowContext,
    sourceRefs: input.sourceRefs,
  });

  return {
    status: "ready",
    channel: input.channel,
    recipient: { to: resolution.to, sourceRef: resolution.recipientSourceRef },
    subject,
    body: String(action.values.body),
    action,
  };
}
