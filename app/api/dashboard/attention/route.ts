import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import {
  ATTENTION_REREAD_LEASE_WAIT_MS,
  gatherAttentionQueue,
} from "@/lib/attention/attention-queue";
import { requireCapability } from "@/lib/auth/session";

// S147: GET the signed-in user's compact Dashboard attention queue. The Dashboard renders the first
// read on the server and calls this only to refresh after an inline Approve or a failed read. It is
// a read: the same per-feed gather, the user's own scopes, value-free rows, no external call. As a
// person's explicit re-read it waits, bounded, for a lease read already in flight, so Try again
// shows the refreshed source instead of repeating the stale answer it replaces.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCapability("read");
    return NextResponse.json(
      await gatherAttentionQueue(user, undefined, {
        awaitLeaseRefreshMs: ATTENTION_REREAD_LEASE_WAIT_MS,
      }),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
