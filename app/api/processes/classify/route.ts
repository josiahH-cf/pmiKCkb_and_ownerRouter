import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse, requireCapability } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { listProcessDefinitions } from "@/lib/firestore/workflows";
import { AnswerGenerationSetupError } from "@/lib/llm/answer";
import { createModelProvider } from "@/lib/llm/model-provider";
import { classifyProcessWithModel } from "@/lib/processes/classify";
import { filterProcessDefinitionsForUser } from "@/lib/space-scope-resources";

const ClassifyRequestSchema = z.object({ question: z.string().trim().min(3) });

// Model-backed process classification for the action console. Edit-gated (starting work is an editor
// capability) and a cost-bearing model call, so the client invokes it ONLY as an explicit fallback when
// the free deterministic matcher finds nothing. Goes through the ModelProvider seam (Gemini in prod,
// local stand-in in dev). Returns the chosen process id + name, or null.
export async function POST(request: Request) {
  let user;
  try {
    user = await requireCapability("edit");
  } catch (error) {
    return authErrorResponse(error);
  }

  const payload = await request.json().catch(() => null);
  const parsed = ClassifyRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid classify request." }, { status: 400 });
  }

  try {
    const config = readServerConfig();
    const definitions = filterProcessDefinitionsForUser(
      user,
      await listProcessDefinitions(user),
    );
    const provider = createModelProvider(config);
    const model =
      config.modelProvider === "local"
        ? config.localModelName
        : config.geminiClassifyModel;

    const processId = await classifyProcessWithModel({
      question: parsed.data.question,
      processes: definitions.map((d) => ({
        id: d.id,
        name: d.name,
        outcome: d.short_outcome,
      })),
      provider,
      model,
    });
    const match = processId ? definitions.find((d) => d.id === processId) : undefined;

    return NextResponse.json({ processId: match?.id ?? null, name: match?.name ?? null });
  } catch (error) {
    if (error instanceof AnswerGenerationSetupError) {
      return NextResponse.json(
        { error: error.message, error_type: error.name },
        { status: 503 },
      );
    }
    throw error;
  }
}
