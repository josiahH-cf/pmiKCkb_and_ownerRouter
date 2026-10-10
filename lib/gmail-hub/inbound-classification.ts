import type { GmailThreadView } from "@/lib/gmail-runtime/types";
export function communicationEmailFrom(value: string): string | null {
  const match = /(?:^|<)([^<>\s]+@[^<>\s]+)>?$/.exec(value.trim());
  return match ? match[1].toLowerCase() : null;
}
export function classifyIncomingMessage(
  m: GmailThreadView["messages"][number],
  participants?: readonly string[],
): "human" | "auto_reply" | "bounce" | "uncertain" {
  if (/multipart\/report.*report-type\s*=\s*"?delivery-status/i.test(m.contentType ?? ""))
    return "bounce";
  if (m.returnPath?.trim() === "<>" && /(?:mailer-daemon|postmaster)@/i.test(m.from))
    return "bounce";
  if (/^(auto-replied|auto-generated)(?:;|$)/i.test(m.autoSubmitted ?? ""))
    return "auto_reply";
  if (m.autoSubmitted && m.autoSubmitted.toLowerCase() !== "no") return "uncertain";
  if (/^(?:bulk|list|junk)$/i.test(m.precedence ?? "")) return "uncertain";
  const from = communicationEmailFrom(m.from);
  return from && (!participants || participants.some((v) => v.toLowerCase() === from))
    ? "human"
    : "uncertain";
}
