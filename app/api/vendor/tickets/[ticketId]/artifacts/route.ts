import { requireOperationsLiveContext } from "@/lib/operations/live-context";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVendorSession } from "@/lib/vendor/auth";
import { vendorWorkErrorResponse, vendorWorkHeaders } from "@/lib/api/vendor-work";
import { parseValidatedValue } from "@/lib/api/editable";
import { readBoundedJson } from "@/lib/api/bounded-json";
import { parseUniqueQuery } from "@/lib/api/query";
import { VendorArtifactInputSchema } from "@/lib/maintenance/vendor-work-model";
import {
  readVendorArtifact,
  uploadVendorArtifact,
  readVendorPacketArtifact,
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
        z
          .object({
            artifact_id: z.string().uuid(),
            source: z.enum(["own", "packet"]).default("own"),
            download: z.literal("1").optional(),
          })
          .strict(),
      ),
      result =
        q.source === "packet"
          ? await readVendorPacketArtifact(
              p,
              ticketId,
              q.artifact_id,
              undefined,
              q.download === "1",
            )
          : await readVendorArtifact(
              p,
              ticketId,
              q.artifact_id,
              undefined,
              q.download === "1",
            );
    if (result.bytes)
      return new NextResponse(Buffer.from(result.bytes), {
        headers: {
          ...vendorWorkHeaders,
          "content-type": result.artifact.mimeType,
          "content-disposition": `attachment; filename="${result.artifact.filename}"`,
        },
      });
    return NextResponse.json(
      { artifact: result.artifact },
      { headers: vendorWorkHeaders },
    );
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
        await readBoundedJson(request, 7 * 1024 * 1024 + 4096),
        VendorArtifactInputSchema,
      );
    return NextResponse.json(
      { artifact: await uploadVendorArtifact(p, ticketId, input) },
      { headers: vendorWorkHeaders },
    );
  } catch (error) {
    return vendorWorkErrorResponse(error);
  }
}
