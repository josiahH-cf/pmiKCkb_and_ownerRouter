import { NextResponse } from "next/server";

import { FirestoreVendorStore } from "@/lib/firestore/vendors";
import { listVendorTickets } from "@/lib/vendor/assignment";
import { requireVendorSession, vendorErrorResponse } from "@/lib/vendor/auth";

export async function GET() {
  try {
    const principal = await requireVendorSession();
    const store = new FirestoreVendorStore();
    await store.activateVendor(
      principal.vendorId,
      principal.uid,
      principal.email,
      new Date().toISOString(),
      principal.dataMode ?? "live",
    );
    return NextResponse.json({ tickets: await listVendorTickets(principal, store) });
  } catch (error) {
    return vendorErrorResponse(error);
  }
}
