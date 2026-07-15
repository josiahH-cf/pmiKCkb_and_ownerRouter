import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  disableProductionTestVendor,
  listProductionTestVendors,
  provisionProductionTestVendor,
} from "@/lib/vendor/admin-runtime";
import { VendorBoundaryError } from "@/lib/vendor/model";
import {
  testVendorDisablePreview,
  testVendorProvisionPreview,
} from "@/lib/vendor/test-identity";

const bodySchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("preview_provision"),
    aliasKey: z.literal("summit-plumbing"),
    reason: z.string(),
  }),
  z.object({
    operation: z.literal("provision"),
    aliasKey: z.literal("summit-plumbing"),
    reason: z.string(),
    confirmedPreviewHash: z.string().min(1),
  }),
  z.object({
    operation: z.literal("preview_disable"),
    vendorId: z.string().min(1),
    reason: z.string(),
  }),
  z.object({
    operation: z.literal("disable"),
    vendorId: z.string().min(1),
    reason: z.string(),
    confirmedPreviewHash: z.string().min(1),
  }),
]);

export async function GET() {
  try {
    await requireCapability("manageAdmin");
    return NextResponse.json({ vendors: await listProductionTestVendors() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability("manageAdmin");
    const body = await parseJsonBody(request, bodySchema);
    if (body.operation === "preview_provision") {
      return NextResponse.json({
        preview: testVendorProvisionPreview(body.aliasKey, body.reason),
      });
    }
    if (body.operation === "provision") {
      return NextResponse.json(
        await provisionProductionTestVendor({
          actor,
          aliasKey: body.aliasKey,
          reason: body.reason,
          confirmedPreviewHash: body.confirmedPreviewHash,
        }),
        { status: 201 },
      );
    }
    if (body.operation === "preview_disable") {
      return NextResponse.json({
        preview: testVendorDisablePreview(body.vendorId, body.reason),
      });
    }
    return NextResponse.json(
      await disableProductionTestVendor({
        actor,
        vendorId: body.vendorId,
        reason: body.reason,
        confirmedPreviewHash: body.confirmedPreviewHash,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof VendorBoundaryError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return apiErrorResponse(error);
}
