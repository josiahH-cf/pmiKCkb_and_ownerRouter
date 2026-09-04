import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  getDotloopRenewalSettings,
  selectDotloopRenewalSettings,
} from "@/lib/firestore/dotloop-renewal-settings";

// S106: read or set the exact Dotloop profile and renewal template used for renewal packets.
// Reading needs read access; setting is Admin-gated inside the store. Selection is by stable
// provider id, so a later rename in Dotloop never changes which template a packet uses. No provider
// call, token, or customer value passes through this route.
const BodySchema = z
  .object({
    profile_id: z.string().trim().min(1).max(120),
    profile_label: z.string().trim().min(1).max(200),
    template_id: z.string().trim().min(1).max(120),
    template_label: z.string().trim().min(1).max(200),
  })
  .strict();

export async function GET() {
  try {
    const user = await requireCapability("read");
    const settings = await getDotloopRenewalSettings(user);
    return NextResponse.json({ settings });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");
    const input = await parseJsonBody(request, BodySchema);
    const settings = await selectDotloopRenewalSettings(user, input);
    return NextResponse.json({ settings });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
