import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { getPersonalView, savePersonalView } from "@/lib/firestore/personal-views";
import { PersonalViewSaveSchema } from "@/lib/ui/personal-views";
const headers = { "cache-control": "no-store" };
export async function GET(request: Request) {
  try {
    const actor = await requireCapability("read");
    const surface = PersonalViewSaveSchema.shape.surface.parse(
      new URL(request.url).searchParams.get("surface"),
    );
    return NextResponse.json(
      { preference: await getPersonalView(actor, surface) },
      { headers },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireCapability("read");
    const input = await parseJsonBody(request, PersonalViewSaveSchema);
    return NextResponse.json(
      { preference: await savePersonalView(actor, input) },
      { headers },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
