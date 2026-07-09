import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { readServerConfig } from "@/lib/config/server";
import { extractClientIp, hashClientIp } from "@/lib/maintenance/intake-client-ip";
import { IntakeRateLimiter } from "@/lib/maintenance/intake-rate-limit";
import { verifyIntakeToken } from "@/lib/maintenance/intake-token";
import {
  createUnverifiedIntakeFromPublic,
  IntakeDailyCapError,
  IntakeReplayError,
  IntakeRevokedError,
  IntakeValidationError,
} from "@/lib/firestore/maintenance-unverified-intake";

// The ONE unauthenticated write endpoint in the app: a tenant/vendor with a staff-minted, HMAC-signed
// token can submit ONE maintenance report without signing in. It writes only to the UNVERIFIED
// quarantine collection (never a real ticket, never a system of record) and is layered:
//   secret present (else 503, fail closed) -> token in header -> in-instance IP rate pre-gate (before
//   any HMAC) -> verify token -> stream body under a hard 16KB cap -> shape-validate -> writer
//   transaction (nonce single-use + per-property daily cap + revocation epoch) -> 202 with a fresh
//   random reference (never the doc id or jti).
// Every failure returns a GENERIC body (no error_type / timing oracle). node runtime for node:crypto.

export const runtime = "nodejs";

// 16 KB is ample for summary + description + contact; anything larger is a probe. The token rides a
// header (not the body) so verification happens before the body is ever read.
const MAX_BODY_BYTES = 16 * 1024;
const INTAKE_TOKEN_HEADER = "x-intake-token";

// One limiter per warm instance (best-effort burst control; the authoritative cap is the per-property
// daily counter in the writer). Module-level so it survives across requests on the same instance.
const rateLimiter = new IntakeRateLimiter();

const PublicIntakeBodySchema = z.object({
  summary: z.string(),
  description: z.string().optional(),
  contact: z.string().optional(),
});

function generic(status: number, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ error: message }, { status, headers });
}

async function readBoundedText(
  request: Request,
  maxBytes: number,
): Promise<{ kind: "text"; text: string } | { kind: "empty" } | { kind: "too_large" }> {
  const body = request.body;
  if (!body) return { kind: "empty" };
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > maxBytes) {
          await reader.cancel();
          return { kind: "too_large" };
        }
        chunks.push(Buffer.from(value));
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (received === 0) return { kind: "empty" };
  return { kind: "text", text: Buffer.concat(chunks).toString("utf8") };
}

export async function POST(request: Request) {
  const now = Date.now();
  const config = readServerConfig();

  // Fail CLOSED until the owner provisions the signing secret (there is no dev fallback secret).
  const secret = config.maintenanceIntakeTokenSecret;
  if (!secret) {
    return generic(503, "Maintenance intake is not available.");
  }

  const token = request.headers.get(INTAKE_TOKEN_HEADER);
  if (!token) {
    return generic(401, "Invalid or missing intake token.");
  }

  // In-instance pre-gate BEFORE any HMAC work. Key on the salted IP hash (rightmost XFF hop, least
  // forgeable), falling back to a single global bucket when no IP/salt is available.
  const ipHash = hashClientIp(
    extractClientIp(request.headers),
    config.maintenanceIntakeIpHashSalt,
  );
  const preGate = rateLimiter.check(ipHash ?? "global", now);
  if (!preGate.allowed) {
    return generic(429, "Too many requests. Please try again later.", {
      "retry-after": String(Math.ceil(preGate.retryAfterMs / 1000)),
    });
  }

  const verified = verifyIntakeToken(secret, token, now);
  if (!verified.ok) {
    return generic(401, "Invalid or missing intake token.");
  }

  const body = await readBoundedText(request, MAX_BODY_BYTES);
  if (body.kind === "too_large") {
    return generic(413, "Request too large.");
  }
  if (body.kind === "empty") {
    return generic(400, "Invalid submission.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body.text);
  } catch {
    return generic(400, "Invalid submission.");
  }
  const shape = PublicIntakeBodySchema.safeParse(parsedJson);
  if (!shape.success) {
    return generic(400, "Invalid submission.");
  }

  try {
    await createUnverifiedIntakeFromPublic(
      {
        propertyKey: verified.payload.propertyKey,
        jti: verified.payload.jti,
        tokenEpoch: verified.payload.epoch,
        singleUse: verified.payload.singleUse,
        summary: shape.data.summary,
        description: shape.data.description,
        contact: shape.data.contact,
        ipHash,
        dailyCap: config.maintenanceIntakeDailyCap,
      },
      undefined,
      now,
    );
  } catch (error) {
    if (error instanceof IntakeReplayError) {
      return generic(409, "This intake link has already been used.");
    }
    if (error instanceof IntakeRevokedError) {
      // Same generic body as an invalid token — do not reveal that the link was specifically revoked.
      return generic(401, "Invalid or missing intake token.");
    }
    if (error instanceof IntakeDailyCapError) {
      return generic(503, "This property has reached its intake limit for today.");
    }
    if (error instanceof IntakeValidationError) {
      return generic(400, "Invalid submission.");
    }
    throw error;
  }

  // 202 Accepted with a fresh random reference — NOT the intake doc id or the token jti — so the caller
  // gets a confirmation code that reveals nothing about internal identifiers.
  return NextResponse.json(
    { status: "received", reference: randomUUID() },
    { status: 202 },
  );
}
