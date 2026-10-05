// S138 question interpretation. The selected Gemini model maps ordinary language onto the closed
// ConversationPlan; the server validates it and falls back to this deterministic interpreter when the
// model is unavailable, slow, throttled or returns an invalid plan. The model sees the question, the
// business date and earlier plans only: never a record, a name from a record, an id, or an actor.

import {
  CONVERSATION_PLAN_JSON_SCHEMA,
  ConversationPlanSchema,
  EMPTY_FILTERS,
  type ConversationPlan,
  type ConversationTurn,
  type DatePreset,
  type LeaseDateField,
  type PeopleMatch,
  type PlanFilters,
  type PlanSubject,
} from "@/lib/assistant/conversation-plan";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import type { ModelProvider } from "@/lib/llm/model-provider";
import { measureRead, withReadDeadline } from "@/lib/observability/read-lifetime";

export type InterpretedBy = "model" | "deterministic";

export interface Interpretation {
  readonly plan: ConversationPlan;
  readonly interpretedBy: InterpretedBy;
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const SUBJECT_PATTERNS: ReadonlyArray<[PlanSubject, RegExp]> = [
  [
    "leases",
    /\b(leases?|renewals?|tenants?|owners?|propert(?:y|ies)|units?|move[- ]?outs?)\b/,
  ],
  [
    "work",
    /\b(work|tasks?|to[- ]?dos?|my plate|work items?|assignments?|what do i have|do i have on)\b/,
  ],
  [
    "approvals",
    /\b(approvals?|approve|approver|approval queue|decisions?|sign[- ]?offs?)\b/,
  ],
  [
    "connections",
    /\b(connect(?:ed|ions?)?|integrations?|applications?|apps?|synced?|stale|out of date|outdated|freshness|needs? updating)\b/,
  ],
  ["processes", /\b(process(?:es)?|workflows?|workflow runs?|process runs?)\b/],
  ["maintenance", /\b(maintenance|tickets?|work orders?|repairs?|vendors?)\b/],
  [
    "communications",
    /\b(emails?|messages?|communications?|contacted|repl(?:y|ies)|threads?|recorded communication)\b/,
  ],
];

const KNOWLEDGE_PATTERN =
  /\b(polic(?:y|ies)|how (?:do|should|can) (?:i|we)|what is the (?:process|procedure) for|procedures?|handbook|sop|rules?|allowed|required by)\b/;

const ORDINALS: ReadonlyArray<[RegExp, number]> = [
  [/\b(first|1st)\b/, 1],
  [/\b(second|2nd)\b/, 2],
  [/\b(third|3rd)\b/, 3],
  [/\b(fourth|4th)\b/, 4],
  [/\b(fifth|5th)\b/, 5],
  [/\b(sixth|6th)\b/, 6],
  [/\b(seventh|7th)\b/, 7],
  [/\b(eighth|8th)\b/, 8],
  [/\b(ninth|9th)\b/, 9],
  [/\b(tenth|10th)\b/, 10],
];

function normalize(question: string): string {
  return question
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'#\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRange(
  text: string,
  nowIso: string,
): { preset: DatePreset; month: string | null } | null {
  const explicit = /\b(\d{4})-(0[1-9]|1[0-2])\b/.exec(text);
  if (explicit) return { preset: "month", month: `${explicit[1]}-${explicit[2]}` };
  // "Late fees" or "late rent" name a charge or a policy, not an overdue period.
  if (
    /\b(overdue|past due)\b|\blate\b(?! (?:fees?|rent|charges?|payments?|notices?))/.test(
      text,
    )
  )
    return { preset: "overdue", month: null };
  if (/\btoday\b/.test(text)) return { preset: "today", month: null };
  if (/\bnext week\b/.test(text)) return { preset: "next_week", month: null };
  if (/\b(this|current) week\b/.test(text)) return { preset: "this_week", month: null };
  if (/\bnext month\b/.test(text)) return { preset: "next_month", month: null };
  if (/\b(this|current) month\b/.test(text)) return { preset: "this_month", month: null };
  if (/\b(last|previous) month\b/.test(text))
    return { preset: "last_month", month: null };
  const today = businessDateIso(nowIso);
  for (const [index, name] of MONTH_NAMES.entries()) {
    const match = new RegExp(`\\b${name}(?:\\s+(\\d{4}))?\\b`).exec(text);
    if (!match || (name === "may" && !match[1] && !/\bin may\b/.test(text))) continue;
    const month = String(index + 1).padStart(2, "0");
    const currentYear = Number(today.slice(0, 4));
    const year = match[1]
      ? Number(match[1])
      : `${currentYear}-${month}` < today.slice(0, 7)
        ? currentYear + 1
        : currentYear;
    return { preset: "month", month: `${year}-${month}` };
  }
  return null;
}

function parsePeople(question: string): { names: string[]; match: PeopleMatch | null } {
  const found =
    /\b(assigned or related to|related or assigned to|assigned to|related to|belonging to|owned by|for owner|for tenant|with)\s+([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)?(?:\s*,\s*(?:or\s+|and\s+)?[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)?)*(?:\s*,?\s+(?:and|or)\s+[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)?)?)/.exec(
      question,
    );
  if (!found) return { names: [], match: null };
  const names = found[2]
    .split(/\s*,\s*(?:or\s+|and\s+)?|\s+(?:and|or)\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^(me|myself)$/i.test(part))
    .slice(0, 5);
  const relation = found[1].toLowerCase();
  const match: PeopleMatch =
    relation.includes("assigned") && relation.includes("related")
      ? "assigned_or_related"
      : relation === "assigned to"
        ? "assigned"
        : "related";
  return { names, match: names.length ? match : null };
}

function parseDateField(text: string): LeaseDateField | null {
  if (
    /\bnotice (?:deadlines?|dates?|periods?|due)\b|\bdeadline to give notice\b/.test(text)
  )
    return "notice_deadline";
  if (/\bfollow[- ]?ups?\b/.test(text)) return "follow_up_due";
  if (/\b(?:ends?|ending|expir\w*|lease end|end dates?)\b/.test(text)) return "lease_end";
  return null;
}

function parseAddressText(question: string): string | null {
  const match = /\b\d{1,6}\s+[A-Za-z0-9][A-Za-z0-9.' -]{1,60}?(?=[?,.]|$)/.exec(question);
  return match ? match[0].trim().slice(0, 120) : null;
}

/** An identity candidate is a lookup, not an assertion that this person/property exists. */
function bareIdentity(question: string): string | null {
  const candidate = question.trim();
  if (
    !/^[\p{L}][\p{L}\p{N}.'’&-]*(?:\s+[\p{L}][\p{L}\p{N}.'’&-]*){0,4}$/u.test(candidate)
  )
    return null;
  if (
    /\b(how|what|why|who|when|where|can|should|please|send|delete|remove|create|change|update|approve|draft|show|find|list|policy|policies|fees?|weather|records?|message|email|now|next|month|today|mine|tasks?|leases?|renewals?|blocked|connections?|processes?|maintenance)\b/i.test(
      candidate,
    )
  )
    return null;
  return candidate;
}

function isFollowUp(text: string): boolean {
  return (
    /^(only|just|now|and|also|what about|how about|which of (?:those|these|them)|of (?:those|these)|those|these|them|it|that|why is|why are|why)\b/.test(
      text,
    ) ||
    /\b(?:this|that|the same) (?:lease|one|task|ticket|item|run|process|approval|email)\b|\b(?:those|these) (?:leases|ones|tasks|tickets|items|runs|approvals)\b/.test(
      text,
    )
  );
}

/** A reference to one record from the previous answer, such as "this lease" or "that one". */
function refersToOneRecord(text: string): boolean {
  return /\b(?:this|that|the same) (?:lease|one|task|ticket|item|run|process|approval|email)\b/.test(
    text,
  );
}

/** The lease date a short reply names, for completing a date-field clarification. */
export function readDateFieldReply(reply: string): LeaseDateField | null {
  const text = normalize(reply);
  if (/\b(?:lease end|end date|ending|ends?|expir\w*|renewal date)\b/.test(text))
    return "lease_end";
  if (/\bfollow[- ]?ups?\b|\baction timing\b/.test(text)) return "follow_up_due";
  return null;
}

/** Deterministic interpretation: always available, never calls a model. */
export function interpretDeterministically(
  question: string,
  previous: ConversationTurn | null,
  nowIso: string,
): ConversationPlan {
  const text = normalize(question);
  const subjects = SUBJECT_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
    ([subject]) => subject,
  );
  // "Assigned" names work only when no other subject owns the question.
  const ordinal = ORDINALS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
  let followUp =
    previous !== null && (isFollowUp(text) || ordinal !== null || subjects.length === 0);
  const range = parseRange(text, nowIso);
  const people = parsePeople(question);
  const identity = bareIdentity(question);
  const address = parseAddressText(question);
  if ((identity || (address && subjects.length === 0)) && previous?.awaiting !== "person")
    followUp = false;
  if (identity && people.names.length === 0) {
    people.names = [identity];
    people.match = "related";
  }
  const mine = /\b(my|mine|me|assigned to me)\b/.test(text);
  const everyone =
    /\b(everyone|everybody|anyone|all staff|the whole team|team's|whole team)\b/.test(
      text,
    );
  let dateField = parseDateField(text);
  if (dateField === null && range?.preset === "overdue" && subjects.includes("leases"))
    dateField = "follow_up_due";
  const filters: PlanFilters = {
    ...EMPTY_FILTERS,
    range,
    dateField,
    assignee: mine ? "me" : everyone ? "any" : null,
    people: people.names,
    peopleMatch: people.match,
    blocked:
      /\b(blocked|blockers?|stuck|held up|holding (?:it|them|this) up|what is holding)\b/.test(
        text,
      )
        ? true
        : null,
    stale: /\b(stale|out of date|outdated|needs? updating|not updated|freshness)\b/.test(
      text,
    )
      ? true
      : null,
    waitingOnOthers:
      /\b(waiting on (?:someone|somebody|others|another|other people)|someone else)\b/.test(
        text,
      )
        ? true
        : null,
    // "My approval queue" names the queue; only asking for items awaiting this actor sets the filter.
    needsMyApproval:
      /\b(my approval(?! queue)|can i approve|i can approve|for me to approve|needs? me to approve|need(?:s)? my)\b/.test(
        text,
      )
        ? true
        : null,
    includeClosed: /\b(active|current window|in the window)\b/.test(text)
      ? false
      : people.match === "related" ||
          address !== null ||
          /\b(completed|closed|finished|cancelled|including done)\b/.test(text)
        ? true
        : null,
    text: address,
  };
  const detail =
    /\b(why|status|details?|what happened|what is holding|recorded communications?)\b/.test(
      text,
    ) &&
    (ordinal !== null || filters.text !== null || followUp || refersToOneRecord(text));

  let resolvedSubjects = subjects;
  if (identity || (address && resolvedSubjects.length === 0))
    resolvedSubjects = ["leases"];
  if (followUp && resolvedSubjects.length === 0 && previous)
    resolvedSubjects = [...previous.plan.subjects];
  if (
    resolvedSubjects.includes("leases") &&
    resolvedSubjects.includes("work") &&
    !/\b(work|tasks?|to[- ]?dos?)\b/.test(text)
  )
    resolvedSubjects = resolvedSubjects.filter((subject) => subject !== "work");
  // "Renewal tasks" or "lease work" names the actor's work about renewals (S110), not lease records.
  if (/\b(?:renewal|lease)s? (?:tasks?|work|to[- ]?dos?)\b/.test(text))
    resolvedSubjects = resolvedSubjects.filter((subject) => subject !== "leases");
  if (/\bassigned\b/.test(text) && resolvedSubjects.length === 0)
    resolvedSubjects = ["work"];

  const knowledge = KNOWLEDGE_PATTERN.test(text);
  if (resolvedSubjects.length === 0) {
    return {
      kind: knowledge ? "knowledge" : "unsupported",
      subjects: [],
      filters,
      followUp: { usePrevious: false, ordinal: null, detail: false },
      clarification: null,
      unsupportedTopic: knowledge ? null : "this topic",
    };
  }

  const periodWord = /\b(coming up|come up|upcoming|due|soon|expiring|ending)\b/.test(
    text,
  );
  if (
    resolvedSubjects.includes("leases") &&
    periodWord &&
    !range &&
    !filters.blocked &&
    !followUp &&
    filters.text === null &&
    filters.dateField !== "follow_up_due" &&
    filters.dateField !== "notice_deadline"
  ) {
    return {
      kind: "clarify",
      subjects: resolvedSubjects.slice(0, 4),
      filters,
      followUp: { usePrevious: false, ordinal: null, detail: false },
      clarification:
        "Which period do you mean? For example this week, next month, or an exact month like 2026-11.",
      unsupportedTopic: null,
    };
  }

  return {
    kind: knowledge ? "mixed" : "operational",
    subjects: resolvedSubjects.slice(0, 4),
    filters,
    followUp: { usePrevious: followUp, ordinal, detail },
    clarification: null,
    unsupportedTopic: null,
  };
}

export const INTERPRETER_SYSTEM_INSTRUCTION = [
  "You translate one staff question for a property-management application into a JSON query plan.",
  "You never answer the question and never invent records, ids, people or dates.",
  "Subjects: leases (lease renewals, lease end dates, owners, tenants, properties, blockers), work (My Work tasks and assignments), approvals (the Approval Queue and renewal decisions), connections (connected applications, integrations, data freshness and stale data), processes (Internal Process definitions and runs), maintenance (tickets and work orders), communications (workflow-linked email records).",
  "kind: operational for questions about records; knowledge for policy, how-to or procedure questions answered by documents; mixed when both; clarify when a required detail is missing and would change the answer; unsupported when the question is about records outside these subjects (set unsupportedTopic).",
  "Dates use the business calendar the user gives you. range.preset: today, this_week, next_week, this_month, next_month, last_month, overdue, month (with month YYYY-MM), or none. If the user asks what is coming up or due for leases with no period, use kind clarify and ask which period.",
  "dateField applies to leases only: lease_end when the user says due, coming up, ending, expiring or renewing (the lease end date is the renewal date); follow_up_due when the user asks about follow-ups or overdue renewal follow-ups; notice_deadline only when the user explicitly says notice deadline or notice date; none otherwise.",
  "assignee: me only when the user says my, mine or assigned to me about work or leases; any when the user asks about everyone; none otherwise. A question such as what renewal blockers do I have asks about the renewals the user can see, not an assignment, so assignee stays none. An approval queue is already the user's own; do not set assignee for approvals.",
  "people: copy the names the user wrote exactly, never a name the user did not write. peopleMatch: assigned when the names are staff the records are assigned to; related when they are owners, tenants or other parties; assigned_or_related when the user says assigned or related; none when people is empty.",
  "blocked, stale, waitingOnOthers, needsMyApproval and includeClosed are true only when the user asks for them; otherwise null. text holds an address or record words the user typed to find one record; otherwise null.",
  "Follow-ups: when the question refers to the previous answer (only mine, now next month, which of those, why is the second one blocked), set followUp.usePrevious true, keep subjects from the previous plan unless the user names a new subject, and set only the filters the user changes (leave others null or none so they carry over). Set followUp.ordinal for the first, second or nth result, and followUp.detail true for why, status or details questions about specific records.",
  "Return only the JSON object for the schema.",
].join("\n");

export interface ModelInterpreterOptions {
  readonly provider: ModelProvider;
  readonly model: string;
  readonly timeoutMs?: number;
}

/**
 * Ask the model for a plan. Returns null when the model fails, times out, or returns a plan that
 * does not validate, so the caller falls back to the deterministic interpreter instead of refusing.
 */
export async function interpretWithModel(
  question: string,
  previous: readonly ConversationTurn[],
  nowIso: string,
  options: ModelInterpreterOptions,
): Promise<ConversationPlan | null> {
  const payload = {
    today: businessDateIso(nowIso),
    timeZone: "America/Chicago",
    weekStartsOn: "Monday",
    previous: previous
      .slice(-3)
      .map((turn) => ({ question: turn.question, plan: turn.plan })),
    question,
  };
  try {
    const response = await measureRead("assistant.interpretation", () =>
      withReadDeadline(
        () =>
          options.provider.generateText({
            purpose: "assistant.interpret",
            model: options.model,
            systemInstruction: INTERPRETER_SYSTEM_INSTRUCTION,
            userContent: JSON.stringify(payload),
            temperature: 0,
            responseJsonSchema: CONVERSATION_PLAN_JSON_SCHEMA,
            timeoutMs: options.timeoutMs ?? 15_000,
          }),
        options.timeoutMs ?? 15_000,
      ),
    );
    const text = response.text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");
    const parsed = ConversationPlanSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.error(
      `Assistant interpretation fell back to the deterministic interpreter (${error instanceof Error ? error.name : "unknown"}).`,
    );
    return null;
  }
}
