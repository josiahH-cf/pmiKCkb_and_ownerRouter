import {
  GMAIL_RUNTIME_LIMITS,
  type GmailApiHeader,
  type GmailApiMessage,
  type GmailApiMessagePart,
  type GmailAttachmentMetadata,
  type GmailMessageView,
  type GmailThreadView,
} from "@/lib/gmail-runtime/types";

export class GmailPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailPayloadError";
  }
}

interface ParsedPart {
  plain: string[];
  html: string[];
  attachments: GmailAttachmentMetadata[];
  visited: number;
}

export function parseGmailThread(input: unknown): GmailThreadView {
  if (!isRecord(input)) throw new GmailPayloadError("Gmail returned an invalid thread.");
  const id = requiredString(input.id, "thread id");
  const rawMessages = Array.isArray(input.messages) ? input.messages : [];
  const selected = rawMessages.slice(0, GMAIL_RUNTIME_LIMITS.maxThreadMessages);
  let remaining: number = GMAIL_RUNTIME_LIMITS.maxThreadBodyCharacters;
  let threadBodyTruncated = false;

  const messages = selected.map((message) => {
    const parsed = parseGmailMessage(message);
    if (parsed.bodyText.length > remaining) {
      parsed.bodyText = parsed.bodyText.slice(0, Math.max(0, remaining));
      parsed.bodyTruncated = true;
      threadBodyTruncated = true;
    }
    remaining = Math.max(0, remaining - parsed.bodyText.length);
    return parsed;
  });

  return {
    id,
    ...(optionalString(input.historyId)
      ? { historyId: optionalString(input.historyId) }
      : {}),
    messages,
    truncated:
      rawMessages.length > selected.length ||
      threadBodyTruncated ||
      messages.some((message) => message.bodyTruncated),
  };
}

export function parseGmailMessage(input: unknown): GmailMessageView {
  if (!isRecord(input)) throw new GmailPayloadError("Gmail returned an invalid message.");
  const message = input as GmailApiMessage;
  const payload = isRecord(message.payload)
    ? (message.payload as GmailApiMessagePart)
    : {};
  const headers = readHeaders(payload.headers);
  const parts = parsePart(payload);
  const plain = parts.plain.find((value) => value.trim());
  const html = parts.html.find((value) => value.trim());
  const safeBody = plain ?? (html ? htmlToSafeText(html) : "");
  const bodyText = safeBody.slice(0, GMAIL_RUNTIME_LIMITS.maxBodyCharacters);

  return {
    id: requiredString(message.id, "message id"),
    threadId: requiredString(message.threadId, "message thread id"),
    labelIds: stringArray(message.labelIds),
    ...(optionalString(message.internalDate)
      ? { internalDate: optionalString(message.internalDate) }
      : {}),
    from: header(headers, "from"),
    to: splitAddressHeader(header(headers, "to")),
    cc: splitAddressHeader(header(headers, "cc")),
    bcc: splitAddressHeader(header(headers, "bcc")),
    subject: header(headers, "subject"),
    date: header(headers, "date"),
    messageId: header(headers, "message-id"),
    ...(header(headers, "in-reply-to")
      ? { inReplyTo: header(headers, "in-reply-to") }
      : {}),
    references: splitReferences(header(headers, "references")),
    bodyText,
    bodyTruncated:
      safeBody.length > bodyText.length ||
      parts.visited >= GMAIL_RUNTIME_LIMITS.maxMimeParts,
    attachments: parts.attachments.slice(0, GMAIL_RUNTIME_LIMITS.maxAttachments),
  };
}

export function htmlToSafeText(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(
        /<(script|style|template|svg|iframe|object|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
        " ",
      )
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parsePart(root: GmailApiMessagePart): ParsedPart {
  const out: ParsedPart = { plain: [], html: [], attachments: [], visited: 0 };
  const queue: GmailApiMessagePart[] = [root];

  while (queue.length > 0 && out.visited < GMAIL_RUNTIME_LIMITS.maxMimeParts) {
    const part = queue.shift()!;
    out.visited += 1;
    const mimeType = optionalString(part.mimeType)?.toLowerCase() ?? "";
    const filename = optionalString(part.filename) ?? "";
    const body = isRecord(part.body) ? part.body : {};
    const attachmentId = optionalString(body.attachmentId);

    if (filename || attachmentId) {
      if (out.attachments.length < GMAIL_RUNTIME_LIMITS.maxAttachments) {
        out.attachments.push({
          filename: filename || "attachment",
          mimeType: mimeType || "application/octet-stream",
          size: finiteNumber(body.size),
        });
      }
    } else {
      const data = optionalString(body.data);
      if (data && mimeType === "text/plain") out.plain.push(decodeBase64Url(data));
      if (data && mimeType === "text/html") out.html.push(decodeBase64Url(data));
    }

    if (Array.isArray(part.parts)) {
      for (const child of part.parts) {
        if (isRecord(child)) queue.push(child as GmailApiMessagePart);
      }
    }
  }
  return out;
}

function readHeaders(value: unknown): Map<string, string> {
  const headers = new Map<string, string>();
  if (!Array.isArray(value)) return headers;
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const item = raw as GmailApiHeader;
    const name = optionalString(item.name)?.toLowerCase();
    const headerValue = optionalString(item.value);
    if (name && headerValue && !headers.has(name)) headers.set(name, headerValue);
  }
  return headers;
}

function header(headers: Map<string, string>, name: string): string {
  return headers.get(name) ?? "";
}

function splitAddressHeader(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function splitReferences(value: string): string[] {
  return (value.match(/<[^<>\r\n]+>/g) ?? []).slice(-20);
}

function decodeBase64Url(value: string): string {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, key: string) => {
    const lower = key.toLowerCase();
    if (lower.startsWith("#x")) return safeCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return safeCodePoint(Number.parseInt(lower.slice(1), 10));
    return named[lower] ?? entity;
  });
}

function safeCodePoint(value: number): string {
  return Number.isInteger(value) && value > 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : "";
}

function requiredString(value: unknown, label: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new GmailPayloadError(`Gmail returned no ${label}.`);
  return parsed;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 100)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
