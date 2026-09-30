// S110 `work.assigned_today` adapter. It reads the actor's own My Work snapshot through the owning
// store and selects the same records the work page would show as needing attention today: open tasks
// assigned to this actor that are due today or overdue, or blocked. It writes nothing.

import type { AssistantItem } from "@/lib/assistant/envelope";
import {
  OPEN_WORK_TASK_STATES,
  type WorkTaskRecord,
} from "@/lib/work-accountability/types";
import { formatBusinessTimestamp } from "@/lib/date-display";

/**
 * Task states that are still open work, from the one owning state list. A completed or cancelled
 * task is not today's work. (S135: the earlier hand-written list named states that do not exist and
 * silently dropped every "Not started" and "In progress" task.)
 */
const OPEN_STATES: ReadonlySet<string> = OPEN_WORK_TASK_STATES;

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

/** The facts the "today" rule reads, whether from a stored task or its typed context record. */
export interface TodayTaskFacts {
  readonly assigneeUid: string | null | undefined;
  readonly state: string;
  readonly dueAtIso: string | null | undefined;
}

/** One task needs this actor's attention today: open, theirs, and blocked, due today, or overdue. */
export function taskNeedsAttentionToday(
  task: TodayTaskFacts,
  actorUid: string,
  nowIso: string,
): boolean {
  if (task.assigneeUid !== actorUid) return false;
  if (!OPEN_STATES.has(task.state)) return false;
  if (task.state === "Blocked") return true;
  if (!task.dueAtIso) return false;
  const due = Date.parse(task.dueAtIso);
  if (!Number.isFinite(due)) return false;
  return due <= Date.parse(nowIso) || isSameKansasCityDay(task.dueAtIso, nowIso);
}

export function selectAssignedTodayTasks(
  tasks: readonly WorkTaskRecord[],
  actorUid: string,
  nowIso: string,
): WorkTaskRecord[] {
  return tasks.filter((entry) =>
    taskNeedsAttentionToday(
      { assigneeUid: entry.assignee_uid, state: entry.state, dueAtIso: entry.due_at },
      actorUid,
      nowIso,
    ),
  );
}

export function projectWorkItems(tasks: readonly WorkTaskRecord[]): AssistantItem[] {
  return tasks.map((entry) => ({
    id: entry.id,
    title: entry.title,
    detail: entry.due_at
      ? `${entry.state} · due ${formatBusinessTimestamp(entry.due_at)}`
      : `${entry.state} · no due date`,
    blockers: entry.blocker_reason ? [entry.blocker_reason] : [],
    href: `/work?task_id=${encodeURIComponent(entry.id)}`,
  }));
}
