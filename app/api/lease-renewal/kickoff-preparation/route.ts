import { NextResponse } from "next/server";
import { z } from "zod";

import { POST as marketComps } from "@/app/api/lease-renewal/market-comps/route";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { runKickoffPreparation } from "@/lib/lease-renewal/kickoff-preparation-service";
import { kickoffPreparationDeps } from "@/lib/lease-renewal/kickoff-preparation-runtime";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

// S249 ARCH-S249-3 / ARCH-S249-4: one lease's batch preparation, in the signed-in staff member's
// own request. Its one possible billed effect is the existing comparison lookup, run through the
// market-comps route unchanged (action gate, suspension check, cache, allowance stop, metering),
// at most once per lease and cycle behind a claim. No Gmail draft, send, schedule or provider write
// is created here. "trigger" says whether a staff member chose "Prepare this batch" (staff) or the
// batch opened with the reviewed automatic start on (automatic); the automatic start is refused for
// a verification identity, with the setting off, outside the working batch, at the allowance and
// for a lease and cycle that already hold a claim.

const RequestSchema = z
  .object({
    leaseId: z.string().regex(/^[1-9]\d*$/),
    trigger: z.enum(["staff", "automatic"]),
    operationId: z.string().uuid(),
  })
  .strict();

const STATUS_CODES = {
  verification_identity: 403,
  automatic_start_off: 409,
  outside_working_batch: 409,
  coverage_unconfirmed: 409,
  no_cycle: 409,
  source_unavailable: 503,
} as const;

export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("request_reference_comps"),
      "renewals",
    );
    const input = await parseJsonBody(request, RequestSchema);
    assertMutationAllowed(requireEnvironmentDescriptor());
    const lookup = async (leaseId: string, cycleId: string | null) => {
      const response = await marketComps(
        new Request(new URL("/api/lease-renewal/market-comps", request.url), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ leaseId, capture: { cycleId } }),
        }),
      );
      const payload = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      return {
        ok: response.ok,
        ...(typeof payload.reason === "string" ? { reason: payload.reason } : {}),
        ...(typeof payload.confidence === "string"
          ? { confidence: payload.confidence }
          : {}),
        ...(typeof payload.observationId === "string"
          ? { observationId: payload.observationId }
          : {}),
        ...(typeof payload.cached === "boolean" ? { cached: payload.cached } : {}),
        ...(typeof payload.billed === "boolean" ? { billed: payload.billed } : {}),
        ...(typeof payload.error === "string" ? { error: payload.error } : {}),
        // S249: the route says so when it refused before the provider could be called.
        ...(payload.providerCalled === false ? { providerCalled: false as const } : {}),
      };
    };
    const result = await runKickoffPreparation(
      actor,
      input,
      kickoffPreparationDeps(actor, lookup),
    );
    return NextResponse.json(result, {
      status:
        result.status === "refused" && result.code ? STATUS_CODES[result.code] : 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
