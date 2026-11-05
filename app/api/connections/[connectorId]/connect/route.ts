import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/editable";
import { can } from "@/lib/auth/roles";
import { requireCapability } from "@/lib/auth/session";
import {
  allowsAppManagedConnection,
  CONNECTORS,
} from "@/lib/connections/connector-catalog";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import { EditableLayerError } from "@/lib/firestore/errors";

interface RouteContext {
  params: Promise<{ connectorId: string }>;
}

// Admin-only OAuth "begin" for an oauth connector without its own connect route (Dotloop has one).
// No redirect and no token exchange: if the connection details are not present it says so, and
// otherwise it reports that the app has no sign-in for this provider. It never creates a
// connection record.
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
    if (!allowsAppManagedConnection(def)) {
      throw new EditableLayerError(
        "This connector is read and verified here, but its server setup is not managed by this API.",
        400,
      );
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
