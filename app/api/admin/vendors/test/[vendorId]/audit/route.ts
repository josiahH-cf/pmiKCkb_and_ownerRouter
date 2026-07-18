import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { listProductionTestVendorAudit } from "@/lib/vendor/admin-runtime";
import { VendorBoundaryError } from "@/lib/vendor/model";

interface RouteContext {
  params: Promise<{ vendorId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireCapability("manageAdmin");
    const { vendorId } = await context.params;
    return NextResponse.json({ audit: await listProductionTestVendorAudit(vendorId) });
  } catch (error) {
    if (error instanceof VendorBoundaryError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiErrorResponse(error);
  }
}
