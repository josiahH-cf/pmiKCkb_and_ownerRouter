import { parseUniqueQuery } from "@/lib/api/query";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { apiErrorResponse, parseValidatedValue } from "@/lib/api/editable";
import { readMaintenanceCaseHistory } from "@/lib/firestore/maintenance-case-records";
export async function GET(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await requireCapabilityInSpace("read", "maintenance"),
      { ticketId } = await context.params,
      q = parseUniqueQuery(
        request,
        z.object({ after: z.string().uuid().optional() }).strict(),
      );
    return NextResponse.json(
      await readMaintenanceCaseHistory(actor, ticketId, { after: q.after }),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
