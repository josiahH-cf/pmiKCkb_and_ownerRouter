import { z } from "zod";
import { parseUniqueQuery } from "@/lib/api/query";
import { NextResponse } from "next/server";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/editable";
import {
  readStaffVendorWork,
  readStaffVendorArtifact,
} from "@/lib/firestore/maintenance-vendor-work";
export async function GET(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await requireCapabilityInSpace("read", "maintenance"),
      { ticketId } = await context.params;
    const q = parseUniqueQuery(
      request,
      z
        .object({
          artifact_id: z.string().uuid().optional(),
          download: z.literal("1").optional(),
        })
        .strict(),
    );
    if (q.artifact_id) {
      const result = await readStaffVendorArtifact(
        actor,
        ticketId,
        q.artifact_id,
        undefined,
        q.download === "1",
      );
      if (result.bytes)
        return new NextResponse(Buffer.from(result.bytes), {
          headers: {
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
            "content-type": result.artifact.mimeType,
            "content-disposition": `attachment; filename="${result.artifact.filename}"`,
          },
        });
      return NextResponse.json(
        { artifact: result.artifact },
        { headers: { "cache-control": "private, no-store" } },
      );
    }
    return NextResponse.json(await readStaffVendorWork(actor, ticketId), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
