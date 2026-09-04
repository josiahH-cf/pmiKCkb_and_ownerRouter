import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/editable";
import { can } from "@/lib/auth/roles";
import { requireCapability } from "@/lib/auth/session";
import { beginDotloopConnection } from "@/lib/connections/dotloop-connection-service";
import { FirestoreDotloopOAuthStateStore } from "@/lib/firestore/dotloop-oauth-states";
import { EditableLayerError } from "@/lib/firestore/errors";

// S106: begin the Dotloop authorization-code flow. Admin-only. It mints one single-use state
// server-side and returns the documented authorize URL for the browser to follow; it creates no
// connection, holds no token, and never places the client secret in a URL or a response.
export async function POST() {
  try {
    const user = await requireCapability("read");
    if (!can(user.role, "manageAdmin")) {
      throw new EditableLayerError("Only an Admin can connect a system.", 403);
    }
    const result = await beginDotloopConnection({
      actorUid: user.uid,
      nowIso: new Date().toISOString(),
      states: new FirestoreDotloopOAuthStateStore(),
    });
    if (result.status === "credentials_not_configured") {
      return NextResponse.json(
        { status: result.status, missing: result.missing },
        { status: 409 },
      );
    }
    return NextResponse.json({
      status: result.status,
      authorizeUrl: result.authorizeUrl,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
