import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { FirestoreVendorStore } from "@/lib/firestore/vendors";

interface RouteContext {
  params: Promise<{ ticketId: string }>;
}

// Bodyless staff projection of the canonical Test Vendor mailbox. This route intentionally
// returns no draft/reply body, message/thread id, credential, UID, or provider payload.
export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireCapabilityInSpace("read", "maintenance");
    const { ticketId } = await context.params;
    const handoff = await new FirestoreVendorStore().getTestMailboxHandoffForStaff(
      ticketId,
    );
    if (!handoff) {
      return NextResponse.json(
        { error: "The Test Vendor handoff is unavailable." },
        { status: 404, headers: { "cache-control": "private, no-store" } },
      );
    }
    return NextResponse.json(
      { handoff },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
