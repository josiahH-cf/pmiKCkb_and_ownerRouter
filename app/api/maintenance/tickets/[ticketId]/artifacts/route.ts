import { requireOperationsLiveContext } from "@/lib/operations/live-context";
import { parseUniqueQuery } from "@/lib/api/query";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { apiErrorResponse, parseValidatedValue } from "@/lib/api/editable";
import { readBoundedJson } from "@/lib/api/bounded-json";
import { MaintenanceArtifactInputSchema } from "@/lib/maintenance/case-model";
import {
  uploadMaintenanceArtifact,
  readMaintenanceArtifact,
  finalizeMaintenanceArtifact,
} from "@/lib/firestore/maintenance-artifacts";
const command = z.discriminatedUnion("action", [
  MaintenanceArtifactInputSchema.extend({ action: z.literal("upload") }),
  z
    .object({
      action: z.literal("reconcile"),
      artifactId: z.string().uuid(),
      expectedVersion: z.number().int().nonnegative(),
      reviewCurrentCase: z.boolean(),
    })
    .strict(),
]);
const headers = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
};
export async function POST(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await requireCapabilityInSpace("edit", "maintenance");
    requireOperationsLiveContext();
    const { ticketId } = await context.params,
      body = parseValidatedValue(
        await readBoundedJson(request, 7 * 1024 * 1024 + 4096),
        command,
      );
    if (body.action === "upload") {
      const { action, ...input } = body;
      void action;
      return NextResponse.json(
        { artifact: await uploadMaintenanceArtifact(actor, ticketId, input) },
        { headers },
      );
    }
    return NextResponse.json(
      {
        artifact: await finalizeMaintenanceArtifact(
          actor,
          ticketId,
          body.artifactId,
          body.expectedVersion,
          body.reviewCurrentCase,
        ),
      },
      { headers },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
export async function GET(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await requireCapabilityInSpace("read", "maintenance"),
      { ticketId } = await context.params,
      q = parseUniqueQuery(
        request,
        z
          .object({ artifact_id: z.string().uuid(), download: z.literal("1").optional() })
          .strict(),
      ),
      result = await readMaintenanceArtifact(
        actor,
        ticketId,
        q.artifact_id,
        undefined,
        q.download === "1",
      );
    if (result.bytes)
      return new NextResponse(Buffer.from(result.bytes), {
        headers: {
          ...headers,
          "content-type": result.artifact.mimeType,
          "content-disposition": `attachment; filename="${result.artifact.filename}"`,
          "content-length": String(result.bytes.length),
        },
      });
    return NextResponse.json({ artifact: result.artifact }, { headers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
