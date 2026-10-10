import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { requireOperationsLiveContext } from "@/lib/operations/live-context";
import { parseUniqueQuery } from "@/lib/api/query";
import { EditableLayerError } from "@/lib/firestore/errors";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import {
  MaintenanceReportRequestSchema,
  SaveMaintenanceReportSchema,
  maintenanceReportCsv,
} from "@/lib/maintenance/report-model";
import {
  prepareMaintenanceReport,
  saveMaintenanceReport,
  readMaintenanceReport,
  stopOriginalMaintenanceReport,
} from "@/lib/firestore/maintenance-reports";
const headers = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
};
export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace("read", "maintenance");
    requireOperationsLiveContext();
    const params = new URL(request.url).searchParams;
    if (params.has("report_id")) {
      const q = parseUniqueQuery(
          request,
          z
            .object({
              report_id: z.string().uuid(),
              format: z.enum(["pdf", "csv"]).optional(),
            })
            .strict(),
        ),
        result = await readMaintenanceReport(actor, q.report_id, undefined, q.format);
      if (q.format && result.bytes)
        return new Response(new Uint8Array(result.bytes), {
          headers: {
            ...headers,
            "content-type":
              q.format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="maintenance-${q.report_id}.${q.format}"`,
          },
        });
      return NextResponse.json(result, { headers });
    }
    if (params.has("format")) {
      const q = parseUniqueQuery(
          request,
          MaintenanceReportRequestSchema.safeExtend({
            format: z.literal("csv"),
            expected_snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/),
            generated_at: z.string().datetime(),
          }).strict(),
        ),
        { format, expected_snapshot_hash, generated_at, ...selection } = q;
      void format;
      const prepared = await prepareMaintenanceReport(actor, selection);
      if (prepared.snapshotHash !== expected_snapshot_hash)
        throw new EditableLayerError(
          "The prepared report changed. Prepare current facts before downloading a matching CSV.",
          409,
        );
      if (Date.parse(generated_at) > Date.now())
        throw new EditableLayerError("The report generation time is invalid.", 400);
      return new Response(
        maintenanceReportCsv({ ...prepared.report, generatedAt: generated_at }),
        {
          headers: {
            ...headers,
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="maintenance-${selection.scopeKind}-${selection.scopeId}.csv"`,
          },
        },
      );
    }
    return NextResponse.json(
      await prepareMaintenanceReport(
        actor,
        parseUniqueQuery(request, MaintenanceReportRequestSchema),
      ),
      { headers },
    );
  } catch (error) {
    const response = apiErrorResponse(error);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace("edit", "maintenance");
    requireOperationsLiveContext();
    const input = await parseJsonBody(request, SaveMaintenanceReportSchema);
    return NextResponse.json(await saveMaintenanceReport(actor, input), { headers });
  } catch (error) {
    const response = apiErrorResponse(error);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  }
}
export async function PATCH(request: Request) {
  try {
    const actor = await requireCapabilityInSpace("edit", "maintenance");
    requireOperationsLiveContext();
    const input = await parseJsonBody(
      request,
      z
        .object({
          operationId: z.string().uuid(),
          op: z.literal("stop_before_admission"),
        })
        .strict(),
    );
    return NextResponse.json(
      await stopOriginalMaintenanceReport(actor, input.operationId),
      { headers },
    );
  } catch (error) {
    const response = apiErrorResponse(error);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  }
}
