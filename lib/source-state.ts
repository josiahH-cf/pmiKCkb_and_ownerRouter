import { SOURCE_STATES } from "@/lib/constants";
import type { AskResponse } from "@/lib/schemas";

export type SourceState = (typeof SOURCE_STATES)[number];

export interface GroundingSignal {
  supportingDocumentCount: number;
  confidence?: number;
  threshold?: number;
  hasOpenPlaceholder?: boolean;
  hasConflict?: boolean;
  isPartial?: boolean;
}

export function classifyGrounding(signal: GroundingSignal): SourceState {
  const threshold = signal.threshold ?? 0;

  if (signal.hasConflict) {
    return "Conflict Found";
  }

  if (signal.hasOpenPlaceholder) {
    return "Open Placeholder";
  }

  if (signal.supportingDocumentCount <= 0 || (signal.confidence ?? 1) < threshold) {
    return "No Reliable Source Found";
  }

  if (signal.isPartial || signal.supportingDocumentCount === 1) {
    return "Partial Source";
  }

  return "Verified Source";
}

export function noReliableSourceResponse(question: string): AskResponse {
  return {
    question,
    source_state: "No Reliable Source Found",
    answer:
      "No approved PMI KC source is configured for this question in the scaffold yet.",
    handling_steps: [],
    citations: [],
    draft: "",
    escalation_owner: "Process owner",
  };
}
