import { NextResponse } from "next/server";
import { authErrorResponse, requireCapability } from "@/lib/auth/session";
import { answerQuestion } from "@/lib/ask/service";
import { AnswerGenerationSetupError } from "@/lib/llm/answer";
import { RetrievalSetupError } from "@/lib/retrieval/vertex-search";
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

  try {
    const response: AskResponse = await answerQuestion(user, parsed.data);
    return NextResponse.json(response);
  } catch (error) {
    if (
      error instanceof RetrievalSetupError ||
      error instanceof AnswerGenerationSetupError
    ) {
      return NextResponse.json(
        {
          error: error.message,
          error_type: error.name,
        },
        { status: 503 },
      );
    }

    throw error;
  }
}
