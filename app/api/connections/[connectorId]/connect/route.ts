import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/editable";
import { can } from "@/lib/auth/roles";
import { requireCapability } from "@/lib/auth/session";
import { CONNECTORS } from "@/lib/connections/connector-catalog";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import { EditableLayerError } from "@/lib/firestore/errors";

interface RouteContext {
  params: Promise<{ connectorId: string }>;
}

// Admin-only OAuth "begin" for an oauth connector. Shell only: no redirect and no token exchange in
// this slice. It reports honestly what stands between here and a live sign-in. If the connection
// details are not present, it says so; if they are present, it reports that the provider sign-in is
// not built yet. It never creates a connection record.
export async function POST(_request: Request, context: RouteContext) {
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
    if (def.method !== "oauth") {
      throw new EditableLayerError(
        "This connector does not use a sign-in connection.",
        400,
      );
    }

    const presence = readConnectorPresence();
    const configured = def.requiredConfig.every((name) => presence[name]);

    return NextResponse.json({
      connectorId,
      status: configured ? "provider_not_available" : "credentials_not_configured",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
