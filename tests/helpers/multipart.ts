// Test helper: a byte-level multipart/form-data parser, used as the local transport recorder that
// proves the exact file bytes a provider would receive (S34 AC-S34-6). It never decodes the file
// part as text, so any re-encoding of bytes above 0x7f or of zero bytes is detected.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function indexOf(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

export interface MultipartPart {
  readonly headers: Record<string, string>;
  readonly name: string | null;
  readonly fileName: string | null;
  readonly data: Uint8Array;
}

export function boundaryFromContentType(contentType: string | undefined): string | null {
  const match = /boundary=([^;]+)/i.exec(contentType ?? "");
  return match ? match[1].trim().replace(/^"|"$/g, "") : null;
}

/** Parse a complete multipart body; throws when the framing is not exact. */
export function parseMultipart(body: Uint8Array, boundary: string): MultipartPart[] {
  const delimiter = encoder.encode(`--${boundary}`);
  const crlf = encoder.encode("\r\n");
  const headerEnd = encoder.encode("\r\n\r\n");
  if (indexOf(body, delimiter) !== 0)
    throw new Error("multipart body must open with its boundary");
  const parts: MultipartPart[] = [];
  let cursor = delimiter.length;
  for (;;) {
    // After a delimiter: "--" closes the body, CRLF opens the next part.
    if (body[cursor] === 45 && body[cursor + 1] === 45) {
      const rest = body.slice(cursor + 2);
      if (rest.length !== 2 || rest[0] !== 13 || rest[1] !== 10)
        throw new Error("multipart body must end with exactly one CRLF after its close");
      return parts;
    }
    if (body[cursor] !== crlf[0] || body[cursor + 1] !== crlf[1])
      throw new Error("multipart delimiter must be followed by CRLF");
    const headersStart = cursor + 2;
    const headersEnd = indexOf(body, headerEnd, headersStart);
    if (headersEnd === -1) throw new Error("multipart part headers are not terminated");
    const headers: Record<string, string> = {};
    for (const line of decoder
      .decode(body.slice(headersStart, headersEnd))
      .split("\r\n")) {
      const colon = line.indexOf(":");
      if (colon > 0)
        headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
    const dataStart = headersEnd + headerEnd.length;
    const next = indexOf(body, encoder.encode(`\r\n--${boundary}`), dataStart);
    if (next === -1) throw new Error("multipart part data is not terminated");
    const disposition = headers["content-disposition"] ?? "";
    parts.push({
      headers,
      name: /\bname="([^"]*)"/.exec(disposition)?.[1] ?? null,
      fileName: /\bfilename="([^"]*)"/i.exec(disposition)?.[1] ?? null,
      data: body.slice(dataStart, next),
    });
    cursor = next + 2 + delimiter.length;
  }
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}
