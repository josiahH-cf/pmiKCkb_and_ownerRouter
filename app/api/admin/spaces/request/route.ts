import { NextResponse } from "next/server";

import { buildSpaceProvisioningPlan } from "@/lib/admin/space-request-commands";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import {
  CreateSpaceRequestInputSchema,
  createSpaceRequest,
  listSpaceRequests,
} from "@/lib/firestore/space-requests";

// Admin-only "request a new Space" intake (Slice 7, D12). POST records the request and returns the
// auto-generated owner provisioning commands + .env.local lines. GET lists prior requests. This route
// provisions NOTHING (no live Vertex call) — it only records intent and prints commands for the owner.

export async function GET() {
  try {
    const user = await requireCapability("manageAdmin");
    const requests = await listSpaceRequests(user);
    return NextResponse.json({ requests });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, CreateSpaceRequestInputSchema);
    const saved = await createSpaceRequest(user, input);

    const config = readServerConfig();
    const plan = buildSpaceProvisioningPlan({
      name: saved.name,
      scope: saved.scope,
      intendedSources: saved.intendedSources,
      gcpProjectId: config.gcpProjectId,
      vertexSearchLocation: config.vertexSearchLocation,
      existingVertexDataStoreIds: config.spaceVertexDataStoreIds,
      existingDriveFolderIds: config.spaceDriveFolderIds,
    });

    return NextResponse.json({ request: saved, plan });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
