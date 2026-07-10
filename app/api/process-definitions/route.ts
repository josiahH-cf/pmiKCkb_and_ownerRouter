import { NextResponse } from "next/server";
import { apiErrorResponse, createdJson, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  createProcessDefinition,
  listProcessDefinitions,
} from "@/lib/firestore/workflows";
import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import {
  assertWildcardResourceAccess,
  filterProcessDefinitionsForUser,
} from "@/lib/space-scope-resources";

export async function GET() {
  try {
    const user = await requireCapability("read");
    const definitions = filterProcessDefinitionsForUser(
      user,
      await listProcessDefinitions(user),
    );

    return NextResponse.json({ definitions });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("edit");
    assertWildcardResourceAccess(user);
    const input = await parseJsonBody(request, CreateProcessDefinitionInputSchema);
    const definition = await createProcessDefinition(user, input);

    return createdJson({ definition });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
