import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/firestore/notification-preferences";
import { UpdateNotificationPreferencesInputSchema } from "@/lib/firestore/schemas";

// Self-scoped per-user notification preferences. Read-gated; the data layer always targets the
// caller's own record (doc id = uid), and there is no email field (email stays hard-off).
export async function GET() {
  try {
    const user = await requireCapability("read");
    const preferences = await getNotificationPreferences(user);
    return NextResponse.json({ preferences });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCapability("read");
    const input = await parseJsonBody(request, UpdateNotificationPreferencesInputSchema);
    const preferences = await updateNotificationPreferences(user, input);
    return NextResponse.json({ preferences });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
