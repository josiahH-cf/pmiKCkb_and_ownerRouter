import { EditableLayerError } from "@/lib/firestore/errors";
import { communicationEmailFrom } from "./inbound-classification";
import { communicationScopeKey } from "./sequence-attachments";
import type { WorkflowCommunicationContext } from "./workflow-context";
import type { GmailThreadView } from "@/lib/gmail-runtime/types";
import type {
  VerifiedCommunicationTarget,
  CommunicationReplyBinding,
} from "./sequence-model";
/** The browser selects an existing link and message; it never supplies a recipient or RFC header. */
export function bindWorkflowReply(
  context: WorkflowCommunicationContext,
  original: WorkflowCommunicationContext,
  thread: GmailThreadView,
  target: VerifiedCommunicationTarget,
): CommunicationReplyBinding {
  const ref = context.replyTo;
  if (
    !ref ||
    communicationScopeKey(context) !== communicationScopeKey(original) ||
    thread.id !== ref.threadId
  )
    throw new EditableLayerError(
      "This reply is not linked to the selected workflow.",
      403,
    );
  if (thread.truncated || thread.messages.some((m) => m.bodyTruncated))
    throw new EditableLayerError(
      "A complete original conversation read is required before replying.",
      409,
    );
  const parent = thread.messages.filter((m) => m.id === ref.parentId);
  if (
    parent.length !== 1 ||
    !parent[0].messageId ||
    !parent[0].subject ||
    parent[0].threadId !== thread.id
  )
    throw new EditableLayerError(
      "The selected original message is unavailable. Read the linked conversation again.",
      409,
    );
  const m = parent[0],
    participants = new Set(
      [m.from, ...m.to, ...m.cc].map(communicationEmailFrom).filter(Boolean),
    );
  if (
    !participants.has(ref.senderEmail.toLowerCase()) ||
    !target.to.length ||
    target.to.some((e) => !participants.has(e.toLowerCase()))
  )
    throw new EditableLayerError(
      "The current verified workflow recipients do not match this original conversation. Start a new communication with the current recipients.",
      409,
    );
  const headers = [m.messageId, m.subject, ...m.references];
  if (
    headers.some((v) => /[\r\n\x00-\x1f\x7f]/.test(v) || v.length > 998) ||
    !/^<[^<>\s]+@[^<>\s]+>$/.test(m.messageId)
  )
    throw new EditableLayerError(
      "The original message has unsupported reply headers; keep its history and compose a new message.",
      409,
    );
  return {
    senderEmail: ref.senderEmail.toLowerCase(),
    threadId: thread.id,
    parentMessageId: m.messageId,
    subject: m.subject,
    references: m.references.slice(-19),
  };
}
