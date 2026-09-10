import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { buildRenewalNoticeDraftAction } from "@/lib/lease-renewal/execution/renewal-draft-request";
import {
  resolveSeparatedRenewalDraftRecipient,
  type RenewalDraftPreview,
} from "@/lib/lease-renewal/execution/renewal-draft-preview";
import { RenewalCopySelectionSchema } from "@/lib/lease-renewal/renewal-copy-contract";

/** Same recipient resolver, exact action and executor as the legacy composer; only the supplied copy version differs. */
export function buildSuppliedRenewalDraftPreview(
  actor: AuthenticatedUser,
  current: Awaited<ReturnType<typeof currentRenewalMessage>>,
): RenewalDraftPreview {
  const { content, saved, workspace, publication } = current;
  const channel = content.channel;
  const reasons = content.missing.map((value) => value.message);
  if (!current.draftJournalAvailable)
    reasons.push("Reload the Gmail attempt history before preparing a new draft.");
  if (!workspace) reasons.push("Select and review the current renewal cycle.");
  if (current.needsReview)
    reasons.push("Review and save the message against its current source facts.");
  if (!current.signatureMatchesActor)
    reasons.push("Review the signature for the signed-in managed sender.");
  if (publication.status !== "approved") reasons.push(publication.reason);
  const recipientResult = resolveSeparatedRenewalDraftRecipient({
    lease: current.lease,
    channel,
  });
  if (recipientResult.status === "blocked") reasons.push(...recipientResult.reasons);
  if (
    reasons.length ||
    !workspace ||
    !saved ||
    publication.status !== "approved" ||
    recipientResult.status !== "ready"
  )
    return { status: "blocked", channel, reasons: [...new Set(reasons)] };
  const { resolution } = recipientResult;
  const sourceRefs = [
    `rentvine:lease:${workspace.leaseId}`,
    `renewal-cycle:${workspace.cycleId}`,
    `approved-template:${publication.templateId}:${publication.contentHash}`,
    ...content.sourceRefs,
  ];
  const action = buildRenewalNoticeDraftAction({
    workflowId: `renewal-live:${workspace.leaseId}:cycle:${workspace.cycleId}`,
    actionId: `renewal-notice-draft:${channel}:${workspace.leaseId}:cycle:${workspace.cycleId}:preparation:${saved.revision}`,
    workflowContext: `renewal:${workspace.leaseId}`,
    channel,
    templateRef: publication.ref,
    copy: {
      templateContentHash: publication.contentHash,
      envelopeFingerprint: hashExecutionPreview({
        sourceFingerprint: current.basis.sourceFingerprint,
        preparationRevision: saved.revision,
        subject: content.subject,
        plainText: content.plainText,
        htmlBody: content.htmlBody,
        recipient: resolution,
        attachments: content.attachments,
      }),
    },
    recipient: { channel, to: resolution.to, sourceRef: resolution.recipientSourceRef },
    ...(resolution.cc?.length
      ? { cc: { emails: resolution.cc, sourceRefs: resolution.ccSourceRefs ?? [] } }
      : {}),
    mailbox: { email: actor.email, sourceRef: `session:${actor.uid}` },
    subject: content.subject,
    body: content.plainText,
    htmlBody: content.htmlBody,
    ...(current.attachment ? { attachment: current.attachment } : {}),
    sourceRefs,
  });
  return {
    status: "ready",
    channel,
    subject: content.subject,
    body: String(action.values.body),
    htmlBody: String(action.values.html_body),
    recipient: {
      to: resolution.to,
      sourceRef: resolution.recipientSourceRef,
      ...(resolution.cc?.length ? { cc: resolution.cc } : {}),
    },
    template: {
      ref: publication.ref,
      version: "v2.0",
      contentHash: publication.contentHash,
      status: "approved",
    },
    copy: RenewalCopySelectionSchema.parse({
      templateRef: publication.ref,
      templateVersion: "v2.0",
      editableRegions: current.inputs.edits,
    }),
    action,
    ...(current.attachment
      ? {
          attachment: {
            label: `Comp screenshot attachment: ${current.attachment.filename}`,
            filename: current.attachment.filename,
            mimeType: current.attachment.mimeType,
            sizeBytes: current.attachment.sizeBytes,
          },
        }
      : {}),
  };
}
