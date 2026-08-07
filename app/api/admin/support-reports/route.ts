import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { transitionSupportReport } from "@/lib/firestore/support-reports";

// S65: the feedback-report status transition, following the /admin precedent: Admin-only, the
// three already-typed statuses, an append-only audit in the store. A transition never deletes a
// report, never changes its retention class, and never messages the reporter.

const TransitionSchema = z
  .object({
    report_id: z.string().trim().min(1),
    status: z.enum(["new", "acknowledged", "resolved"]),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, TransitionSchema);
    const report = await transitionSupportReport(user, {
      reportId: input.report_id,
      status: input.status,
      ...(input.note ? { note: input.note } : {}),
    });
    return NextResponse.json({ report });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
