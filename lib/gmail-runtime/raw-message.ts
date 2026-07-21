import type { GmailOutgoingMessage } from "@/lib/gmail-runtime/types";

// Encode one exact RFC message as base64url. Callers bind this logical payload to a one-time
// confirmation before send. Header values reject CR/LF so a request cannot inject recipients/headers.
export function encodeRawMessage(input: GmailOutgoingMessage): string {
  const lines = [
    `From: ${safeHeader(input.from, "From")}`,
    `To: ${input.to.map((value) => safeHeader(value, "To")).join(", ")}`,
    ...(input.cc.length
      ? [`Cc: ${input.cc.map((value) => safeHeader(value, "Cc")).join(", ")}`]
      : []),
    ...(input.bcc.length
      ? [`Bcc: ${input.bcc.map((value) => safeHeader(value, "Bcc")).join(", ")}`]
      : []),
    `Subject: ${safeHeader(input.subject, "Subject")}`,
    `Message-ID: ${safeHeader(input.messageId, "Message-ID")}`,
    ...(input.inReplyTo
      ? [`In-Reply-To: ${safeHeader(input.inReplyTo, "In-Reply-To")}`]
      : []),
    ...(input.references.length
      ? [
          `References: ${input.references
            .map((value) => safeHeader(value, "References"))
            .join(" ")}`,
        ]
      : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.body,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

// Backward-compatible helper for the existing renewal unsent-draft action.
export function encodeRawDraft(input: {
  to: string;
  cc?: readonly string[];
  subject: string;
  body: string;
  from?: string;
}): string {
  const cc = (input.cc ?? []).filter((value) => value.trim());
  const lines = [
    ...(input.from ? [`From: ${safeHeader(input.from, "From")}`] : []),
    `To: ${safeHeader(input.to, "To")}`,
    ...(cc.length
      ? [`Cc: ${cc.map((value) => safeHeader(value, "Cc")).join(", ")}`]
      : []),
    `Subject: ${safeHeader(input.subject, "Subject")}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    input.body,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

function safeHeader(value: string, label: string): string {
  if (!value.trim() || /[\r\n]/.test(value)) {
    throw new Error(`${label} contains an invalid header value.`);
  }
  return value.trim();
}
