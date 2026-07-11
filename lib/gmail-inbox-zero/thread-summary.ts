import type { ModelProvider } from "@/lib/llm/model-provider";

/**
 * Thread-summary composer. Pure, injected-provider text composition — mirrors the DI + non-fatal
 * degrade contract of lib/gmail-inbox-zero/anticipatory-draft.ts. It turns PASTED, sanitized thread
 * text into a structured { summary, waiting_on, suggested_next_action } object through the ModelProvider
 * seam (local model in dev, Gemini in prod). It reads NO mailbox, constructs no provider, and has no
 * send capability. Any model throw / non-JSON / empty output degrades non-fatally (usedModel:false); the
 * empty-input guard is a defensive backstop — the route rejects an empty paste before this runs.
 */

export interface ThreadSummaryInput {
  threadText: string;
  provider: ModelProvider;
  model: string;
}

export interface ThreadSummaryResult {
  ok: boolean;
  usedModel: boolean;
  summary: string;
  waiting_on: string;
  suggested_next_action: string;
  errors: string[];
}

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    waiting_on: { type: "string" },
    suggested_next_action: { type: "string" },
  },
  required: ["summary", "waiting_on", "suggested_next_action"],
  additionalProperties: false,
} as const;

const SYSTEM_INSTRUCTION = [
  "You summarize an email thread for a property-management operator.",
  "Return ONLY JSON with the fields summary, waiting_on, and suggested_next_action.",
  "Never invent facts, names, amounts, or dates that are not present in the thread.",
  'If the thread does not make the next step clear, use "Unclear" rather than guessing.',
].join(" ");

function degraded(errors: string[]): ThreadSummaryResult {
  return {
    ok: true,
    usedModel: false,
    summary: "",
    waiting_on: "",
    suggested_next_action: "",
    errors,
  };
}

export async function summarizeThread(
  input: ThreadSummaryInput,
): Promise<ThreadSummaryResult> {
  const threadText = input.threadText.trim();
  if (threadText.length === 0) {
    return {
      ok: false,
      usedModel: false,
      summary: "",
      waiting_on: "",
      suggested_next_action: "",
      errors: ["Thread text is empty; paste the thread to summarize."],
    };
  }

  let text: string;
  try {
    const response = await input.provider.generateText({
      model: input.model,
      systemInstruction: SYSTEM_INSTRUCTION,
      userContent: threadText,
      temperature: 0,
      responseJsonSchema: SUMMARY_SCHEMA,
    });
    text = response.text;
  } catch {
    return degraded(["The model could not be reached; no summary was produced."]);
  }

  const parsed = parseSummary(text);
  if (!parsed) {
    return degraded(["The model returned no usable summary."]);
  }
  return { ok: true, usedModel: true, ...parsed, errors: [] };
}

function parseSummary(
  text: string,
): Pick<ThreadSummaryResult, "summary" | "waiting_on" | "suggested_next_action"> | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  if (summary.length === 0) {
    return null;
  }
  return {
    summary,
    waiting_on: typeof record.waiting_on === "string" ? record.waiting_on.trim() : "",
    suggested_next_action:
      typeof record.suggested_next_action === "string"
        ? record.suggested_next_action.trim()
        : "",
  };
}
