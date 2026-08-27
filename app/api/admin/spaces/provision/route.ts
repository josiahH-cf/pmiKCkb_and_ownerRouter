import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildAuthorizedSpaceProvisioningPreview,
  provisionFixedSpacePilot,
  retireFixedSpacePilot,
  SpaceProvisioningPilotPacketSchema,
} from "@/lib/admin/space-provisioning-pilot";
import { createDiscoveryEngineSpaceProvisioningProvider } from "@/lib/admin/space-provisioning-provider";
import { buildSpaceProvisioningPlan } from "@/lib/admin/space-request-commands";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { FirestoreSpaceProvisioningLedger } from "@/lib/firestore/space-provisioning-ledger";
import { getSpaceRequest } from "@/lib/firestore/space-requests";

const ExecuteSpacePilotSchema = z
  .object({
    operation: z.enum(["provision", "retire"]),
    pilotPacket: SpaceProvisioningPilotPacketSchema,
    attemptKey: z.string().uuid(),
    confirmation: z.string().max(200),
  })
  .strict();

/** Admin-only execution seam. Production remains inert while SPACE_PROVISIONING_ENABLED is false. */
export async function POST(request: Request) {
  try {
    const actor = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, ExecuteSpacePilotSchema);
    const saved = await getSpaceRequest(actor, input.pilotPacket.requestId);
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
    const preview = buildAuthorizedSpaceProvisioningPreview(plan, input.pilotPacket);
    const common = {
      actor,
      preview,
      confirmation: input.confirmation,
      attemptKey: input.attemptKey,
      provisioningEnabled: config.spaceProvisioningEnabled,
      provider: createDiscoveryEngineSpaceProvisioningProvider(),
      ledger: new FirestoreSpaceProvisioningLedger(),
    };
    const receipt =
      input.operation === "provision"
        ? await provisionFixedSpacePilot(common)
        : await retireFixedSpacePilot(common);
    return NextResponse.json({ receipt });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
