import { NextResponse } from "next/server";
import { apiErrorResponse, createdJson, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  createProcessDefinition,
  listProcessDefinitions,
} from "@/lib/firestore/workflows";
import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  assertSpaceIdAccess,
  filterProcessDefinitionsForUser,
} from "@/lib/space-scope-resources";
import { launchSpaces } from "@/lib/spaces";

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
    const input = await parseJsonBody(request, CreateProcessDefinitionInputSchema);
    if (
      !input.space_id ||
      !launchSpaces.some((space) => space.id === input.space_id && !space.readOnly)
    ) {
      throw new EditableLayerError(
        "A writable launch Space is required for a new process definition.",
        400,
      );
    }
    assertSpaceIdAccess(user, input.space_id);
    const definition = await createProcessDefinition(user, input);

    return createdJson({ definition });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
