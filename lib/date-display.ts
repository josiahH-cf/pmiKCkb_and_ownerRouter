/**
 * S126 (F06): the one app-owned date presentation convention. Every app-controlled full calendar
 * date reads MM/DD/YYYY (a documented implementation default within the approved month/day/year
 * requirement); month-only views read as a month name and year; audit timestamps keep their time
 * and an explicit business time zone after the calendar date.
 *
 * Presentation only. Calendar dates stay canonical YYYY-MM-DD everywhere else (storage, URLs,
 * sort keys, hashes, provider payloads); a date-only value is never passed through a time zone, so
 * midnight UTC can never shift it by a day. Missing values read as an explicit unavailable label,
 * malformed or impossible values as an explicit invalid label; nothing here throws, normalizes or
 * rewrites a stored value.
 */
import { BUSINESS_TIME_ZONE } from "@/lib/lease-renewal/business-calendar";

export const CALENDAR_DATE_DISPLAY_FORMAT = "MM/DD/YYYY";
export const DATE_UNAVAILABLE_LABEL = "Not available";
export const DATE_INVALID_LABEL = "Invalid date";
export const MONTH_INVALID_LABEL = "Invalid month";
export const TIMESTAMP_INVALID_LABEL = "Invalid timestamp";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export interface CalendarDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Strict YYYY-MM-DD parse of a real calendar date; anything else (times, slashes, 02/30) is null. */
export function parseCalendarDate(value: unknown): CalendarDateParts | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Validate the day against the month with UTC arithmetic only; no local time zone is consulted.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export type CalendarDateDisplay =
  | { readonly state: "date"; readonly iso: string; readonly label: string }
  | { readonly state: "unavailable"; readonly label: string }
  | { readonly state: "invalid"; readonly original: string; readonly label: string };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Typed display outcome so a surface can distinguish a missing date from a bad one. */
export function describeCalendarDate(
  value: string | null | undefined,
  unavailableLabel: string = DATE_UNAVAILABLE_LABEL,
): CalendarDateDisplay {
  if (value === null || value === undefined || value.trim() === "")
    return { state: "unavailable", label: unavailableLabel };
  const parts = parseCalendarDate(value);
  if (!parts) return { state: "invalid", original: value, label: DATE_INVALID_LABEL };
  return {
    state: "date",
    iso: value,
    label: `${pad(parts.month)}/${pad(parts.day)}/${String(parts.year).padStart(4, "0")}`,
  };
}

/** MM/DD/YYYY for a canonical calendar date; the unavailable label when missing; Invalid date otherwise. */
export function formatCalendarDate(
  value: string | null | undefined,
  unavailableLabel: string = DATE_UNAVAILABLE_LABEL,
): string {
  return describeCalendarDate(value, unavailableLabel).label;
}

/** "September 2026" for a canonical YYYY-MM month; explicit labels for missing or invalid input. */
export function formatCalendarMonth(
  value: string | null | undefined,
  unavailableLabel: string = DATE_UNAVAILABLE_LABEL,
): string {
  if (value === null || value === undefined || value.trim() === "")
    return unavailableLabel;
  const match = ISO_MONTH.exec(value);
  if (!match) return MONTH_INVALID_LABEL;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return MONTH_INVALID_LABEL;
  return `${MONTH_NAMES[month - 1]} ${match[1]}`;
}

/** "MM/DD/YYYY through MM/DD/YYYY"; each side keeps its own unavailable or invalid label. */
export function formatCalendarDateRange(
  from: string | null | undefined,
  through: string | null | undefined,
  unavailableLabel: string = DATE_UNAVAILABLE_LABEL,
): string {
  return `${formatCalendarDate(from, unavailableLabel)} through ${formatCalendarDate(through, unavailableLabel)}`;
}

/** A value that may be a calendar date or an instant: the date reads MM/DD/YYYY, an instant with its time and zone. */
export function formatCalendarDateOrTimestamp(
  value: string | null | undefined,
  unavailableLabel: string = DATE_UNAVAILABLE_LABEL,
): string {
  if (value === null || value === undefined || value.trim() === "")
    return unavailableLabel;
  return parseCalendarDate(value)
    ? formatCalendarDate(value, unavailableLabel)
    : formatBusinessTimestamp(value, unavailableLabel);
}

const BUSINESS_TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/**
 * A true instant rendered in the business time zone as "MM/DD/YYYY, h:mm AM CDT". The instant is
 * never moved; an unparseable value reads as an explicit invalid label, never as the epoch or today.
 */
export function formatBusinessTimestamp(
  value: string | number | Date | null | undefined,
  unavailableLabel: string = DATE_UNAVAILABLE_LABEL,
): string {
  if (value === null || value === undefined || value === "") return unavailableLabel;
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return TIMESTAMP_INVALID_LABEL;
  return BUSINESS_TIMESTAMP_FORMAT.format(instant);
}
