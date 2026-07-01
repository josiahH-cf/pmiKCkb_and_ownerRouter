import { NextResponse } from "next/server";

import {
  APP_STATE_QUERIES,
  resolveAppState,
  type AppStateQuery,
} from "@/lib/ask/app-state-context";
import { authErrorResponse, requireCapability } from "@/lib/auth/session";

// Read-only app-state for the Console (S10). Reports the operator's approvals / connection gaps /
// Space coverage as advisory, deep-linked state — read-gated, and it never executes anything.
export async function GET(request: Request) {
  let user;
  try {
    user = await requireCapability("read");
  } catch (error) {
    return authErrorResponse(error);
  }

  const query = new URL(request.url).searchParams.get("query");
  if (!query || !APP_STATE_QUERIES.includes(query as AppStateQuery)) {
    return NextResponse.json({ error: "Unknown app-state query." }, { status: 400 });
  }

  const result = await resolveAppState(user, query as AppStateQuery);
  return NextResponse.json(result);
}
