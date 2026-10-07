import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/editable";
import { can } from "@/lib/auth/roles";
import { requireCapability } from "@/lib/auth/session";
import { projectDotloopPicker } from "@/lib/connections/dotloop-resource-selection";
import { refreshDotloopResourceReadiness } from "@/lib/connections/dotloop-runtime";
import { FirestoreConnectorConnectionStore } from "@/lib/firestore/connector-connections";
import { FirestoreDotloopObservationStore } from "@/lib/firestore/dotloop-connection-observations";
import { EditableLayerError } from "@/lib/firestore/errors";

// S106 (AC-S106-6/9): the Admin's view of the cached Dotloop resource observation (GET) and the
// explicit bounded refresh that replaces it (POST). Ordinary page renders never call the provider;
// only this refresh, the post-consent verification and provider-write admission do. Responses carry
// ids, names, types and freshness only: never a token, code or provider body. Provider data shown
// here is operational and never an AI input.
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await requireCapability("read");
  if (!can(user.role, "manageAdmin")) {
    throw new EditableLayerError("Only an Admin can manage Dotloop resources.", 403);
  }
  return user;
}

export async function GET() {
  try {
    await requireAdmin();
    const [connection, observation] = await Promise.all([
      new FirestoreConnectorConnectionStore().getConnection("dotloop"),
      new FirestoreDotloopObservationStore().read(),
    ]);
    const generationId =
      connection?.status === "connected" ? (connection.generationId ?? null) : null;
    return NextResponse.json({
      picker: observation
        ? projectDotloopPicker(observation, generationId, new Date().toISOString())
        : null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST() {
  try {
    const user = await requireAdmin();
    const { readiness, observation } = await refreshDotloopResourceReadiness({
      actorUid: user.uid,
    });
    const connection = await new FirestoreConnectorConnectionStore().getConnection(
      "dotloop",
    );
    const generationId =
      connection?.status === "connected" ? (connection.generationId ?? null) : null;
    return NextResponse.json({
      readiness,
      refreshed: observation !== null,
      picker: observation
        ? projectDotloopPicker(observation, generationId, new Date().toISOString())
        : null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
