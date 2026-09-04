import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/editable";
import { can } from "@/lib/auth/roles";
import { requireCapability } from "@/lib/auth/session";
import { resolveConnectorSecretVault } from "@/lib/connections/connector-secret-vault";
import {
  LiveDotloopTokenExchanger,
  completeDotloopConnection,
} from "@/lib/connections/dotloop-connection-service";
import { FirestoreConnectorConnectionStore } from "@/lib/firestore/connector-connections";
import { FirestoreDotloopOAuthStateStore } from "@/lib/firestore/dotloop-oauth-states";
import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  DotloopHttpRequest,
  DotloopHttpResponse,
} from "@/lib/integrations/dotloop/client";

// S106: the Dotloop authorization callback. Admin-only, server-side only. The single-use state is
// consumed first, the code is exchanged server-side, and both tokens land in the secret vault as
// opaque refs. No token, provider body, or client secret is returned to the browser or logged; a
// denial, callback error, forged state, or unconfigured vault ends with no connection record.
export const dynamic = "force-dynamic";

/** The one outbound seam this route needs. It carries no credential of its own. */
const httpTransport = {
  async fetch(request: DotloopHttpRequest): Promise<DotloopHttpResponse> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return {
      status: response.status,
      headers,
      json: async () => response.json().catch(() => ({})),
    };
  },
};

export async function GET(request: Request) {
  try {
    const user = await requireCapability("read");
    if (!can(user.role, "manageAdmin")) {
      throw new EditableLayerError("Only an Admin can connect a system.", 403);
    }
    const params = new URL(request.url).searchParams;
    const state = params.get("state")?.trim() ?? "";
    const code = params.get("code")?.trim() ?? "";
    const providerError = params.get("error")?.trim() ?? "";

    const result = await completeDotloopConnection({
      state,
      ...(code ? { code } : {}),
      ...(providerError ? { providerError } : {}),
      nowIso: new Date().toISOString(),
      generationId: randomUUID(),
      states: new FirestoreDotloopOAuthStateStore(),
      connections: new FirestoreConnectorConnectionStore(),
      vault: resolveConnectorSecretVault(),
      exchanger: new LiveDotloopTokenExchanger({ transport: httpTransport }),
    });

    const status =
      result.status === "connected" ? 200 : result.status === "invalid_state" ? 400 : 409;
    return NextResponse.json({ status: result.status }, { status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
