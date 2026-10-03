import type { AuthenticatedUser } from "@/lib/auth/session";
import { manualNonRenewalReason } from "@/lib/lease-renewal/notice-safety";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { buildRenewalNoticeDraftAction } from "@/lib/lease-renewal/execution/renewal-draft-request";
import {
  resolveSeparatedRenewalDraftRecipient,
  type RenewalDraftPreview,
} from "@/lib/lease-renewal/execution/renewal-draft-preview";
import { UNREADABLE_REFINED_BODY_MESSAGE } from "@/lib/lease-renewal/refined-message";
import { RenewalCopySelectionSchema } from "@/lib/lease-renewal/renewal-copy-contract";

export const UNSAVED_MESSAGE_DRAFT_REASON =
  "The message could not be saved, so no draft was prepared. Preview the draft again from the message on screen.";

/**
 * Same recipient resolver, exact action and executor as the legacy composer; only the supplied copy
 * version differs.
 *
 * S162: the preview is built from the saved message exactly as it is displayed, markers included.
 * Business completeness, a recorded owner or tenant response, a review record, the signature's
 * saving sender and a policy note are not prerequisites. What still refuses the draft, here on the
 * server so a stale or direct request cannot pass it: notice safety, the staff non-renewal
 * decision, a confirmed move-out, unresolved recipients, the approved publication, an unread
 * attempt history, and a message that is not saved or whose saved wording cannot be read.
 */
export function buildSuppliedRenewalDraftPreview(
  actor: AuthenticatedUser,
  current: Awaited<ReturnType<typeof currentRenewalMessage>>,
): RenewalDraftPreview {
  const { content, saved, workspace, publication } = current;
  const channel = content.channel;
  const reasons: string[] = [];
  const noticeBlock = manualNonRenewalReason(workspace) ?? current.noticeBlock;
  if (noticeBlock) reasons.push(noticeBlock);
  if (!current.basis.noticeSafety)
    reasons.push("Current notice approval safety must be verified before drafting.");
  if (!current.draftJournalAvailable)
    reasons.push("Reload the Gmail attempt history before preparing a new draft.");
  if (!workspace || !saved) reasons.push(UNSAVED_MESSAGE_DRAFT_REASON);
  if (current.bodyOverride?.state === "unreadable")
    reasons.push(UNREADABLE_REFINED_BODY_MESSAGE);
  if (publication.status !== "approved") reasons.push(publication.reason);
  // S124 (R-F03-03): a confirmed provider notice blocks a new ordinary renewal draft here, on the
  // server, so a stale client request cannot bypass it. Unknown evidence is a notice, not a block.
  if (current.moveOut?.state === "initiated") reasons.push(current.moveOut.label);
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
