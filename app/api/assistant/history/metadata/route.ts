import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  NO_STORE,
  refuseVerificationWrite,
  logHistoryOperation,
} from "@/lib/assistant-history/route-support";
import { historyOwnerKey } from "@/lib/firestore/assistant-history-read";
import {
  ThreadMetadataCommandSchema,
  updateAssistantThreadMetadata,
} from "@/lib/firestore/assistant-thread-metadata";
export async function POST(request: Request) {
  try {
    const user = await requireCapability("read"),
      refused = refuseVerificationWrite(user);
    if (refused) return refused;
    const input = await parseJsonBody(request, ThreadMetadataCommandSchema),
      result = await updateAssistantThreadMetadata(user, input);
    logHistoryOperation(input.action, "ok", { replayed: result.replayed });
    return NextResponse.json(
      { ownerKey: historyOwnerKey(user.uid), ...result },
      { headers: NO_STORE },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
