import { createHash } from "node:crypto";

import type { GmailOutgoingMessage } from "@/lib/gmail-runtime/types";

export const GMAIL_DRAFT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

const GMAIL_DRAFT_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const GMAIL_DRAFT_ATTACHMENT_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
};
const SAFE_ATTACHMENT_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_ATTACHMENT_TRANSFER_CHARACTERS =
  Math.ceil(GMAIL_DRAFT_ATTACHMENT_MAX_BYTES / 3) * 4;
const MAX_ATTACHMENT_LINE_BREAK_CHARACTERS =
  Math.ceil(MAX_ATTACHMENT_TRANSFER_CHARACTERS / 76) * 2;
const MAX_DRAFT_RFC_BYTES =
  MAX_ATTACHMENT_TRANSFER_CHARACTERS + MAX_ATTACHMENT_LINE_BREAK_CHARACTERS + 256 * 1024;
const MAX_DRAFT_RAW_BASE64URL_CHARACTERS = Math.ceil(MAX_DRAFT_RFC_BYTES / 3) * 4;

export interface GmailDraftAttachmentInput {
  /** Server-generated basename only; paths, encoded headers, and free-form display names are refused. */
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface DecodedGmailDraftAttachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256Checksum: string;
  bytes: Uint8Array;
}

export interface DecodedGmailDraft {
  from?: string;
  to: string;
  cc: string[];
  subject: string;
  messageId?: string;
  body: string;
  attachment?: DecodedGmailDraftAttachment;
}

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
  /** Deterministic RFC Message-ID so a governed draft can be reconciled by identifier. */
  messageId?: string;
  /** S79's single, receipt-bound image. Omission preserves the historical text-only bytes exactly. */
  attachment?: GmailDraftAttachmentInput;
}): string {
  const cc = (input.cc ?? []).filter((value) => value.trim());
  if (input.attachment) {
    return encodeMultipartDraft(input, cc, validateAttachment(input.attachment));
  }
  const lines = [
    ...(input.from ? [`From: ${safeHeader(input.from, "From")}`] : []),
    `To: ${safeHeader(input.to, "To")}`,
    ...(cc.length
      ? [`Cc: ${cc.map((value) => safeHeader(value, "Cc")).join(", ")}`]
      : []),
    ...(input.messageId
      ? [`Message-ID: ${safeHeader(input.messageId, "Message-ID")}`]
      : []),
    `Subject: ${safeHeader(input.subject, "Subject")}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    input.body,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

function encodeMultipartDraft(
  input: {
    to: string;
    cc?: readonly string[];
    subject: string;
    body: string;
    from?: string;
    messageId?: string;
  },
  cc: readonly string[],
  attachment: GmailDraftAttachmentInput,
): string {
  const attachmentBase64 = Buffer.from(attachment.bytes).toString("base64");
  const boundary = multipartBoundary(input.body, attachment, attachmentBase64);
  const headers = [
    ...(input.from ? [`From: ${safeHeader(input.from, "From")}`] : []),
    `To: ${safeHeader(input.to, "To")}`,
    ...(cc.length
      ? [`Cc: ${cc.map((value) => safeHeader(value, "Cc")).join(", ")}`]
      : []),
    ...(input.messageId
      ? [`Message-ID: ${safeHeader(input.messageId, "Message-ID")}`]
      : []),
    `Subject: ${safeHeader(input.subject, "Subject")}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];
  const textPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeCrlf(input.body),
  ].join("\r\n");
  const attachmentPart = [
    `--${boundary}`,
    `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(attachmentBase64),
  ].join("\r\n");
  const message = [
    headers.join("\r\n"),
    "",
    textPart,
    attachmentPart,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(message, "utf8").toString("base64url");
}

/**
 * Decode only the exact text-only or one-image draft shape emitted above. This is intentionally not
 * a general MIME parser: extra parts, nested MIME, HTML, inline content, folded unsafe filenames,
 * malformed transfer encoding, or an unbounded payload all fail closed.
 */
export function decodeRawDraft(raw: string): DecodedGmailDraft {
  if (
    !raw ||
    raw.length > MAX_DRAFT_RAW_BASE64URL_CHARACTERS ||
    !/^[A-Za-z0-9_-]+={0,2}$/.test(raw)
  ) {
    throw new Error("The Gmail raw draft is not a bounded base64url message.");
  }
  const wire = Buffer.from(raw, "base64url").toString("utf8");
  const top = splitHeaderBody(wire, "draft");
  const headers = parseHeaders(top.headers);
  const common = decodedEnvelope(headers);
  const contentType = requiredHeader(headers, "content-type");
  if (/^text\/plain\s*;/i.test(contentType)) {
    return { ...common, body: normalizeLf(top.body) };
  }

  const boundary = multipartBoundaryFromHeader(contentType);
  const parts = splitMultipart(top.body, boundary);
  if (parts.length !== 2) {
    throw new Error("The Gmail draft must contain one text part and one attachment.");
  }
  const text = splitHeaderBody(parts[0], "text part");
  const textHeaders = parseHeaders(text.headers);
  if (
    !/^text\/plain\s*;\s*charset="?UTF-8"?$/i.test(
      requiredHeader(textHeaders, "content-type"),
    ) ||
    requiredHeader(textHeaders, "content-transfer-encoding").toLowerCase() !== "8bit"
  ) {
    throw new Error("The first Gmail MIME part must be UTF-8 plain text.");
  }

  const binary = splitHeaderBody(parts[1], "attachment part");
  const binaryHeaders = parseHeaders(binary.headers);
  const attachmentType = parseAttachmentContentType(
    requiredHeader(binaryHeaders, "content-type"),
  );
  const dispositionFilename = parseAttachmentDisposition(
    requiredHeader(binaryHeaders, "content-disposition"),
    attachmentType.mimeType,
  );
  if (attachmentType.filename !== dispositionFilename) {
    throw new Error("The attachment filename headers do not match.");
  }
  if (
    requiredHeader(binaryHeaders, "content-transfer-encoding").toLowerCase() !== "base64"
  ) {
    throw new Error("The Gmail image attachment must use base64 transfer encoding.");
  }
  const encodedBytes = binary.body.replace(/[\r\n]/g, "");
  if (
    !encodedBytes ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedBytes)
  ) {
    throw new Error("The Gmail image attachment has invalid base64 content.");
  }
  const bytes = new Uint8Array(Buffer.from(encodedBytes, "base64"));
  validateAttachment({
    filename: attachmentType.filename,
    mimeType: attachmentType.mimeType,
    bytes,
  });
  if (Buffer.from(bytes).toString("base64") !== encodedBytes) {
    throw new Error("The Gmail image attachment is not canonical base64.");
  }
  return {
    ...common,
    body: normalizeLf(text.body),
    attachment: {
      filename: attachmentType.filename,
      mimeType: attachmentType.mimeType,
      sizeBytes: bytes.byteLength,
      sha256Checksum: createHash("sha256").update(bytes).digest("hex"),
      bytes,
    },
  };
}

function validateAttachment(input: GmailDraftAttachmentInput): GmailDraftAttachmentInput {
  if (
    !SAFE_ATTACHMENT_FILENAME.test(input.filename) ||
    input.filename.includes("..") ||
    input.filename.includes("/") ||
    input.filename.includes("\\")
  ) {
    throw new Error("The Gmail attachment filename is unsafe.");
  }
  if (!GMAIL_DRAFT_ATTACHMENT_MIME_TYPES.has(input.mimeType)) {
    throw new Error("The Gmail attachment MIME type is not allowed.");
  }
  const extensions = GMAIL_DRAFT_ATTACHMENT_EXTENSIONS[input.mimeType];
  if (
    !extensions?.some((extension) => input.filename.toLowerCase().endsWith(extension))
  ) {
    throw new Error("The Gmail attachment filename does not match its image type.");
  }
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
    throw new Error("The Gmail attachment requires decoded image bytes.");
  }
  if (input.bytes.byteLength > GMAIL_DRAFT_ATTACHMENT_MAX_BYTES) {
    throw new Error("The Gmail attachment exceeds the 5 MiB limit.");
  }
  return {
    filename: input.filename,
    mimeType: input.mimeType,
    bytes: new Uint8Array(input.bytes),
  };
}

function multipartBoundary(
  body: string,
  attachment: GmailDraftAttachmentInput,
  attachmentBase64: string,
): string {
  for (let counter = 0; counter < 100; counter += 1) {
    const hash = createHash("sha256")
      .update(attachment.filename)
      .update("\0")
      .update(attachment.mimeType)
      .update("\0")
      .update(String(attachment.bytes.byteLength))
      .update("\0")
      .update(attachment.bytes)
      .update("\0")
      .update(String(counter))
      .digest("hex")
      .slice(0, 40);
    const candidate = `pmi-renewal-${hash}`;
    if (!body.includes(candidate) && !attachmentBase64.includes(candidate)) {
      return candidate;
    }
  }
  throw new Error("Could not construct a collision-free MIME boundary.");
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function normalizeCrlf(value: string): string {
  return value.replace(/\r\n|\r|\n/g, "\r\n");
}

function normalizeLf(value: string): string {
  return value.replace(/\r\n|\r/g, "\n");
}

function splitHeaderBody(
  value: string,
  label: string,
): { headers: string; body: string } {
  const match = /\r?\n\r?\n/.exec(value);
  if (!match || match.index === undefined) {
    throw new Error(`The Gmail ${label} has no header/body boundary.`);
  }
  return {
    headers: value.slice(0, match.index),
    body: value.slice(match.index + match[0].length),
  };
}

function parseHeaders(value: string): Map<string, string> {
  const unfolded = value.replace(/\r?\n[ \t]+/g, " ");
  const headers = new Map<string, string>();
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error("The Gmail draft contains a malformed header.");
    const name = line.slice(0, separator).trim().toLowerCase();
    const headerValue = line.slice(separator + 1).trim();
    if (!/^[a-z0-9-]+$/.test(name) || !headerValue || headers.has(name)) {
      throw new Error("The Gmail draft contains a duplicate or invalid header.");
    }
    headers.set(name, headerValue);
  }
  return headers;
}

function requiredHeader(headers: Map<string, string>, name: string): string {
  const value = headers.get(name);
  if (!value) throw new Error(`The Gmail draft is missing ${name}.`);
  return value;
}

function decodedEnvelope(
  headers: Map<string, string>,
): Omit<DecodedGmailDraft, "body" | "attachment"> {
  const to = requiredHeader(headers, "to");
  const subject = requiredHeader(headers, "subject");
  const from = headers.get("from");
  const messageId = headers.get("message-id");
  return {
    to,
    cc: (headers.get("cc") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    subject,
    ...(from ? { from } : {}),
    ...(messageId ? { messageId } : {}),
  };
}

function multipartBoundaryFromHeader(contentType: string): string {
  const match =
    /^multipart\/mixed\s*;\s*boundary=(?:"([A-Za-z0-9._-]+)"|([A-Za-z0-9._-]+))$/i.exec(
      contentType,
    );
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary || boundary.length > 120) {
    throw new Error("The Gmail draft is not the expected multipart/mixed shape.");
  }
  return boundary;
}

function splitMultipart(body: string, boundary: string): string[] {
  const normalized = normalizeCrlf(body);
  const marker = `--${boundary}`;
  if (!normalized.startsWith(`${marker}\r\n`)) {
    throw new Error("The Gmail multipart body has an invalid preamble.");
  }
  const closing = `\r\n${marker}--`;
  const closeAt = normalized.indexOf(closing);
  if (closeAt < 0 || normalized.slice(closeAt + closing.length).trim() !== "") {
    throw new Error("The Gmail multipart body has no exact closing boundary.");
  }
  const active = normalized.slice(marker.length + 2, closeAt);
  const separator = `\r\n${marker}\r\n`;
  const parts = active.split(separator);
  if (parts.length !== 2 || parts.some((part) => part.includes(marker))) {
    throw new Error("The Gmail multipart body contains an unexpected part.");
  }
  return parts;
}

function parseAttachmentContentType(value: string): {
  mimeType: string;
  filename: string;
} {
  const match = /^(image\/[a-z0-9.+-]+)\s*;\s*name="([^"]+)"$/i.exec(value);
  if (!match) throw new Error("The Gmail attachment Content-Type is invalid.");
  const mimeType = match[1].toLowerCase();
  const filename = match[2];
  validateAttachment({ filename, mimeType, bytes: new Uint8Array([1]) });
  return { mimeType, filename };
}

function parseAttachmentDisposition(value: string, mimeType: string): string {
  const match = /^attachment\s*;\s*filename="([^"]+)"$/i.exec(value);
  if (!match) throw new Error("The Gmail attachment disposition is invalid.");
  validateAttachment({
    filename: match[1],
    mimeType,
    bytes: new Uint8Array([1]),
  });
  return match[1];
}

function safeHeader(value: string, label: string): string {
  if (!value.trim() || /[\r\n]/.test(value)) {
    throw new Error(`${label} contains an invalid header value.`);
  }
  return value.trim();
}
