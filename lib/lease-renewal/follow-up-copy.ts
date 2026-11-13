// S276 R-S276-7 / R-S276-8 (ARCH-S276-3): the tenant offer review's follow-up form opens filled in.
//
// The starting values are one projection: the subject of the offer being reviewed, the standard
// follow-up message (only once its own copy record reads back approved), the renewal notice rules'
// follow-up interval (10 days unless an Admin saved another value), 9:00 AM Central and a total of
// 3 messages, the offer plus two follow-ups. The end date stays blank. They are form state only:
// nothing is authorized until staff tick the option and confirm the existing review, and the
// authorization stores exactly what staff confirmed (S189 R-S189-9 as amended).
//
// The follow-up copy is its own versioned copy record, separate from the tenant offer copy
// (`SUPPLIED_RENEWAL_COPY`), so the offer's published wording and every tenant message in flight
// are untouched. It uses the offer's existing terms sentence, the first-name greeting and the
// sender sign-off; the review appends the sender signature as it does for any follow-up.
//
// Pure and client-safe.

import { BUSINESS_TIME_ZONE } from "@/lib/lease-renewal/business-calendar";
import { formatCalendarDate } from "@/lib/date-display";
import {
  SUPPLIED_RENEWAL_COPY,
  greetingFirstNames,
  messageMoney,
  missingValueMarker,
} from "@/lib/lease-renewal/renewal-message-content";
import { DEFAULT_NOTICE_RULE_VALUES } from "@/lib/lease-renewal/notice-rules";

/** R-S276-8: the standard follow-up copy, version 1.0. The offer's terms sentence is reused as is. */
export const FOLLOW_UP_COPY = Object.freeze({
  version: "v1.0" as const,
  authority: "owner-direction:s276-staff-workflow-audit-2026-11-12" as const,
  ref: "tenant-follow-up:v1.0" as const,
  opening:
    "We are following up on your lease renewal offer for {{property_address}}. Your lease ends on {{lease_end_date}}.",
  terms: SUPPLIED_RENEWAL_COPY.tenant.terms,
  closing:
    "Please let us know whether you plan to stay or leave, and we'll get the documents out if you plan to stay.",
  signoff: SUPPLIED_RENEWAL_COPY.signoff,
});

/** R-S276-7: the fixed starting timing. The interval comes from the notice rules. */
export const FOLLOW_UP_START = Object.freeze({
  time: "09:00",
  timeZone: BUSINESS_TIME_ZONE,
  /** The offer plus two follow-ups. */
  sendLimit: 3,
});

/** The words the follow-up form shows about its starting values. */
export const FOLLOW_UP_START_WORDS = Object.freeze({
  unpublished:
    "The standard follow-up message is not published yet. Write the follow-up, or ask a template approver to publish it.",
});

/** R-S276-7: the one line under the legend, for the interval the form opened with. */
export function followUpStartLine(intervalDays: number, published: boolean): string {
  const every = intervalDays === 1 ? "every day" : `every ${intervalDays} days`;
  return published
    ? `Filled in to start: ${every} at 9:00 AM Central, 3 messages in total, and the standard follow-up message. Change anything before you review.`
    : `Filled in to start: ${every} at 9:00 AM Central, 3 messages in total. Change anything before you review.`;
}

/** The reviewed facts the follow-up message is filled from: the same facts the offer states. */
export interface FollowUpFacts {
  readonly address: string | null;
  readonly leaseEndDate: string | null;
  readonly rent: number | null;
  readonly effectiveDate: string | null;
  readonly endDate: string | null;
  readonly names: readonly string[];
  readonly firstNames?: readonly (string | null)[];
}

function fill(copy: string, values: Record<string, string>): string {
  return copy.replace(/\{\{([a-z_]+)\}\}/g, (token, key: string) => values[key] ?? token);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * R-S276-8: the standard follow-up body as plain text, paragraphs separated by a blank line: the
 * first-name greeting, the follow-up opening, the offer's terms sentence with the reviewed rent and
 * dates, the closing request and the sign-off. A value the lease does not have yet is the same named
 * marker the offer uses, so the existing outgoing check refuses it rather than a guess going out.
 */
export function composeFollowUpBody(facts: FollowUpFacts): string {
  const greeting = greetingFirstNames({
    names: [...facts.names],
    ...(facts.firstNames ? { firstNames: [...facts.firstNames] } : {}),
  });
  const money = (value: number | null) => {
    const parsed = messageMoney.safeParse(value);
    return parsed.success
      ? parsed.data.toLocaleString("en-US", { style: "currency", currency: "USD" })
      : null;
  };
  const day = (value: string | null) =>
    value && ISO_DATE.test(value) ? formatCalendarDate(value) : null;
  const address = facts.address?.trim() || null;
  const rent = money(facts.rent);
  const start = day(facts.effectiveDate);
  const end = day(facts.endDate);
  return [
    greeting.known.length ? `Hello ${greeting.known.join(" and ")},` : "Hello,",
    fill(FOLLOW_UP_COPY.opening, {
      property_address: address ?? missingValueMarker("property address"),
      lease_end_date: day(facts.leaseEndDate) ?? missingValueMarker("lease end date"),
    }),
    fill(FOLLOW_UP_COPY.terms, {
      rent: rent ?? missingValueMarker("renewal rent"),
      start: start ?? missingValueMarker("renewal start date"),
      end: end ?? missingValueMarker("renewal end date"),
    }),
    FOLLOW_UP_COPY.closing,
    FOLLOW_UP_COPY.signoff,
  ].join("\n\n");
}

/**
 * What the composition read carries for the follow-up form: the notice rules' interval, whether
 * the follow-up copy reads back approved, and the composed body (null while it is not published).
 */
export interface FollowUpStartRead {
  readonly intervalDays: number;
  readonly published: boolean;
  readonly body: string | null;
}

/** R-S276-7: the form's starting values, as strings for its fields. */
export interface FollowUpStartingValues {
  readonly subject: string;
  readonly body: string;
  readonly everyDays: string;
  readonly time: string;
  readonly timeZone: string;
  readonly endDate: string;
  readonly sendLimit: string;
  readonly published: boolean;
  readonly line: string;
}

/** A usable interval, or the notice rules' default when the read carried none. */
function usableInterval(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 366
    ? value
    : DEFAULT_NOTICE_RULE_VALUES.followUpIntervalDays;
}

/**
 * ARCH-S276-3: the one projection of the starting values. With the copy unpublished (or the read
 * absent) the timing is filled in and the message is blank.
 */
export function followUpStartingValues(input: {
  readonly subject: string;
  readonly start: FollowUpStartRead | null;
}): FollowUpStartingValues {
  const intervalDays = usableInterval(input.start?.intervalDays);
  const published = Boolean(input.start?.published && input.start.body);
  return {
    subject: input.subject,
    body: published ? input.start!.body! : "",
    everyDays: String(intervalDays),
    time: FOLLOW_UP_START.time,
    timeZone: FOLLOW_UP_START.timeZone,
    endDate: "",
    sendLimit: String(FOLLOW_UP_START.sendLimit),
    published,
    line: followUpStartLine(intervalDays, published),
  };
}
