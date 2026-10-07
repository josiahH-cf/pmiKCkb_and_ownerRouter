import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { AuthError, requireCapability } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { resolveConnectorSecretVault } from "@/lib/connections/connector-secret-vault";
import {
  LiveDotloopTokenExchanger,
  completeDotloopConnection,
  type CompleteDotloopConnectionResult,
} from "@/lib/connections/dotloop-connection-service";
import {
  dotloopCallbackResultPath,
  type DotloopCallbackResult,
} from "@/lib/connections/dotloop-callback-result";
import {
  dotloopRuntimeTransport,
  refreshDotloopResourceReadiness,
} from "@/lib/connections/dotloop-runtime";
import { FirestoreConnectorConnectionStore } from "@/lib/firestore/connector-connections";
import { FirestoreDotloopOAuthStateStore } from "@/lib/firestore/dotloop-oauth-states";

// S106: the Dotloop authorization callback. Admin-only, server-side only. The single-use state is
// consumed first and must belong to the signed-in Admin who began the flow; the code is exchanged
// server-side; both tokens land in the secret vault as opaque refs; then one bounded account read
// verifies the new generation before anything is called connected. Every outcome, including a
// denial, a forged/replayed state and a storage failure, returns to the Connections screen with a
// safe result name. No token, code, provider body or client secret is returned, logged, or kept in
// the final application URL.
export const dynamic = "force-dynamic";

function resultFor(outcome: CompleteDotloopConnectionResult): DotloopCallbackResult {
  switch (outcome.status) {
    case "connected":
      return "connected";
    case "connected_unverified":
      return "connected_unverified";
    case "invalid_state":
      return "invalid_state";
    case "authorization_denied":
      return "denied";
    case "exchange_failed":
      return "exchange_failed";
    case "secure_storage_unavailable":
      return "storage_unavailable";
    case "credentials_not_configured":
      return "not_configured";
    case "connection_refused":
      return outcome.undestroyedTokenRefs > 0 ? "cleanup_needed" : "refused";
  }
}

function backToConnections(request: Request, result: DotloopCallbackResult) {
  const response = NextResponse.redirect(
    new URL(dotloopCallbackResultPath(result), request.url),
    303,
  );
  // The callback URL carried a one-time code; nothing downstream may cache or forward it.
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  let user: Awaited<ReturnType<typeof requireCapability>>;
  try {
    user = await requireCapability("read");
  } catch (error) {
    // Without the app session the code cannot be bound to an Admin; it is left unused.
    return backToConnections(
      request,
      error instanceof AuthError && error.status === 401
        ? "sign_in_required"
        : "not_permitted",
    );
  }
  if (!can(user.role, "manageAdmin")) return backToConnections(request, "not_permitted");

  const params = new URL(request.url).searchParams;
  const state = params.get("state")?.trim() ?? "";
  const code = params.get("code")?.trim() ?? "";
  const providerError = params.get("error")?.trim() ?? "";
  try {
    const outcome = await completeDotloopConnection({
      state,
      actorUid: user.uid,
      ...(code ? { code } : {}),
      ...(providerError ? { providerError } : {}),
      nowIso: new Date().toISOString(),
      generationId: randomUUID(),
      states: new FirestoreDotloopOAuthStateStore(),
      connections: new FirestoreConnectorConnectionStore(),
      vault: resolveConnectorSecretVault("dotloop"),
      exchanger: new LiveDotloopTokenExchanger({ transport: dotloopRuntimeTransport }),
      verify: async ({ generationId }) => {
        const { observation } = await refreshDotloopResourceReadiness({
          actorUid: user.uid,
          expectedGenerationId: generationId,
        });
        return observation?.account && observation.accountError === null
          ? { ok: true }
          : { ok: false };
      },
    });
    return backToConnections(request, resultFor(outcome));
  } catch {
    // Includes the Live-read-only refusal; no outcome detail or provider body is carried.
    return backToConnections(request, "failed");
  }
}
