// S110 assistant result envelope. Every answer the assistant returns has this exact shape, so a
// caller can render items and links without interpreting free text, and completeness is always
// stated rather than implied. A source that could not be read reports `unavailable`; it is never an
// empty success.

import type {
  AssistantIntent,
  AssistantIntentFilters,
} from "@/lib/assistant/intent-registry";

export type AssistantCompleteness = "complete" | "partial" | "unavailable";

export interface AssistantItem {
  /** The owning record's id, exactly as the owning view uses it. */
  readonly id: string;
  readonly title: string;
  /** The most useful status or date for this record, in the owning view's own words. */
  readonly detail: string;
  readonly blockers: readonly string[];
  /** An exact in-app link to the owning view. The assistant never builds a provider URL. */
  readonly href: string;
}

export interface AssistantEnvelope {
  readonly version: string;
  readonly intent: AssistantIntent | null;
  readonly items: readonly AssistantItem[];
  readonly appliedFilters: AssistantIntentFilters;
  readonly completeness: AssistantCompleteness;
  /** Plain-language statement of what the source read produced. Never invents an empty result. */
  readonly sourceState: string;
  readonly links: readonly { readonly label: string; readonly href: string }[];
  /** Present only when the question needs exactly one clarification. */
  readonly clarification?: string;
  /** Present only when the question is outside the closed registry. */
  readonly unsupported?: {
    readonly message: string;
    readonly supported: readonly string[];
  };
}
