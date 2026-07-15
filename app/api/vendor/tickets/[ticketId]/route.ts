import { NextResponse } from "next/server";

import { FirestoreVendorStore } from "@/lib/firestore/vendors";
import { requireAssignedTicket } from "@/lib/vendor/assignment";
import { requireVendorSession, vendorErrorResponse } from "@/lib/vendor/auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const principal = await requireVendorSession();
    const { ticketId } = await context.params;
    const store = new FirestoreVendorStore();
    return NextResponse.json({
      ticket: await requireAssignedTicket(principal, ticketId, store),
    });
  } catch (error) {
    return vendorErrorResponse(error);
  }
}
