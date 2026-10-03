import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  SaveRenewalStatusNoteSchema,
  listRenewalStatusNotes,
  saveRenewalStatusNote,
} from "@/lib/firestore/renewal-status-notes";
import {
  SaveRenewalWorkStatusSchema,
  getRenewalWorkStatus,
  listRenewalWorkStatusActivity,
  saveRenewalWorkStatus,
} from "@/lib/firestore/renewal-work-status";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

// S119: the staff work status annotation. It writes only the app's own record and append-only
// activity for one lease; the actor comes from the server session, never the body. No RentVine,
// Sheet, Gmail or provider effect, no cycle change and no automatic classification derives from it.
// S164: the same route reads and saves the lease's notes for the running Status log. A note is its
// own app-owned entry: it needs no status in the request, changes no status and derives nothing.

// A note names itself with kind "note"; a status save keeps its original exact shape.
const SaveStatusLogEntrySchema = z.union([
  SaveRenewalStatusNoteSchema,
  SaveRenewalWorkStatusSchema,
]);

export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const parsedLeaseId = z
      .string()
      .regex(/^[1-9]\d*$/)
      .safeParse(new URL(request.url).searchParams.get("leaseId"));
    if (!parsedLeaseId.success)
      throw new EditableLayerError("leaseId must be a RentVine lease id.", 400);
    const leaseId = parsedLeaseId.data;
    const [record, history, notes] = await Promise.all([
      getRenewalWorkStatus(actor, leaseId),
      listRenewalWorkStatusActivity(actor, leaseId),
      listRenewalStatusNotes(actor, leaseId),
    ]);
    return NextResponse.json({ record, history, notes });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("save_work_status"),
      "renewals",
    );
    const input = await parseJsonBody(request, SaveStatusLogEntrySchema);
    if ("kind" in input)
      return NextResponse.json(await saveRenewalStatusNote(actor, input));
    return NextResponse.json(await saveRenewalWorkStatus(actor, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
