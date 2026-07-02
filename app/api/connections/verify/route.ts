import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { can } from "@/lib/auth/roles";
import { requireCapability } from "@/lib/auth/session";
import { verifyConnectorNow } from "@/lib/connections/verification";
import { EditableLayerError } from "@/lib/firestore/errors";

const VerifyConnectionInputSchema = z.object({
  connector_id: z.string().min(1),
});

// Admin "Verify connection" (S13 D5): re-runs one connector's read-only live probe fresh and folds
// the verdict into the shared 10-minute cache. Read-only — verifies, never writes; only the boolean
// verdict leaves the server.
export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");
    if (!can(user.role, "manageAdmin")) {
      throw new EditableLayerError(
        "Only an Admin can run a connection verification.",
        403,
      );
    }
    const input = await parseJsonBody(request, VerifyConnectionInputSchema);
    const result = await verifyConnectorNow(input.connector_id);
    if (!result.supported) {
      throw new EditableLayerError(
        "This connection does not have a live check yet.",
        400,
      );
    }

    return NextResponse.json({
      connector_id: input.connector_id,
      verified: result.verified,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
