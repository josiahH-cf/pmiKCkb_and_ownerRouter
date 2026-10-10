import type { RenewalMessageContent } from "@/lib/lease-renewal/renewal-message-content";
import {
  RichCommunicationMessageSchema,
  type RichCommunicationMessage,
} from "@/lib/gmail-hub/sequence-model";
/** Preserve composed and authored paragraph styling in the new-tab workflow handoff. */
export function communicationMessageFromRenewalContent(
  content: RenewalMessageContent,
): RichCommunicationMessage {
  return RichCommunicationMessageSchema.parse({
    subject: content.subject,
    attachmentIds: [],
    paragraphs: content.paragraphs.map((p) =>
      p.map((r) => ({
        text: (r.breakBefore ? "\n" : "") + r.text,
        ...(r.emphasis === "name" || r.emphasis === "strong" ? { bold: true } : {}),
        ...(r.href ? { href: r.href } : {}),
      })),
    ),
  });
}
