import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/editable";
import { can } from "@/lib/auth/roles";
import { requireCapability } from "@/lib/auth/session";
import { resolveConnectorSecretVault } from "@/lib/connections/connector-secret-vault";
import { getConnectorConnectionStore } from "@/lib/firestore/connector-connections";
import { EditableLayerError } from "@/lib/firestore/errors";

interface RouteContext {
  params: Promise<{ connectorId: string }>;
}

// Admin-only disconnect. Idempotent: if a connection record exists, its secret is destroyed in the
// vault and the record is deleted; if none exists, it reports disconnected:false without error.
export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    if (!can(user.role, "manageAdmin")) {
      throw new EditableLayerError("Only an Admin can disconnect a system.", 403);
    }

    const { connectorId } = await context.params;
    const store = getConnectorConnectionStore();
    const record = await store.getConnection(connectorId);

    if (!record) {
      return NextResponse.json({ connectorId, disconnected: false });
    }

    await resolveConnectorSecretVault().destroySecret(record.secretRef);
    await store.deleteConnection(connectorId);

    return NextResponse.json({ connectorId, disconnected: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
