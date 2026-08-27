import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  listRenewalDiscrepancyDispositions,
  recordRenewalDiscrepancyDisposition,
} from "@/lib/firestore/renewal-discrepancy-dispositions";

const BodySchema = z
  .object({
    lease_id: z.string().trim().min(1).max(120),
    sheet_row_number: z.number().int().positive(),
    source_hash: z.string().regex(/^[a-f0-9]{64}$/),
    field: z.string().trim().min(1).max(100),
    category: z.enum([
      "agree",
      "conflict",
      "rentvine_only",
      "sheet_only",
      "missing",
      "intentional_semantic_difference",
      "stale_snapshot",
      "identity_ambiguous",
    ]),
    authoritative_source: z.enum([
      "rentvine",
      "operating_sheet",
      "client_decision",
      "not_determined",
    ]),
    proposed_correction: z.string().trim().min(1).max(2_000),
    reason: z.string().trim().min(3).max(2_000),
    owner_uid: z.string().trim().min(1).max(128),
    status: z.enum([
      "waiting_on_client",
      "proposed",
      "approved",
      "rejected",
      "completed",
    ]),
    evidence_refs: z.array(z.string().trim().min(1).max(500)).max(20),
    transaction_key: z
      .enum([
        "rentvine.lease.renewal_writeback",
        "google_sheets.renewal_checklist.writeback",
      ])
      .optional(),
    current_rent_definition_ref: z.string().trim().min(1).max(500).optional(),
    effect_receipt_ref: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const user = await requireCapabilityInSpace("read", "renewals");
    const leaseId = new URL(request.url).searchParams.get("lease_id")?.trim() ?? "";
    if (!leaseId)
      return NextResponse.json({ error: "lease_id is required" }, { status: 400 });
    const dispositions = await listRenewalDiscrepancyDispositions(user, leaseId);
    return NextResponse.json({ dispositions });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "renewals");
    const input = await parseJsonBody(request, BodySchema);
    const disposition = await recordRenewalDiscrepancyDisposition(user, input);
    return NextResponse.json({ disposition });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
