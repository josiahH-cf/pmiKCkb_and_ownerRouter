import { createHash } from "node:crypto";
import type { GmailOutgoingMessage } from "./types";
export interface WorkflowMimeAttachment {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  sha256: string;
}
export interface WorkflowMimeMessage extends GmailOutgoingMessage {
  htmlBody: string;
  attachments: WorkflowMimeAttachment[];
  verifyThreading?: boolean;
}
export const WORKFLOW_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const WORKFLOW_ATTACHMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
function header(s: string) {
  if (/[\r\n\x00-\x1f\x7f]/.test(s) || s.length > 998)
    throw new Error("Unsafe message header.");
  return s;
}
/** RFC 2047 encoded words are at most 75 characters and never split a UTF-8 code point. */
function encodedSubject(subject: string) {
  const chunks: string[] = [];
  let chunk = "";
  for (const point of header(subject)) {
    if (Buffer.byteLength(chunk + point, "utf8") > 42) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += point;
  }
  chunks.push(chunk);
  return chunks
    .map((value) => `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`)
    .join("\r\n ");
}
function b64(bytes: Uint8Array) {
  return (
    Buffer.from(bytes)
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? ""
  );
}
export function validateWorkflowAttachment(a: WorkflowMimeAttachment): void {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/.test(a.filename) ||
    a.filename.includes("..")
  )
    throw new Error("Use a filename without paths or control characters.");
  if (
    !a.bytes.length ||
    a.bytes.length > WORKFLOW_ATTACHMENT_MAX_BYTES ||
    createHash("sha256").update(a.bytes).digest("hex") !== a.sha256
  )
    throw new Error("Attachment bytes do not match the reviewed file.");
  const b = Buffer.from(a.bytes);
  const valid =
    a.mimeType === "application/pdf"
      ? b.subarray(0, 5).toString() === "%PDF-" &&
        !/\/(?:JavaScript|JS|Launch|EmbeddedFile)\b/.test(b.toString("latin1")) &&
        /\.pdf$/i.test(a.filename)
      : a.mimeType === "image/jpeg"
        ? b[0] === 255 && b[1] === 216 && b[2] === 255 && /\.jpe?g$/i.test(a.filename)
        : a.mimeType === "image/png"
          ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
            /\.png$/i.test(a.filename)
          : a.mimeType === "image/webp"
            ? b.subarray(0, 4).toString() === "RIFF" &&
              b.subarray(8, 12).toString() === "WEBP" &&
              /\.webp$/i.test(a.filename)
            : false;
  if (!valid)
    throw new Error(
      "Unsupported or mismatched attachment. Use a passive PDF, JPEG, PNG or WebP.",
    );
}
/** Exact plain/HTML alternatives and byte-checked attachments share deterministic MIME boundaries. */
export function encodeWorkflowMime(m: WorkflowMimeMessage): string {
  if (
    m.attachments.length > 10 ||
    m.attachments.reduce((sum, a) => sum + a.bytes.length, 0) >
      WORKFLOW_ATTACHMENT_MAX_BYTES
  )
    throw new Error("Attachments exceed the combined 5 MiB limit.");
  m.attachments.forEach(validateWorkflowAttachment);
  const key = createHash("sha256").update(m.messageId).digest("hex").slice(0, 32);
  const mixed = `pmi-mixed-${key}`,
    alternative = `pmi-alt-${key}`;
  const lines = [
    `From: ${header(m.from)}`,
    `Reply-To: ${header(m.from)}`,
    `To: ${m.to.map(header).join(", ")}`,
    ...(m.cc.length ? [`Cc: ${m.cc.map(header).join(", ")}`] : []),
    ...(m.bcc.length ? [`Bcc: ${m.bcc.map(header).join(", ")}`] : []),
    `Subject: ${encodedSubject(m.subject)}`,
    `Message-ID: ${header(m.messageId)}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${header(m.inReplyTo)}`] : []),
    ...(m.references.length ? [`References: ${m.references.map(header).join(" ")}`] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    "",
  ];
  for (const [type, text] of [
    ["text/plain", m.body],
    ["text/html", m.htmlBody],
  ])
    lines.push(
      `--${alternative}`,
      `Content-Type: ${type}; charset="UTF-8"`,
      "Content-Transfer-Encoding: base64",
      "",
      b64(Buffer.from(text, "utf8")),
    );
  lines.push(`--${alternative}--`);
  for (const a of m.attachments)
    lines.push(
      `--${mixed}`,
      `Content-Type: ${a.mimeType}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      b64(a.bytes),
    );
  lines.push(`--${mixed}--`, "");
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

/** Compare only our deterministic MIME shape; provider-added transit headers do not change it. */
export function verifyWorkflowMimeReadback(raw: string, expected: WorkflowMimeMessage) {
  if (!raw || raw.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9_-]+={0,2}$/.test(raw))
    throw new Error("The send readback is not bounded raw MIME.");
  const split = (wire: string) => {
    const m = /\r?\n\r?\n/.exec(wire);
    if (!m || m.index === undefined)
      throw new Error("The send readback has no MIME boundary.");
    return {
      headers: wire.slice(0, m.index),
      body: wire
        .slice(m.index + m[0].length)
        .replace(/\r\n|\r/g, "\n")
        .trimEnd(),
    };
  };
  const actual = split(Buffer.from(raw, "base64url").toString("utf8")),
    wanted = split(
      Buffer.from(encodeWorkflowMime(expected), "base64url").toString("utf8"),
    );
  const critical = new Set([
    "from",
    "reply-to",
    "to",
    "cc",
    "bcc",
    "subject",
    "message-id",
    "mime-version",
    "content-type",
  ]);
  if (expected.verifyThreading) {
    critical.add("in-reply-to");
    critical.add("references");
  }
  const read = (value: string) => {
    const headers = new Map<string, string>();
    for (const line of value.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i < 1) throw new Error("The send readback has a malformed header.");
      const name = line.slice(0, i).toLowerCase();
      if (critical.has(name)) {
        if (headers.has(name))
          throw new Error("The send readback repeats an envelope header.");
        headers.set(name, line.slice(i + 1).trim());
      }
    }
    return headers;
  };
  const received = read(actual.headers),
    sent = read(wanted.headers);
  if (
    [...critical].some((name) => (received.get(name) ?? "") !== (sent.get(name) ?? "")) ||
    actual.body !== wanted.body
  )
    throw new Error(
      "The exact send readback envelope, rich body or attachment bytes did not match.",
    );
}
