import { NextResponse } from "next/server";

import { FirestoreVendorStore } from "@/lib/firestore/vendors";
import { listVendorTickets } from "@/lib/vendor/assignment";
import { confirmVendorPortalAccess } from "@/lib/vendor/access";
import {
  assertVendorPrincipalLaneAllowed,
  requireVendorSession,
  vendorErrorResponse,
} from "@/lib/vendor/auth";

export async function GET() {
  try {
    const principal = await requireVendorSession();
    assertVendorPrincipalLaneAllowed(principal);
    const store = new FirestoreVendorStore();
    await confirmVendorPortalAccess(principal, store);
    return NextResponse.json({ tickets: await listVendorTickets(principal, store) });
  } catch (error) {
    return vendorErrorResponse(error);
  }
}
