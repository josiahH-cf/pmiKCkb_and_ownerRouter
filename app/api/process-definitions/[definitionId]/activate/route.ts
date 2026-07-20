import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";

interface RouteContext {
  params: Promise<{ definitionId: string }>;
}

// F-SPACE-2 (owner ruling D3): `publish` is the ONE canonical path to Active. The divergent `activate`
// path (Admin + an Approved ProcessDefinitionChange queue item + a passed test run or override) is retired
// at the route level so there is a single, documented activation lifecycle. The route stays Admin-gated so
// the retired surface keeps its authorization boundary; callers are pointed to the publish action.
export async function POST(request: Request, context: RouteContext) {
  try {
    await requireCapability("manageAdmin");
    await context.params;
    await request.text();
    return NextResponse.json(
      {
        error:
          "Direct activation is retired. Publish the process definition to move it to Active.",
      },
      { status: 409 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
