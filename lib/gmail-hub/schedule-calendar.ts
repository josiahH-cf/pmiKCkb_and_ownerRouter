import { z } from "zod";

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Use a real calendar date.");
export const CommunicationScheduleSchema = z
  .object({
    firstDate: calendarDate,
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine((s) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: s }).format(0);
          return true;
        } catch {
          return false;
        }
      }, "Choose a supported named timezone."),
    everyDays: z.number().int().min(1).max(366).nullable(),
    endDate: calendarDate.nullable(),
    sendLimit: z.number().int().min(1).max(1000).nullable(),
  })
  .strict()
  .refine(
    (s) => !s.endDate || s.endDate >= s.firstDate,
    "The end date precedes the first date.",
  );
export type CommunicationSchedule = z.infer<typeof CommunicationScheduleSchema>;

function formatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}
function localParts(ms: number, fmt: Intl.DateTimeFormat) {
  const p = Object.fromEntries(
    fmt.formatToParts(ms).map((part) => [part.type, part.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
export function localDateAt(ms: number, timeZone: string): string {
  if (!Number.isFinite(ms)) throw new RangeError("A finite instant is required.");
  return localParts(ms, formatter(timeZone)).date;
}
export function addCalendarDays(date: string, days: number): string {
  calendarDate.parse(date);
  if (!Number.isSafeInteger(days))
    throw new RangeError("Whole calendar days are required.");
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Repeated wall times select the earlier instant once. A gap advances to the first valid minute. */
export function resolveWallTime(
  date: string,
  time: string,
  timeZone: string,
): {
  instantMs: number;
  resolvedDate: string;
  resolvedTime: string;
  adjustment: "none" | "gap_forward" | "earlier_overlap";
} {
  calendarDate.parse(date);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new RangeError("A valid local time is required.");
  const fmt = formatter(timeZone);
  const naive = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set<number>();
  // Sample both sides of every supported timezone's transition; never assume a US offset or DST hour.
  for (const hours of [-36, -12, 0, 12, 36]) {
    const ms = naive + hours * 3_600_000;
    const p = localParts(ms, fmt);
    offsets.add(Date.parse(`${p.date}T${p.time}:00Z`) - ms);
  }
  const exact = [...offsets]
    .map((offset) => naive - offset)
    .filter((ms) => {
      const p = localParts(ms, fmt);
      return p.date === date && p.time === time;
    })
    .sort((a, b) => a - b);
  if (exact.length)
    return {
      instantMs: exact[0],
      resolvedDate: date,
      resolvedTime: time,
      adjustment: exact.length > 1 ? "earlier_overlap" : "none",
    };
  // Some named zones skip a whole date. Search a bounded 48-hour range for the first valid wall minute.
  let selected: { ms: number; wall: string; date: string; time: string } | null = null;
  for (let ms = naive - 18 * 3_600_000; ms <= naive + 48 * 3_600_000; ms += 60_000) {
    const p = localParts(ms, fmt);
    const wall = `${p.date}T${p.time}`;
    if (
      wall >= `${date}T${time}` &&
      (!selected || wall < selected.wall || (wall === selected.wall && ms < selected.ms))
    )
      selected = { ms, wall, ...p };
  }
  if (!selected) throw new RangeError("This local time could not be resolved.");
  return {
    instantMs: selected.ms,
    resolvedDate: selected.date,
    resolvedTime: selected.time,
    adjustment: "gap_forward",
  };
}
export function firstOccurrence(schedule: CommunicationSchedule, nowMs: number) {
  const parsed = CommunicationScheduleSchema.parse(schedule);
  const resolved = resolveWallTime(parsed.firstDate, parsed.time, parsed.timeZone);
  if (resolved.instantMs <= nowMs)
    throw new RangeError(
      "The first scheduled send must be in the future. Use Send now for an immediate message.",
    );
  if (parsed.endDate && resolved.resolvedDate > parsed.endDate)
    throw new RangeError("The first resolved send is after the inclusive end date.");
  return resolved;
}
/** No backlog burst: after a delayed confirmed send, count from its actual local send date. */
export function nextOccurrence(
  schedule: CommunicationSchedule,
  sentAtMs: number,
  confirmedCount: number,
): number | null {
  const s = CommunicationScheduleSchema.parse(schedule);
  if (!Number.isSafeInteger(confirmedCount) || confirmedCount < 1)
    throw new RangeError("A confirmed send count is required.");
  if (s.everyDays === null || (s.sendLimit !== null && confirmedCount >= s.sendLimit))
    return null;
  const date = addCalendarDays(localDateAt(sentAtMs, s.timeZone), s.everyDays);
  if (s.endDate && date > s.endDate) return null;
  const next = resolveWallTime(date, s.time, s.timeZone);
  return s.endDate && next.resolvedDate > s.endDate ? null : next.instantMs;
}
