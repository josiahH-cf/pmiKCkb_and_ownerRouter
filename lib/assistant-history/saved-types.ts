// S149 saved-question shapes shared by the server store and the browser. Types only.

import type { ConversationContext } from "@/lib/assistant/conversation-plan";

/** The concrete period a saved question's original run used, and whether it moves on each run. */
export interface SavedRange {
  readonly intent: "relative" | "fixed";
  readonly preset: string;
  readonly month: string | null;
  readonly dateField: string | null;
  readonly startIso: string | null;
  readonly endIso: string;
  readonly label: string;
}

/** What the browser sees of a saved question: no plan and no record references. */
export interface SavedQuestionView {
  readonly savedId: string;
  readonly label: string;
  readonly question: string;
  readonly conversationId: string;
  readonly conversationKey: string;
  /** The history turn the item was saved from. */
  readonly operationId: string;
  /** The newest stored answer: the saved turn or its latest current run. */
  readonly lastOperationId: string;
  readonly lastAnsweredAtIso: string;
  readonly createdAtIso: string;
  readonly pinned: boolean;
  readonly recordVersion: number;
  /** True when running for current results needs no new interpretation (S150). */
  readonly structured: boolean;
  readonly originalRange: SavedRange | null;
  /** Only for an item that must be asked again: the conversation before the saved turn. */
  readonly contextBefore: ConversationContext | null;
}
