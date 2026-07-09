// Encode an RFC 2822 message as base64url for the Gmail drafts API. Mirrors the internal sender's encoder
// (lib/notifications/approval.ts) but is a DISTINCT module: the per-user runtime never sends. The body is
// already the banner-prefixed text from the composer (buildOwnerNoticeDraftRequest); this adds nothing to it.
export function encodeRawDraft(input: {
  to: string;
  subject: string;
  body: string;
  from?: string;
}): string {
  const lines = [
    ...(input.from ? [`From: ${input.from}`] : []),
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    input.body,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
