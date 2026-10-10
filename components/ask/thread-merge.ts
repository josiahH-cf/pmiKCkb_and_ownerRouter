import type { DashboardTurn } from "./DashboardTurnView";
/** Reopening always rechecks the actual current projection before retaining any unsaved answer. */
export function mergeAccessibleThreadTurns(
  fresh: readonly DashboardTurn[],
  local: readonly DashboardTurn[],
): DashboardTurn[] {
  const turns = [...fresh];
  for (const old of local) {
    const i = turns.findIndex((t) => t.id === old.id),
      received = i >= 0 ? turns[i] : null;
    if (old.saveState !== "saved" && !received)
      turns.push({
        ...old,
        state: "interrupted",
        assistant: null,
        knowledge: null,
        contextBefore: null,
        assistantUnavailable: false,
        knowledgeError: null,
        error:
          "This local answer could not be revalidated against your current accessible thread. Your question is kept; retry only for a fresh authorized answer.",
        answeredAtIso: null,
        restored: true,
        accessChanged: true,
        saveState: "failed",
      });
    else if (
      old.saveState !== "saved" &&
      received &&
      !received.accessChanged &&
      received.state !== "answered"
    )
      turns[i] = old;
    else if (received) turns[i] = { ...received, questionSave: old.questionSave };
  }
  return turns;
}
