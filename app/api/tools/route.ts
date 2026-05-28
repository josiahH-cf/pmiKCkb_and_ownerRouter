import { NextResponse } from "next/server";
import { apiErrorResponse, createdJson, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { createTool, listTools } from "@/lib/firestore/editable";
import { CreateToolInputSchema } from "@/lib/firestore/schemas";

export async function GET() {
  try {
    const user = await requireCapability("read");
    const records = await listTools(user);

    return NextResponse.json({ tools: records });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("edit");
    const input = await parseJsonBody(request, CreateToolInputSchema);
    const record = await createTool(user, input);

    return createdJson({ tool: record });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
