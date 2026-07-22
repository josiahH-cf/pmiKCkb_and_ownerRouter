import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { can } from "@/lib/auth/roles";
import { requireCapability } from "@/lib/auth/session";
import { CONNECTORS } from "@/lib/connections/connector-catalog";
import { resolveConnectorSecretVault } from "@/lib/connections/connector-secret-vault";
import { getConnectorConnectionStore } from "@/lib/firestore/connector-connections";
import { EditableLayerError } from "@/lib/firestore/errors";

interface RouteContext {
  params: Promise<{ connectorId: string }>;
}

const ApiKeyInputSchema = z.object({ api_key: z.string().min(1) });

// Admin-only "Add your API key" for an api_key connector. The key goes straight to the secure vault
// and is NEVER echoed, logged, or persisted here. With no vault wired (today), the vault reports
// not_configured and no connection record is created, so the connector stays honestly "not
// connected". When a real vault is wired, a "connected" record is written referencing only an opaque
// secretRef.
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    if (!can(user.role, "manageAdmin")) {
      throw new EditableLayerError("Only an Admin can connect a system.", 403);
    }

    const { connectorId } = await context.params;
    const def = CONNECTORS.find((connector) => connector.id === connectorId);
    if (!def) {
      throw new EditableLayerError("That connector is not available.", 404);
    }
    if (def.method !== "api_key") {
      throw new EditableLayerError("This connector does not use an API key.", 400);
    }

    const input = await parseJsonBody(request, ApiKeyInputSchema);
    const result = await resolveConnectorSecretVault().storeSecret({
      connectorId,
      secret: input.api_key,
    });

    if (!result.ok) {
      return NextResponse.json({
        connectorId,
        stored: false,
        status: "storage_not_configured",
      });
    }

    const now = new Date().toISOString();
    await getConnectorConnectionStore().saveConnection({
      connectorId,
      method: "api_key",
      status: "connected",
      secretRef: result.secretRef,
      connectedByUid: user.uid,
      connectedAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ connectorId, stored: true, status: "connected" });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
