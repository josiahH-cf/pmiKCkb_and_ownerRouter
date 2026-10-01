import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { gatherAttentionQueue } from "@/lib/attention/attention-queue";
import { requireCapability } from "@/lib/auth/session";

// S147: GET the signed-in user's compact Dashboard attention queue. The Dashboard renders the first
// read on the server and calls this only to refresh after an inline Approve or a failed read. It is
// a read: the same per-feed gather, the user's own scopes, value-free rows, no external call.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCapability("read");
    return NextResponse.json(await gatherAttentionQueue(user), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
