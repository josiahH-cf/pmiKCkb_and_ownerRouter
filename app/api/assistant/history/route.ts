import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/editable";
import {
  NO_STORE,
  isHistoryPersisted,
  logHistoryOperation,
} from "@/lib/assistant-history/route-support";
import { requireCapability } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  historyOwnerKey,
  listAssistantConversations,
} from "@/lib/firestore/assistant-history-read";

// S148: GET one page of the signed-in user's own Dashboard conversations, newest first. A read of
// stored records only: no model call, no source refresh, no rerun.
export const dynamic = "force-dynamic";

const CURSOR = /^[0-9T:.Z-]{10,40}\|[a-f0-9]{32}$/;

export async function GET(request: Request) {
  try {
    const user = await requireCapability("read");
    const ownerKey = historyOwnerKey(user.uid);
    if (!isHistoryPersisted(user)) {
      logHistoryOperation("list", "ok", { conversations: 0, persisted: false });
      return NextResponse.json(
        { ownerKey, persisted: false, conversations: [], nextCursor: null },
        { headers: NO_STORE },
      );
    }
    const cursor = new URL(request.url).searchParams.get("cursor");
    if (cursor !== null && !CURSOR.test(cursor)) {
      throw new EditableLayerError("Invalid history cursor.", 400);
    }
    const page = await listAssistantConversations(user, { cursor });
    logHistoryOperation("list", "ok", {
      conversations: page.conversations.length,
      more: page.nextCursor !== null,
    });
    return NextResponse.json(
      { ownerKey, persisted: true, ...page },
      { headers: NO_STORE },
    );
  } catch (error) {
    logHistoryOperation("list", "error");
    return apiErrorResponse(error);
  }
}
