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
import {
  prepareGovernedRenewalCopy,
  type RenewalCopyTemplateDefinition,
} from "@/lib/lease-renewal/renewal-copy-governance";
import type { RenewalCopySelection } from "@/lib/lease-renewal/renewal-copy-contract";

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
  copyTemplate: RenewalCopyTemplateDefinition;
  copySelection?: RenewalCopySelection;
}

export type RenewalDraftPreviewInput =
  | (CommonPreviewInput & { channel: "owner"; decision: OwnerDraftInput })
  | (CommonPreviewInput & { channel: "tenant"; decision: TenantOfferInput });

export type RenewalDraftPreview =
  | {
      status: "ready";
      channel: RenewalRecipientChannel;
      recipient: { to: string; sourceRef: string; cc?: string[] };
      subject: string;
      /** The composed body, with the review-before-sending banner applied. */
      body: string;
      template: ReturnType<typeof prepareGovernedRenewalCopy>["template"];
      copy: RenewalCopySelection;
      /** The exact governed action to hand to executeRenewalNoticeDraft after human confirmation. */
      action: ExternalActionInput;
    }
  | {
      status: "review_only";
      channel: RenewalRecipientChannel;
      recipient: { to: string; sourceRef: string; cc?: string[] };
      subject: string;
      body: string;
      template: ReturnType<typeof prepareGovernedRenewalCopy>["template"];
      copy: RenewalCopySelection;
      reasons: string[];
      /** Rebuilt only so a previously consumed execution can still use read-only reconciliation. */
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

  // S61 channel-separation assertion (owner direction, stated as an absolute: owners and residents
  // never see each other's contact info). The requested channel's full recipient set must contain
  // no address that ALSO resolves as an authoritative address on the other channel for this lease.
  // A violation refuses the draft and names the collision — a refusal is reversible; a leaked
  // contact is not.
  const otherChannel: RenewalRecipientChannel =
    input.channel === "owner" ? "tenant" : "owner";
  const otherResolution = resolveRenewalRecipient({
    lease: input.lease,
    channel: otherChannel,
    ...(input.recipientFieldMap ? { fieldMap: input.recipientFieldMap } : {}),
  });
  const otherAddresses = new Set(
    [otherResolution.to, ...(otherResolution.cc ?? [])].filter((email): email is string =>
      Boolean(email),
    ),
  );
  const requestedAddresses = [resolution.to, ...(resolution.cc ?? [])];
  const collisions = requestedAddresses.filter((email) => otherAddresses.has(email));
  if (collisions.length > 0) {
    return {
      status: "blocked",
      channel: input.channel,
      reasons: collisions.map(
        (email) =>
          `Channel separation: ${email} resolves as an authoritative address on both the owner and tenant channels for this lease. The draft is refused so neither side sees the other's contact information; correct the lease's contact records first.`,
      ),
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
  if (
    rendered.kind !== "owner_renewal_email" &&
    rendered.kind !== "tenant_renewal_offer"
  ) {
    return {
      status: "blocked",
      channel: input.channel,
      reasons: ["The composed artifact was not a renewal notice."],
    };
  }

  const ccEmails = resolution.cc ?? [];
  const ccSourceRefs = resolution.ccSourceRefs ?? [];
  const governedCopy = prepareGovernedRenewalCopy({
    template: input.copyTemplate,
    rendered,
    recipient: {
      to: resolution.to,
      sourceRef: resolution.recipientSourceRef,
      ...(ccEmails.length
        ? {
            cc: ccEmails.map((to, index) => ({
              to,
              sourceRef: ccSourceRefs[index] ?? "",
            })),
          }
        : {}),
    },
    workflowId: input.workflowId,
    workflowContext: input.workflowContext,
    sourceRefs: input.sourceRefs,
    ...(input.copySelection ? { selection: input.copySelection } : {}),
  });
  if (governedCopy.status === "blocked") {
    return {
      status: "blocked",
      channel: input.channel,
      reasons: governedCopy.reasons,
    };
  }

  const action = buildRenewalNoticeDraftAction({
    workflowId: input.workflowId,
    actionId: input.actionId,
    channel: input.channel,
    templateRef: TEMPLATE_FOR_CHANNEL[input.channel],
    copy: {
      templateContentHash: governedCopy.template.contentHash,
      envelopeFingerprint: governedCopy.envelope.fingerprint,
    },
    recipient: {
      channel: input.channel,
      to: resolution.to,
      sourceRef: resolution.recipientSourceRef,
    },
    ...(ccEmails.length ? { cc: { emails: ccEmails, sourceRefs: ccSourceRefs } } : {}),
    mailbox: input.mailbox,
    subject: governedCopy.subject,
    body: governedCopy.body,
    workflowContext: input.workflowContext,
    sourceRefs: input.sourceRefs,
  });

  const commonResult = {
    channel: input.channel,
    recipient: {
      to: resolution.to,
      sourceRef: resolution.recipientSourceRef,
      ...(ccEmails.length ? { cc: ccEmails } : {}),
    },
    subject: governedCopy.subject,
    body: String(action.values.body),
    template: governedCopy.template,
    copy: governedCopy.selection,
    action,
  };
  return governedCopy.status === "review_only"
    ? {
        ...commonResult,
        status: "review_only",
        reasons: governedCopy.reasons,
      }
    : { ...commonResult, status: "ready" };
}
