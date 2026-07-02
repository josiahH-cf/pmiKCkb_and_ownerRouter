import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  DecideWritebackApprovalsBulkInputSchema,
  decideWritebackApprovalsBulk,
} from "@/lib/firestore/lease-renewal-writeback-approvals";

// Bulk approve/return for queued lease-renewal write-back proposals (S13 B2), run-page only. One
// shared mandatory reason covers every selected proposal; the data layer loops the existing
// per-proposal transaction, so the Admin gate, transition rules, and one Activity row per decision
// all hold per item, and per-item failures are reported without blocking the rest. No system-of-
// record write happens here.
export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");
    const input = await parseJsonBody(request, DecideWritebackApprovalsBulkInputSchema);
    const outcome = await decideWritebackApprovalsBulk(user, input);

    return NextResponse.json(outcome);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
