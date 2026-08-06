import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import {
  getLiveLeaseSnapshot,
  invalidateLiveLeaseCache,
} from "@/lib/lease-renewal/live-lease-cache";

// S58: demand-driven refresh of the shared live lease read. `revalidate` re-enters the cache's age
// contract (a fresh snapshot makes no provider call); `force` bypasses the TTL via invalidation and
// is rate-limited PER OPERATOR so a held-down click performs exactly one provider read inside the
// window. Read-only: this route composes nothing, records nothing, and writes to no system of record.

const RefreshBodySchema = z.object({ mode: z.enum(["force", "revalidate"]) }).strict();

export const FORCE_REFRESH_WINDOW_MS = 10_000;

const lastForceByUid = new Map<string, number>();

/** Test-only reset for the per-operator force window. */
export function resetRefreshRateLimitForTests(): void {
  lastForceByUid.clear();
}

export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "renewals");
    const body = await parseJsonBody(request, RefreshBodySchema);

    const config = buildLiveRentVineConfig();
    if (!config.ok) {
      return NextResponse.json(
        {
          error:
            config.reason === "account_mismatch"
              ? "The configured RentVine account is not the expected pmikcmetro tenant."
              : "Live RentVine is not configured; there is no live lease read to refresh.",
        },
        { status: 503 },
      );
    }

    const nowMs = Date.now();
    if (body.mode === "force") {
      const last = lastForceByUid.get(user.uid);
      if (last !== undefined && nowMs - last < FORCE_REFRESH_WINDOW_MS) {
        // Inside the window the earlier forced read stands; no second provider read.
        return NextResponse.json({ refreshed: false, throttled: true });
      }
      lastForceByUid.set(user.uid, nowMs);
      invalidateLiveLeaseCache();
    }

    const { currency } = await getLiveLeaseSnapshot(config.rentvineClient, nowMs);
    return NextResponse.json({
      refreshed: true,
      throttled: false,
      state: currency.state,
      readAtIso: new Date(currency.readAtMs).toISOString(),
      lastError: currency.lastError,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
