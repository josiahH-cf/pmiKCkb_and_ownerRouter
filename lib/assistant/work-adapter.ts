// S110 `work.assigned_today` adapter. It reads the actor's own My Work snapshot through the owning
// store and selects the same records the work page would show as needing attention today: open tasks
// assigned to this actor that are due today or overdue, or blocked. It writes nothing.

import type { AssistantItem } from "@/lib/assistant/envelope";
import type { WorkTaskRecord } from "@/lib/work-accountability/types";

/** Task states that are still open work. A completed or cancelled task is not today's work. */
const OPEN_STATES = new Set([
  "Assigned",
  "InProgress",
  "In Progress",
  "Blocked",
  "Paused",
]);

function isSameKansasCityDay(leftIso: string, rightIso: string): boolean {
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  return format(leftIso) === format(rightIso);
}

export function selectAssignedTodayTasks(
  tasks: readonly WorkTaskRecord[],
  actorUid: string,
  nowIso: string,
): WorkTaskRecord[] {
  return tasks.filter((entry) => {
    if (entry.assignee_uid !== actorUid) return false;
    if (!OPEN_STATES.has(entry.state)) return false;
    if (entry.state === "Blocked") return true;
    if (!entry.due_at) return false;
    const due = Date.parse(entry.due_at);
    if (!Number.isFinite(due)) return false;
    return due <= Date.parse(nowIso) || isSameKansasCityDay(entry.due_at, nowIso);
  });
}

export function projectWorkItems(tasks: readonly WorkTaskRecord[]): AssistantItem[] {
  return tasks.map((entry) => ({
    id: entry.id,
    title: entry.title,
    detail: entry.due_at
      ? `${entry.state} · due ${entry.due_at.slice(0, 10)}`
      : `${entry.state} · no due date`,
    blockers: entry.blocker_reason ? [entry.blocker_reason] : [],
    href: `/work?task_id=${encodeURIComponent(entry.id)}`,
  }));
}
