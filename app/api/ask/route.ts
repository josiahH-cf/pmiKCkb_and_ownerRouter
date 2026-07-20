import { NextResponse } from "next/server";
import { authErrorResponse, requireCapability } from "@/lib/auth/session";
import { answerQuestion } from "@/lib/ask/service";
import { AnswerGenerationSetupError } from "@/lib/llm/answer";
import { RetrievalSetupError } from "@/lib/retrieval/vertex-search";
import { AskRequestSchema, type AskResponse } from "@/lib/schemas";
import { scopeAskRequest } from "@/lib/space-scope-resources";

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

  let scopedRequest;
  try {
    scopedRequest = scopeAskRequest(user, parsed.data);
  } catch (error) {
    return authErrorResponse(error);
  }

  try {
    const response: AskResponse = await answerQuestion(user, scopedRequest);
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

    // LR-03: a runtime retrieval/model OUTAGE (not just a setup gap) degrades gracefully to a retryable
    // 503 with an actionable cause, so the Ask surface shows a real reason instead of a bare 500.
    return NextResponse.json(
      {
        error:
          "The answer service is temporarily unavailable. Please try again in a moment.",
        error_type: "AskRuntimeError",
      },
      { status: 503 },
    );
  }
}
