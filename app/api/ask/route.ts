import { NextResponse } from "next/server";
import { authErrorResponse, requireCapability } from "@/lib/auth/session";
import { answerQuestion } from "@/lib/ask/service";
import { AskRequestSchema, type AskResponse } from "@/lib/schemas";

export async function POST(request: Request) {
  let user;

  try {
    user = await requireCapability("read");
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

  const response: AskResponse = await answerQuestion(user, parsed.data);
  return NextResponse.json(response);
}
