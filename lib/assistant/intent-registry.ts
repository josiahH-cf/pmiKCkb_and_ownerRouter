// S110 assistant intent registry: the closed, versioned set of questions the Dashboard assistant can
// answer, and the deterministic matcher that maps a phrasing onto one of them.
//
// The registry is closed on purpose. There is no generic query language and no model-authored fact:
// a question either matches one of these three read-only intents, needs exactly one clarification, or
// receives the bounded unsupported response naming what can be asked. Nothing here reads a record,
// writes, or reaches a provider.

export const ASSISTANT_QUERY_VERSION = "assistant-query/v1";

export const ASSISTANT_INTENTS = [
  "work.assigned_today",
  "renewal.blocked",
  "renewal.window",
] as const;

export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];

export interface AssistantIntentFilters {
  /** `renewal.window` only: the exact `YYYY-MM` the question resolved to. */
  readonly month?: string;
}

export type AssistantIntentMatch =
  | {
      readonly kind: "matched";
      readonly intent: AssistantIntent;
      readonly filters: AssistantIntentFilters;
    }
  | { readonly kind: "clarify"; readonly question: string }
  | { readonly kind: "unsupported" };

/** The exact questions the assistant answers today, in the operator's own words. */
export const ASSISTANT_SUPPORTED_QUESTIONS: readonly string[] = [
  "What work is assigned to me today?",
  "What renewal blockers do I currently have?",
  "Which renewals come up next month?",
];

export function unsupportedAssistantResponse(): {
  readonly message: string;
  readonly supported: readonly string[];
} {
  return {
    message: "The assistant answers three questions right now.",
    supported: ASSISTANT_SUPPORTED_QUESTIONS,
  };
}

function normalize(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WORK_TERMS = [
  "work",
  "task",
  "tasks",
  "assigned",
  "my work",
  "to do",
  "todo",
  "do i have",
  "have on",
  "on my plate",
];
const TODAY_TERMS = ["today", "on today", "for today", "right now"];
const RENEWAL_TERMS = ["renewal", "renewals", "lease renewal", "leases"];
const BLOCKED_TERMS = ["blocker", "blockers", "blocked", "stuck", "held up"];
const PERIOD_TERMS = ["month", "coming up", "come up", "due", "upcoming", "next"];

function hits(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

/** Shift a `YYYY-MM` by whole months without leaving the calendar the operator reads. */
function shiftMonth(monthIso: string, delta: number): string {
  const [year, month] = monthIso.split("-").map(Number);
  const zeroBased = year * 12 + (month - 1) + delta;
  return `${String(Math.floor(zeroBased / 12)).padStart(4, "0")}-${String((zeroBased % 12) + 1).padStart(2, "0")}`;
}

/**
 * The Kansas City calendar month for an instant. The desk and the operator both read America/Chicago,
 * so `next month` must mean the same month on both surfaces.
 */
export function kansasCityMonth(nowIso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(nowIso));
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

/** An exact `YYYY-MM` in the question is itself a period signal, with or without a period word. */
const EXPLICIT_MONTH = /\b\d{4}-(?:0[1-9]|1[0-2])\b/;

function parseMonth(text: string, nowIso: string): string | null {
  const explicit = /\b(\d{4})-(0[1-9]|1[0-2])\b/.exec(text);
  if (explicit) return `${explicit[1]}-${explicit[2]}`;
  const current = kansasCityMonth(nowIso);
  if (text.includes("next month")) return shiftMonth(current, 1);
  if (text.includes("this month") || text.includes("current month")) return current;
  if (text.includes("last month") || text.includes("previous month")) {
    return shiftMonth(current, -1);
  }
  return null;
}

/**
 * Map one question onto a closed intent. Blocked renewals win over the period intent when both read
 * as renewal questions, because a blocker question is about state and never about a month.
 */
export function matchAssistantIntent(
  question: string,
  nowIso: string,
): AssistantIntentMatch {
  const text = normalize(question);
  if (text === "") return { kind: "unsupported" };

  const renewal = hits(text, RENEWAL_TERMS);
  if (renewal && hits(text, BLOCKED_TERMS)) {
    return { kind: "matched", intent: "renewal.blocked", filters: {} };
  }
  const explicitMonth = EXPLICIT_MONTH.test(text);
  if (renewal && (explicitMonth || hits(text, PERIOD_TERMS))) {
    const month = parseMonth(text, nowIso);
    return month
      ? { kind: "matched", intent: "renewal.window", filters: { month } }
      : {
          kind: "clarify",
          question:
            "Which month do you mean? Say this month, next month, or an exact month like 2026-10.",
        };
  }
  if (hits(text, WORK_TERMS) && hits(text, TODAY_TERMS)) {
    return { kind: "matched", intent: "work.assigned_today", filters: {} };
  }
  return { kind: "unsupported" };
}
