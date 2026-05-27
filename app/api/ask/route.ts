import { NextResponse } from "next/server";
import { authErrorResponse, requireCapability } from "@/lib/auth/session";
import { AskRequestSchema, type AskResponse } from "@/lib/schemas";
import { noReliableSourceResponse } from "@/lib/source-state";

export async function POST(request: Request) {
  try {
    await requireCapability("read");
  } catch (error) {
    return authErrorResponse(error);
  }

  const payload = await request.json().catch(() => null);
  const parsed = AskRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid Ask request.",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const response: AskResponse = noReliableSourceResponse(parsed.data.question);
  return NextResponse.json(response);
}
