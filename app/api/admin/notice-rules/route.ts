import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  UpdateNoticeRuleConfigInputSchema,
  readNoticeRuleConfigRecord,
  updateNoticeRuleConfig,
} from "@/lib/firestore/lease-renewal-notice-rules";

// F-TMPL-5: Admin edit surface for renewal notice rules (mirrors the transactional-destination route).
// Admin-only, server-only writes through the Admin SDK. GET returns the full record; PATCH replaces the
// rule set. Nothing here sends or drafts anything.
export async function GET() {
  try {
    const user = await requireCapability("manageAdmin");
    const noticeRules = await readNoticeRuleConfigRecord(user);

    return NextResponse.json({ noticeRules });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, UpdateNoticeRuleConfigInputSchema);
    const noticeRules = await updateNoticeRuleConfig(user, input);

    return NextResponse.json({ noticeRules });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
