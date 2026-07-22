import { NextResponse } from "next/server";

import { buildReindexCommand } from "@/lib/admin/reindex-command";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import {
  CreateReindexRequestInputSchema,
  createReindexRequest,
  listReindexRequests,
} from "@/lib/firestore/reindex-requests";

// Admin-only "re-index sources" control (Slice 8, D14). Vertex ingestion is cost-bearing and CLI-only,
// so this route INGESTS NOTHING: POST refuses without confirm:true, records the confirmed request, and
// returns the exact owner command to run. Running it is an explicit owner action.
export async function GET() {
  try {
    const user = await requireCapability("manageAdmin");
    const requests = await listReindexRequests(user);
    return NextResponse.json({ requests });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, CreateReindexRequestInputSchema);
    const saved = await createReindexRequest(user, input);

    const config = readServerConfig();
    const plan = buildReindexCommand({
      spaceId: saved.spaceId,
      dataStoreId: config.spaceVertexDataStoreIds[saved.spaceId],
      gcpProjectId: config.gcpProjectId,
      vertexSearchLocation: config.vertexSearchLocation,
    });

    return NextResponse.json({ request: saved, plan });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
