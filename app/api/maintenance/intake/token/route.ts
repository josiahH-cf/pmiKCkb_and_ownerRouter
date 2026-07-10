import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { readIntakeEpoch } from "@/lib/firestore/maintenance-unverified-intake";
import { normalizeIntakePropertyKey } from "@/lib/maintenance/intake-sanitize";
import { INTAKE_TOKEN_MAX_TTL_MS, mintIntakeToken } from "@/lib/maintenance/intake-token";

// Mint a public intake token for a property (edit-gated staff action). Single-use ≤7d by default; a
// reusable link (signage) is allowed up to 30d. The token is stamped with the property's current
// revocation epoch so bumping the epoch later kills every outstanding token. node runtime for the HMAC.

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
const SINGLE_USE_MAX_DAYS = 7;
const REUSABLE_MAX_DAYS = INTAKE_TOKEN_MAX_TTL_MS / DAY_MS; // 30

const MintBodySchema = z.object({
  propertyKey: z.string(),
  ttlDays: z.coerce.number().int().positive().max(REUSABLE_MAX_DAYS).optional(),
  reusable: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    await requireCapabilityInSpace("edit", "maintenance");

    const config = readServerConfig();
    const secret = config.maintenanceIntakeTokenSecret;
    if (!secret) {
      return NextResponse.json(
        { error: "Maintenance intake is not configured (no signing secret)." },
        { status: 503 },
      );
    }

    const input = await parseJsonBody(request, MintBodySchema);
    const propertyKey = normalizeIntakePropertyKey(input.propertyKey);
    if (!propertyKey) {
      return NextResponse.json({ error: "Invalid property key." }, { status: 400 });
    }

    const singleUse = !input.reusable;
    const maxDays = singleUse ? SINGLE_USE_MAX_DAYS : REUSABLE_MAX_DAYS;
    const days = Math.min(input.ttlDays ?? maxDays, maxDays);
    const ttlMs = days * DAY_MS;

    const now = Date.now();
    const epoch = await readIntakeEpoch(propertyKey);
    const token = mintIntakeToken(
      { secret, propertyKey, jti: randomUUID(), epoch, ttlMs, singleUse },
      now,
    );

    return NextResponse.json({
      token,
      propertyKey,
      singleUse,
      expiresAt: new Date(now + ttlMs).toISOString(),
      submitPath: "/api/maintenance/intake/public",
      tokenHeader: "X-Intake-Token",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
