// S109 optional model interpretation of intake free text.
//
// The model does exactly one thing: suggest which trade a free-text report belongs to. It cannot
// set urgency, cannot select a troubleshooting resource, cannot mark intake complete, and cannot
// downgrade a fire report, because none of those decisions read this module: the pure triage rules
// own them. Any answer that is not one of the committed trades falls back to the deterministic
// keyword inference, and so does an absent or failing provider.

import type { ModelProvider } from "@/lib/llm/model-provider";
import { MAINTENANCE_TRADES, type MaintenanceTrade } from "@/lib/maintenance/constants";
import { inferIntakeIssueType } from "@/lib/maintenance/intake-triage";

const SYSTEM_INSTRUCTION = [
  "You classify one maintenance report into exactly one trade.",
  `Answer with JSON only: {"issueType": one of ${MAINTENANCE_TRADES.join(", ")}}.`,
  "You do not decide urgency, you do not suggest a fix, and you do not offer a link.",
].join(" ");

const RESPONSE_SCHEMA = {
  type: "object",
  properties: { issueType: { type: "string", enum: [...MAINTENANCE_TRADES] } },
  required: ["issueType"],
  additionalProperties: false,
} as const;

export interface IntakeInterpretation {
  readonly issueType: MaintenanceTrade;
  readonly source: "model" | "rules";
}

function parseIssueType(text: string): MaintenanceTrade | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = (parsed as Record<string, unknown>).issueType;
  return MAINTENANCE_TRADES.includes(candidate as MaintenanceTrade)
    ? (candidate as MaintenanceTrade)
    : null;
}

/**
 * Suggest a trade for one report. Returns only `issueType` and its `source`, so no caller can read a
 * resource, a url, or an urgency out of a model answer.
 */
export async function interpretIntakeFreeText(
  report: { readonly summary: string; readonly description?: string },
  options: {
    readonly provider: ModelProvider | null;
    readonly model?: string;
  },
): Promise<IntakeInterpretation> {
  const text = `${report.summary}\n${report.description ?? ""}`.trim();
  const fallback: IntakeInterpretation = {
    issueType: inferIntakeIssueType(text),
    source: "rules",
  };
  if (!options.provider) return fallback;
  try {
    const response = await options.provider.generateText({
      model: options.model ?? "",
      systemInstruction: SYSTEM_INSTRUCTION,
      userContent: text,
      temperature: 0,
      responseJsonSchema: RESPONSE_SCHEMA,
    });
    const issueType = parseIssueType(response.text ?? "");
    return issueType ? { issueType, source: "model" } : fallback;
  } catch {
    return fallback;
  }
}
