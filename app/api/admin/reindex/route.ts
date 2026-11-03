import { NextResponse } from "next/server";

import { buildReindexCommand } from "@/lib/admin/reindex-command";
import { readReindexSources } from "@/lib/admin/reindex-sources";
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
export async function GET(request?: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const requests = await listReindexRequests(user);
    const spaceId = request ? new URL(request.url).searchParams.get("spaceId") : null;
    const plan = spaceId ? await preparePlan(user, spaceId) : undefined;
    return NextResponse.json(
      { requests, ...(plan ? { plan } : {}) },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, CreateReindexRequestInputSchema);
    const saved = await createReindexRequest(user, input);

    const plan = await preparePlan(user, saved.spaceId);

    return NextResponse.json({ request: saved, plan });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function preparePlan(
  user: Parameters<typeof readReindexSources>[0],
  spaceId: string,
) {
  const config = readServerConfig();
  const inventory = await readReindexSources(user, spaceId, config);
  return buildReindexCommand({
    spaceId,
    dataStoreId: config.spaceVertexDataStoreIds[spaceId],
    gcpProjectId: config.gcpProjectId,
    vertexSearchLocation: config.vertexSearchLocation,
    ...inventory,
  });
}
