import { requireOperationsLiveContext } from "@/lib/operations/live-context";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVendorSession } from "@/lib/vendor/auth";
import { vendorWorkErrorResponse, vendorWorkHeaders } from "@/lib/api/vendor-work";
import { parseValidatedValue } from "@/lib/api/editable";
import { readBoundedJson } from "@/lib/api/bounded-json";
import { parseUniqueQuery } from "@/lib/api/query";
import { VendorContributionInputSchema } from "@/lib/maintenance/vendor-work-model";
import {
  readVendorWork,
  submitVendorContribution,
} from "@/lib/firestore/maintenance-vendor-work";
export async function GET(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const p = await requireVendorSession(),
      { ticketId } = await context.params,
      q = parseUniqueQuery(
        request,
        z.object({ operation_id: z.string().uuid().optional() }).strict(),
      );
    return NextResponse.json(await readVendorWork(p, ticketId, q.operation_id), {
      headers: vendorWorkHeaders,
    });
  } catch (error) {
    return vendorWorkErrorResponse(error);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const p = await requireVendorSession();
    requireOperationsLiveContext();
    const { ticketId } = await context.params,
      input = parseValidatedValue(
        await readBoundedJson(request, 120000),
        VendorContributionInputSchema,
      );
    return NextResponse.json(
      {
        submission: await submitVendorContribution(p, ticketId, input),
        operationId: input.operationId,
      },
      { headers: vendorWorkHeaders },
    );
  } catch (error) {
    return vendorWorkErrorResponse(error);
  }
}
