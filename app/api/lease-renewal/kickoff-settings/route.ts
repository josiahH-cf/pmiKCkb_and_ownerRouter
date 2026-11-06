import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability, requireCapabilityInSpace } from "@/lib/auth/session";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import {
  readKickoffAutomaticStart,
  saveKickoffAutomaticStart,
} from "@/lib/firestore/renewal-kickoff-settings";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

// S249 ARCH-S249-4: the one reviewed setting for the automatic start of batch preparation. Staff
// read it; an Admin changes it in the app, bound to the version shown, with a reason. Changing it
// needs no release and no environment key.

const SaveSchema = z
  .object({
    enabled: z.boolean(),
    expectedVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    await requireCapabilityInSpace(renewalRoleCapability("read_workspace"), "renewals");
    return NextResponse.json(await readKickoffAutomaticStart(), { headers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, SaveSchema);
    assertMutationAllowed(requireEnvironmentDescriptor());
    return NextResponse.json(await saveKickoffAutomaticStart(actor, input), { headers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
