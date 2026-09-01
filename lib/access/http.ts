import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse } from "@/lib/auth/session";
import { AccessApplyError } from "@/lib/access/apply-service";
import { AccessEligibilityError } from "@/lib/access/directory";
import { AccessRequestError } from "@/lib/access/request-service";

export class AccessTransportError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 413 | 415,
  ) {
    super(message);
    this.name = "AccessTransportError";
  }
}

export async function readStrictAccessJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maximumBytes: number,
): Promise<T> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new AccessTransportError("Content-Type must be application/json.", 415);
  }
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new AccessTransportError("Invalid Content-Length.", 400);
    }
    if (size > maximumBytes) {
      throw new AccessTransportError("Request body is too large.", 413);
    }
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AccessTransportError("Request body is too large.", 413);
      }
      chunks.push(next.value);
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AccessTransportError("Request body must be valid UTF-8 JSON.", 400);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new AccessTransportError("Invalid JSON request body.", 400);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AccessTransportError("Invalid access request body.", 400);
  }
  return parsed.data;
}

export function accessApiErrorResponse(error: unknown) {
  if (
    error instanceof AccessTransportError ||
    error instanceof AccessRequestError ||
    error instanceof AccessApplyError ||
    error instanceof AccessEligibilityError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid access request body." }, { status: 400 });
  }
  try {
    return authErrorResponse(error);
  } catch {
    return NextResponse.json(
      { error: "Access requests are temporarily unavailable." },
      { status: 503 },
    );
  }
}
