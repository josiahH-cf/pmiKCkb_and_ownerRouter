// S138 business-calendar ranges for Dashboard questions. Every range is a set of America/Chicago
// calendar days, so "this week" or "next month" means the same days the desk and the operator read.
// Weeks run Monday through Sunday; the answer always states the exact interpreted days.

import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import { formatCalendarDate, formatCalendarMonth } from "@/lib/date-display";
import type { DatePreset } from "@/lib/assistant/conversation-plan";

export interface BusinessRange {
  /** Inclusive first calendar day, or null for an open start (overdue). */
  readonly startIso: string | null;
  /** Inclusive last calendar day. */
  readonly endIso: string;
  readonly label: string;
}

function addDays(dateIso: string, days: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function monthBounds(monthIso: string): { startIso: string; endIso: string } {
  const [year, month] = monthIso.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { startIso: `${monthIso}-01`, endIso: last };
}

function shiftMonth(monthIso: string, delta: number): string {
  const [year, month] = monthIso.split("-").map(Number);
  const zeroBased = year * 12 + (month - 1) + delta;
  return `${String(Math.floor(zeroBased / 12)).padStart(4, "0")}-${String((zeroBased % 12) + 1).padStart(2, "0")}`;
}

/** ISO weekday of a calendar date, Monday = 1 through Sunday = 7. */
function isoWeekday(dateIso: string): number {
  const [year, month, day] = dateIso.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function spanLabel(startIso: string, endIso: string): string {
  return startIso === endIso
    ? formatCalendarDate(startIso)
    : `${formatCalendarDate(startIso)} through ${formatCalendarDate(endIso)}`;
}

export function resolveBusinessRange(
  preset: DatePreset,
  month: string | null,
  nowIso: string,
): BusinessRange {
  const today = businessDateIso(nowIso);
  switch (preset) {
    case "today":
      return {
        startIso: today,
        endIso: today,
        label: `today, ${formatCalendarDate(today)}`,
      };
    case "this_week":
    case "next_week": {
      const monday = addDays(
        today,
        1 - isoWeekday(today) + (preset === "next_week" ? 7 : 0),
      );
      const sunday = addDays(monday, 6);
      return {
        startIso: monday,
        endIso: sunday,
        label: `${preset === "this_week" ? "this week" : "next week"}, ${spanLabel(monday, sunday)} (Monday through Sunday)`,
      };
    }
    case "this_month":
    case "next_month":
    case "last_month":
    case "month": {
      const current = today.slice(0, 7);
      const target =
        preset === "month"
          ? (month ?? current)
          : shiftMonth(
              current,
              preset === "this_month" ? 0 : preset === "next_month" ? 1 : -1,
            );
      const bounds = monthBounds(target);
      const word =
        preset === "this_month"
          ? "this month, "
          : preset === "next_month"
            ? "next month, "
            : preset === "last_month"
              ? "last month, "
              : "";
      return {
        ...bounds,
        label: `${word}${formatCalendarMonth(target)} (${spanLabel(bounds.startIso, bounds.endIso)})`,
      };
    }
    case "overdue": {
      const yesterday = addDays(today, -1);
      return {
        startIso: null,
        endIso: yesterday,
        label: `overdue, before ${formatCalendarDate(today)}`,
      };
    }
  }
}

/** Whether a stored date or instant falls on a business day inside the range. */
export function inBusinessRange(value: string | null, range: BusinessRange): boolean {
  if (!value) return false;
  let day: string;
  try {
    day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : businessDateIso(value);
  } catch {
    return false;
  }
  if (range.startIso && day < range.startIso) return false;
  return day <= range.endIso;
}

export { addDays as addBusinessDays };
