import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { loadNotificationHub } from "@/lib/notifications/hub";

// GET the signed-in user's unified in-app notification feed (the event log) plus, for the hub (`full=true`),
// the STANDING setup signals (connections + coverage) and the Admin-only review DIGEST, all lane-stamped
// and low-alarm resolved. Read-gated and self-scoped: each per-source reader returns only the caller's own
// records. Makes ZERO external calls — no RentVine, Sheet, or Gmail client is invoked (AC-S17-8). The bell
// omits `full`, so its frequent poll stays lightweight (event log only).
export async function GET(request: Request) {
  try {
    const user = await requireCapability("read");
    const searchParams = new URL(request.url).searchParams;
    const unreadOnly = searchParams.get("unread_only") === "true";
    const full = searchParams.get("full") === "true";
    const limitParam = searchParams.get("limit")?.trim();
    const limit = limitParam ? Number(limitParam) : undefined;

    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      throw new EditableLayerError("Invalid notification limit.", 400);
    }

    const feed = await loadNotificationHub(user, { full, unreadOnly, limit });
    return NextResponse.json(feed);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
