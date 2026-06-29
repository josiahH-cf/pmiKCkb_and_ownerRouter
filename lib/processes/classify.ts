// Model-backed process classification (R4 action console) — the "hybrid" fallback used only when the
// deterministic matcher (lib/processes/intent.ts) finds nothing and the user explicitly asks. Goes
// through the ModelProvider SEAM, so it is Gemini/Vertex in production and the free local stand-in in
// dev (lib/config/server.ts fences the local path out of prod). Returns a process id ONLY if the model
// picks one that actually exists — never an invented id; null otherwise (incl. parse/echo failures).

import type { ModelProvider } from "@/lib/llm/model-provider";

export interface ClassifiableProcess {
  id: string;
  name: string;
  outcome?: string;
}

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: { process_id: { type: ["string", "null"] } },
  required: ["process_id"],
  additionalProperties: false,
} as const;

const SYSTEM_INSTRUCTION = [
  "You route a user's request to exactly ONE process from the provided list, or null if none clearly fits.",
  'Return strict JSON: {"process_id": <one of the listed ids, or null>}.',
  "The process_id MUST be copied verbatim from the list or be null. Never invent an id.",
  "Do not include any source content or the user's data back in the output — only the id or null.",
].join("\n");

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function classifyProcessWithModel(options: {
  question: string;
  processes: readonly ClassifiableProcess[];
  provider: ModelProvider;
  model: string;
}): Promise<string | null> {
  if (options.processes.length === 0) {
    return null;
  }

  const list = options.processes
    .map((p) => `- id: ${p.id} | name: ${p.name}${p.outcome ? ` | outcome: ${p.outcome}` : ""}`)
    .join("\n");
  const userContent = `Processes:\n${list}\n\nUser request: ${options.question}\n\nReturn the best-matching process id or null.`;

  const { text } = await options.provider.generateText({
    model: options.model,
    systemInstruction: SYSTEM_INSTRUCTION,
    userContent,
    temperature: 0,
    responseJsonSchema: CLASSIFY_SCHEMA,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    return null;
  }

  const id = (parsed as { process_id?: unknown })?.process_id;
  return typeof id === "string" && options.processes.some((p) => p.id === id) ? id : null;
}
