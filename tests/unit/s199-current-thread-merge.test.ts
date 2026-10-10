import { it, expect } from "vitest";
import { mergeAccessibleThreadTurns } from "@/components/ask/thread-merge";
import type { DashboardTurn } from "@/components/ask/DashboardTurnView";
const local = {
  id: "original-turn",
  question: "Keep the staff question",
  state: "answered",
  assistant: { text: "restricted prior answer" },
  knowledge: { answer: "restricted prior source value" },
  contextBefore: { restricted: "prior context" },
  saveState: "failed",
  questionSave: "none",
} as unknown as DashboardTurn;
it("never restores an unaccepted local answer absent from the current authorized projection", () => {
  const current = mergeAccessibleThreadTurns([], [local]);
  expect(current[0]).toMatchObject({
    question: local.question,
    state: "interrupted",
    assistant: null,
    knowledge: null,
    contextBefore: null,
    accessChanged: true,
  });
  expect(JSON.stringify(current)).not.toContain("restricted prior");
});
it("current denied or accepted results win while a currently permitted in-progress projection can retain lost-save work", () => {
  const denied = {
    ...local,
    assistant: null,
    knowledge: null,
    contextBefore: null,
    accessChanged: true,
    saveState: "saved" as const,
  };
  expect(mergeAccessibleThreadTurns([denied], [local])[0].assistant).toBeNull();
  const accepted = {
    ...denied,
    accessChanged: false,
    assistant: { text: "fresh accepted answer" },
  } as unknown as DashboardTurn;
  expect(mergeAccessibleThreadTurns([accepted], [local])[0]).toEqual(accepted);
  const pending = { ...denied, accessChanged: false, state: "in_progress" as const };
  expect(mergeAccessibleThreadTurns([pending], [local])[0]).toEqual(local);
});
