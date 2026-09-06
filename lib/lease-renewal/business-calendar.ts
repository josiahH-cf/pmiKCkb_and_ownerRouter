// The business calendar. PMI KC operates on America/Chicago, so every "today", "this month", and
// renewal window on the desk, the workspace, the Dashboard assistant, and the production oracle
// must read the same calendar day. Deriving it from the UTC date instead showed next month's
// window for the last evening hours of every month while the operator's own calendar still said
// this month, and the assistant (which already read Kansas City time) disagreed with the table.

export const BUSINESS_TIME_ZONE = "America/Chicago";

const BUSINESS_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The `YYYY-MM-DD` calendar date of an instant in the business time zone. */
export function businessDateIso(at: Date | number | string): string {
  const date = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(date.getTime())) throw new Error("business_date_invalid");
  const parts = BUSINESS_DATE_FORMAT.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** The `YYYY-MM` calendar month of an instant in the business time zone. */
export function businessMonth(at: Date | number | string): string {
  return businessDateIso(at).slice(0, 7);
}
