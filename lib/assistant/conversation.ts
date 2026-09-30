// S138 Dashboard conversation. One ordinary-language question, optionally continuing the same page
// session, answered from the shared S137 operational context. The interpreter (model or deterministic)
// only proposes a closed plan; this module grounds that plan in what the user actually wrote, merges
// follow-ups, and executes it against the actor-scoped reads, so every record, count, date and link
// comes from an owning service. Nothing here writes, sends, drafts, starts a run, or refreshes a
// provider. A denied, failed or partial source is reported as exactly that, never as an empty result.

import { createHash } from "node:crypto";

import {
  inBusinessRange,
  resolveBusinessRange,
  type BusinessRange,
} from "@/lib/assistant/business-dates";
import {
  MAX_CONTEXT_TURNS,
  type AwaitingDetail,
  type ConversationContext,
  type ConversationPlan,
  type ConversationTurn,
  type PlanFilters,
  type PlanSubject,
} from "@/lib/assistant/conversation-plan";
import {
  interpretDeterministically,
  readDateFieldReply,
  type InterpretedBy,
} from "@/lib/assistant/interpret";
import { taskNeedsAttentionToday } from "@/lib/assistant/work-adapter";
import { formatBusinessTimestamp, formatCalendarDate } from "@/lib/date-display";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  RENEWAL_DESK_RANGE_MAX_DAYS,
  inclusiveRangeDays,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";
import { buildDeskHref } from "@/lib/lease-renewal/desk-view-continuation";
import {
  OPERATIONAL_SOURCE_VIEWS,
  type ApprovalRecordFacts,
  type KnownPerson,
  type OperationalContext,
  type OperationalRecord,
  type OperationalRecordRef,
  type OperationalSource,
  type SourceReadStatus,
  type TypedSourceRead,
} from "@/lib/operational-context/types";

export const ASSISTANT_CONVERSATION_VERSION = "assistant-conversation/v1";
/** Records listed per group; the group always states its full count and links the owning view. */
export const MAX_ITEMS_PER_GROUP = 25;
const MAX_TURN_REFS = 100;

export type ConversationAnswerKind =
  | "answer"
  | "clarification"
  | "knowledge"
  | "unsupported";

export interface AnswerItem {
  readonly ref: OperationalRecordRef;
  readonly title: string;
  readonly detail: string;
  readonly blockers: readonly string[];
  readonly href: string;
  /** Recorded facts shown only when the question asked about this one record. */
  readonly facts?: readonly string[];
}

export interface AnswerGroup {
  readonly source: OperationalSource;
  readonly title: string;
  /** One sentence with the count, in the owning view's terms. */
  readonly summary: string;
  readonly status: SourceReadStatus;
  /** Every matching record, not only the listed ones. */
  readonly total: number;
  readonly items: readonly AnswerItem[];
  readonly notes: readonly string[];
  readonly link: { readonly label: string; readonly href: string } | null;
}

export interface ConversationAnswer {
  readonly version: typeof ASSISTANT_CONVERSATION_VERSION;
  readonly kind: ConversationAnswerKind;
  readonly summary: string;
  /** How the question was read: the exact dates, date field, people and carried context. */
  readonly interpretation: readonly string[];
  readonly groups: readonly AnswerGroup[];
  readonly clarification: string | null;
  /** When set, the Dashboard also asks the knowledge answer this question. */
  readonly knowledgeQuestion: string | null;
  readonly interpretedBy: InterpretedBy;
  /** The page-session context to send with the next question. */
  readonly conversation: ConversationContext;
  /** True when the supplied context belonged to another sign-in and was discarded. */
  readonly contextReset: boolean;
}

export interface ConversationRequest {
  readonly question: string;
  readonly conversation?: ConversationContext | null;
}

export type ModelInterpreter = (
  question: string,
  previous: readonly ConversationTurn[],
  nowIso: string,
) => Promise<ConversationPlan | null>;

export interface ConversationDependencies {
  readonly nowIso: string;
  /** Derived from the signed-in actor; never read from the request. */
  readonly actorKey: string;
  readonly context: OperationalContext;
  /** The model interpreter, or null to use the deterministic interpreter only. */
  readonly interpret: ModelInterpreter | null;
}

/** A stable, non-secret key that ties a page-session context to one sign-in. */
export function conversationActorKey(actorUid: string): string {
  return createHash("sha256")
    .update(`${ASSISTANT_CONVERSATION_VERSION}:${actorUid}`)
    .digest("hex")
    .slice(0, 32);
}

const SUBJECT_SOURCE: Record<PlanSubject, OperationalSource> = {
  leases: "renewals",
  work: "work",
  approvals: "approvals",
  connections: "connections",
  processes: "processes",
  maintenance: "maintenance",
  communications: "communications",
};

const SOURCE_TITLES: Record<OperationalSource, string> = {
  renewals: "Leases",
  work: "My Work",
  approvals: "Approvals",
  connections: "Connections",
  processes: "Internal Processes",
  maintenance: "Maintenance",
  communications: "Recorded communication",
};

const TERMINAL_RUN_STATUSES = new Set(["Completed", "Cancelled", "Failed"]);
const OUTSIDE_WAITING = new Set(["owner", "resident", "vendor", "outside"]);

// ---- Text helpers ----------------------------------------------------------------------------

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(" ") : [];
}

/** Every word of the name appears as a whole word of the label; never a fuzzy or partial match. */
function nameMatches(name: string, label: string): boolean {
  const wanted = tokens(name);
  const words = new Set(tokens(label));
  return wanted.length > 0 && wanted.every((word) => words.has(word));
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function quoteList(names: readonly string[]): string {
  const quoted = names.map((name) => `“${name}”`);
  if (quoted.length <= 1) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} or ${quoted.at(-1)}`;
}

function sentence(
  count: number,
  noun: readonly [string, string],
  clauses: ReadonlyArray<readonly [string, string]>,
): string {
  const phrase = clauses.map(([one, many]) => (count === 1 ? one : many)).join(" and ");
  if (count === 0) return `No ${noun[1]} ${phrase}.`;
  return `${count} ${plural(count, noun[0], noun[1])} ${phrase}.`;
}

// ---- Plan grounding and follow-ups -----------------------------------------------------------

/**
 * Keep only people and record words the user actually wrote in this conversation, so a model can
 * never introduce a name, and drop a follow-up reference when there is nothing to follow.
 */
function groundPlan(
  plan: ConversationPlan,
  question: string,
  turns: readonly ConversationTurn[],
): ConversationPlan {
  const said = ` ${[question, ...turns.map((turn) => turn.question)].map(normalizeText).join(" ")} `;
  const people = plan.filters.people.filter((name) => {
    const normalized = normalizeText(name);
    return normalized !== "" && said.includes(` ${normalized} `);
  });
  const text =
    plan.filters.text &&
    ` ${normalizeText(question)} `.includes(` ${normalizeText(plan.filters.text)} `)
      ? plan.filters.text
      : null;
  return {
    ...plan,
    filters: {
      ...plan.filters,
      people,
      peopleMatch: people.length
        ? (plan.filters.peopleMatch ?? "assigned_or_related")
        : null,
      text,
    },
    followUp: turns.length
      ? plan.followUp
      : { usePrevious: false, ordinal: null, detail: plan.followUp.detail },
  };
}

function cleanNameReply(reply: string): string {
  const cleaned = reply
    .replace(/^(?:i mean|i meant|the one named|named|it is|it's)\s+/i, "")
    .replace(/[?.!,;:]+$/g, "")
    .trim();
  return tokens(cleaned).length > 0 && tokens(cleaned).length <= 5
    ? cleaned.slice(0, 80)
    : "";
}

/** A short reply completes the question the previous clarification asked about. */
function completeClarification(
  plan: ConversationPlan,
  question: string,
  previous: ConversationTurn | null,
): ConversationPlan {
  if (!previous?.awaiting) return plan;
  const newSubject = plan.subjects.some(
    (subject) => !previous.plan.subjects.includes(subject),
  );
  if (newSubject && !plan.followUp.usePrevious) return plan;
  const base: ConversationPlan = {
    ...previous.plan,
    kind: previous.plan.kind === "clarify" ? "operational" : previous.plan.kind,
    clarification: null,
    followUp: {
      usePrevious: false,
      ordinal: null,
      detail: previous.plan.followUp.detail,
    },
  };
  switch (previous.awaiting) {
    case "person": {
      const reply = plan.filters.people.length
        ? [...plan.filters.people]
        : [cleanNameReply(question)].filter(Boolean);
      if (reply.length === 0) return plan;
      const kept = previous.plan.filters.people.filter(
        (name) => !reply.some((answer) => nameMatches(name, answer)),
      );
      return {
        ...base,
        filters: { ...base.filters, people: [...kept, ...reply].slice(0, 5) },
      };
    }
    case "date_field": {
      const field = plan.filters.dateField ?? readDateFieldReply(question);
      if (!field || field === "notice_deadline") return plan;
      return { ...base, filters: { ...base.filters, dateField: field } };
    }
    case "period": {
      if (!plan.filters.range) return plan;
      return {
        ...base,
        filters: {
          ...base.filters,
          range: plan.filters.range,
          dateField: plan.filters.dateField ?? base.filters.dateField,
        },
      };
    }
  }
}

function overlayFilters(prior: PlanFilters, next: PlanFilters): PlanFilters {
  return {
    range: next.range ?? prior.range,
    dateField: next.dateField ?? prior.dateField,
    assignee: next.assignee ?? prior.assignee,
    people: next.people.length ? next.people : prior.people,
    peopleMatch: next.people.length ? next.peopleMatch : prior.peopleMatch,
    blocked: next.blocked ?? prior.blocked,
    stale: next.stale ?? prior.stale,
    waitingOnOthers: next.waitingOnOthers ?? prior.waitingOnOthers,
    needsMyApproval: next.needsMyApproval ?? prior.needsMyApproval,
    includeClosed: next.includeClosed ?? prior.includeClosed,
    text: next.text ?? prior.text,
  };
}

interface EffectivePlan {
  readonly plan: ConversationPlan;
  /** Records from the previous answer that a cross-subject follow-up is limited to. */
  readonly relatedRefs: readonly OperationalRecordRef[];
  readonly continued: boolean;
}

/**
 * A follow-up keeps the previous subjects and filters and changes only what the user changed. A
 * follow-up about a different subject ("which of those need approval?") keeps the previous records
 * instead, so the new answer is limited to what those records link to. Nothing is reused as data:
 * every answer re-reads the owning services.
 */
function mergeWithPrevious(
  plan: ConversationPlan,
  previous: ConversationTurn | null,
): EffectivePlan {
  if (!previous || !plan.followUp.usePrevious) {
    return { plan, relatedRefs: [], continued: false };
  }
  const prior = previous.plan;
  const subjects = plan.subjects.length ? plan.subjects : prior.subjects;
  const sameSubjects = subjects.every((subject) => prior.subjects.includes(subject));
  const kind =
    plan.kind === "clarify"
      ? "clarify"
      : plan.kind === "knowledge" || plan.kind === "unsupported"
        ? prior.kind === "knowledge"
          ? "knowledge"
          : "operational"
        : plan.kind;
  return {
    plan: {
      ...plan,
      kind,
      subjects,
      filters: sameSubjects ? overlayFilters(prior.filters, plan.filters) : plan.filters,
    },
    relatedRefs: sameSubjects ? [] : previous.refs,
    continued: true,
  };
}

// ---- Execution -------------------------------------------------------------------------------

interface Execution {
  readonly ctx: OperationalContext;
  readonly nowIso: string;
  readonly today: string;
  readonly plan: ConversationPlan;
  readonly relatedRefs: readonly OperationalRecordRef[];
  readonly interpretation: string[];
}

interface Related {
  readonly leaseIds: Set<string>;
  readonly ticketIds: Set<string>;
  readonly runIds: Set<string>;
  readonly queueItemIds: Set<string>;
  readonly approvalKeys: Set<string>;
  readonly taskIds: Set<string>;
  readonly linkIds: Set<string>;
}

/** Resolve the previous answer's records into the stable ids other sources link by. */
async function resolveRelated(exec: Execution): Promise<Related | null> {
  if (exec.relatedRefs.length === 0) return null;
  const related: Related = {
    leaseIds: new Set(),
    ticketIds: new Set(),
    runIds: new Set(),
    queueItemIds: new Set(),
    approvalKeys: new Set(),
    taskIds: new Set(),
    linkIds: new Set(),
  };
  const bySource = new Map<OperationalSource, Set<string>>();
  for (const ref of exec.relatedRefs) {
    const ids = bySource.get(ref.source) ?? new Set<string>();
    ids.add(ref.id);
    bySource.set(ref.source, ids);
  }
  for (const id of bySource.get("renewals") ?? []) related.leaseIds.add(id);
  for (const id of bySource.get("maintenance") ?? []) related.ticketIds.add(id);
  for (const id of bySource.get("processes") ?? [])
    if (id.startsWith("run:")) related.runIds.add(id.slice(4));
  const approvalKeys = bySource.get("approvals");
  if (approvalKeys?.size) {
    for (const key of approvalKeys) related.approvalKeys.add(key);
    const read = await exec.ctx.read("approvals");
    for (const record of read.records) {
      if (!approvalKeys.has(record.ref.id)) continue;
      if (record.facts.leaseId) related.leaseIds.add(record.facts.leaseId);
      if (record.facts.queueItemId) related.queueItemIds.add(record.facts.queueItemId);
    }
  }
  const taskIds = bySource.get("work");
  if (taskIds?.size) {
    for (const id of taskIds) related.taskIds.add(id);
    const read = await exec.ctx.read("work");
    for (const record of read.records) {
      if (!taskIds.has(record.ref.id) || !record.facts.sourceId) continue;
      const target = linkedIdSet(related, record.facts.sourceType);
      target?.add(record.facts.sourceId);
    }
  }
  const linkIds = bySource.get("communications");
  if (linkIds?.size) {
    for (const id of linkIds) related.linkIds.add(id);
    const read = await exec.ctx.read("communications");
    for (const record of read.records) {
      if (!linkIds.has(record.ref.id)) continue;
      const target = linkedIdSet(related, record.facts.entityType);
      target?.add(record.facts.entityId);
    }
  }
  return related;
}

function linkedIdSet(related: Related, type: string): Set<string> | null {
  switch (type) {
    case "renewal_lease":
      return related.leaseIds;
    case "maintenance_ticket":
      return related.ticketIds;
    case "workflow_run":
      return related.runIds;
    case "approval_item":
      return related.queueItemIds;
    default:
      return null;
  }
}

function toItem(record: OperationalRecord<unknown>, extraDetail?: string): AnswerItem {
  return {
    ref: record.ref,
    title: record.title,
    detail: extraDetail ? `${record.detail} · ${extraDetail}` : record.detail,
    blockers: record.blockers,
    href: record.href,
  };
}

function viewLink(source: OperationalSource): { label: string; href: string } {
  return OPERATIONAL_SOURCE_VIEWS[source];
}

function readNotes(read: TypedSourceRead<OperationalSource>): string[] {
  const note = read.note;
  if (!note) return [];
  const staleData = read.currency !== undefined && read.currency.state !== "fresh";
  return read.status !== "ok" || staleData || read.source === "communications"
    ? [note]
    : [];
}

/** A source that could not answer, or that the actor cannot see. It carries no count or label. */
function statusGroup(read: TypedSourceRead<OperationalSource>): AnswerGroup {
  return {
    source: read.source,
    title: SOURCE_TITLES[read.source],
    summary:
      read.note ??
      (read.status === "not_authorized"
        ? "You do not have access to these records."
        : "These records could not be read just now."),
    status: read.status,
    total: 0,
    items: [],
    notes: [],
    link: read.status === "unavailable" ? viewLink(read.source) : null,
  };
}

function unusable(read: TypedSourceRead<OperationalSource>): boolean {
  return read.status === "not_authorized" || read.status === "unavailable";
}

function finishGroup(input: {
  readonly read: TypedSourceRead<OperationalSource>;
  readonly matched: readonly AnswerItem[];
  readonly summary: string;
  readonly notes?: readonly string[];
  readonly status?: SourceReadStatus;
  readonly link?: { label: string; href: string } | null;
  readonly title?: string;
}): AnswerGroup {
  const items = input.matched.slice(0, MAX_ITEMS_PER_GROUP);
  const notes = [...readNotes(input.read), ...(input.notes ?? [])];
  if (input.matched.length > items.length)
    notes.push(
      `Showing the first ${items.length} of ${input.matched.length}. Open the full list for the rest.`,
    );
  return {
    source: input.read.source,
    title: input.title ?? SOURCE_TITLES[input.read.source],
    summary: input.summary,
    status: input.status ?? input.read.status,
    total: input.matched.length,
    items,
    notes,
    link: input.link === undefined ? viewLink(input.read.source) : input.link,
  };
}

function rangeFor(exec: Execution): BusinessRange | null {
  const range = exec.plan.filters.range;
  return range ? resolveBusinessRange(range.preset, range.month, exec.nowIso) : null;
}

// ---- People ----------------------------------------------------------------------------------

interface PersonCandidate {
  /** One identity: a staff uid, or one owner or tenant label as the records spell it. */
  readonly key: string;
  readonly label: string;
  readonly role: "owner" | "tenant" | "staff";
  readonly uid?: string;
}

interface PeopleResolution {
  readonly matches: ReadonlyMap<string, readonly PersonCandidate[]>;
  readonly unmatched: readonly string[];
  readonly ambiguous: ReadonlyArray<{
    readonly name: string;
    readonly options: readonly string[];
  }>;
  /** False when other staff members' assignments are not visible to this actor. */
  readonly staffVisible: boolean;
}

function describeCandidate(candidate: PersonCandidate): string {
  return candidate.role === "staff"
    ? `${candidate.label} (staff)`
    : `${candidate.label} (${candidate.role})`;
}

async function resolvePeople(
  exec: Execution,
  partyRecords: ReadonlyArray<{
    ownerNames: readonly string[];
    tenantNames: readonly string[];
  }>,
): Promise<PeopleResolution> {
  const { people, peopleMatch } = exec.plan.filters;
  const candidates: PersonCandidate[] = [];
  const wantsParties = peopleMatch !== "assigned";
  const wantsStaff = peopleMatch !== "related";
  if (wantsParties) {
    for (const record of partyRecords) {
      for (const label of record.ownerNames)
        candidates.push({ key: `party:${normalizeText(label)}`, label, role: "owner" });
      for (const label of record.tenantNames)
        candidates.push({ key: `party:${normalizeText(label)}`, label, role: "tenant" });
    }
  }
  let staffVisible = true;
  if (wantsStaff) {
    const roster: readonly KnownPerson[] | null = await exec.ctx.listKnownPeople();
    if (roster === null) staffVisible = false;
    for (const person of roster ?? [])
      candidates.push({
        key: `staff:${person.uid}`,
        label: person.label,
        role: "staff",
        uid: person.uid,
      });
  }
  const matches = new Map<string, PersonCandidate[]>();
  const unmatched: string[] = [];
  const ambiguous: { name: string; options: string[] }[] = [];
  for (const name of people) {
    const found = candidates.filter((candidate) => {
      if (nameMatches(name, candidate.label)) return true;
      if (candidate.role !== "staff") return false;
      const local = candidate.label.split("@")[0] ?? "";
      return nameMatches(name, local.replace(/[._-]+/g, " "));
    });
    const exact = found.filter(
      (candidate) => normalizeText(candidate.label) === normalizeText(name),
    );
    const pool =
      new Set(exact.map((candidate) => candidate.key)).size === 1 ? exact : found;
    const keys = [...new Set(pool.map((candidate) => candidate.key))];
    if (keys.length === 0) unmatched.push(name);
    else if (keys.length === 1) matches.set(name, pool);
    else {
      const options = keys.map((key) =>
        describeCandidate(
          pool.find((candidate) => candidate.key === key) as PersonCandidate,
        ),
      );
      ambiguous.push({ name, options: [...new Set(options)].slice(0, 5) });
    }
  }
  return { matches, unmatched, ambiguous, staffVisible };
}

function peopleNotes(resolution: PeopleResolution, exec: Execution): string[] {
  const notes: string[] = [];
  for (const [name, found] of resolution.matches) {
    const labels = [...new Set(found.map(describeCandidate))];
    exec.interpretation.push(`“${name}” matched ${labels.join(" and ")}.`);
  }
  if (resolution.unmatched.length)
    notes.push(
      `No one named ${quoteList(resolution.unmatched)} appears in the records you can see, so nothing was guessed.`,
    );
  if (!resolution.staffVisible && exec.plan.filters.peopleMatch !== "related")
    notes.push("Other staff members' assignments are visible to Admins only.");
  return notes;
}

function ambiguityQuestion(resolution: PeopleResolution): string | null {
  const first = resolution.ambiguous[0];
  if (!first) return null;
  return `More than one person matches “${first.name}”: ${first.options.join(", ")}. Which one do you mean?`;
}

// ---- Leases ----------------------------------------------------------------------------------

type Outcome =
  | { readonly kind: "groups"; readonly groups: AnswerGroup[] }
  | {
      readonly kind: "clarify";
      readonly question: string;
      readonly awaiting: AwaitingDetail | null;
    };

function openTasksByLease(
  read: TypedSourceRead<"work">,
  assigneeUids: ReadonlySet<string>,
): Map<string, string[]> {
  const byLease = new Map<string, string[]>();
  for (const record of read.records) {
    const facts = record.facts;
    if (!facts.open || facts.sourceType !== "renewal_lease" || !facts.sourceId) continue;
    if (!facts.assigneeUid || !assigneeUids.has(facts.assigneeUid)) continue;
    const list = byLease.get(facts.sourceId) ?? [];
    list.push(facts.assigneeUid);
    byLease.set(facts.sourceId, list);
  }
  return byLease;
}

function uncoveredNote(
  range: BusinessRange,
  coverage: { startIso: string; endIso: string } | undefined,
): string | null {
  if (!coverage)
    return "The renewal read did not report which lease end dates it covers, so leases in this period may be missing.";
  const startsBefore = range.startIso === null || range.startIso < coverage.startIso;
  const endsAfter = range.endIso > coverage.endIso;
  if (!startsBefore && !endsAfter) return null;
  return `The renewal read covers leases ending ${formatCalendarDate(coverage.startIso)} through ${formatCalendarDate(coverage.endIso)}, so leases ending outside those dates are not included.`;
}

async function answerLeases(exec: Execution, related: Related | null): Promise<Outcome> {
  const read = await exec.ctx.read("renewals");
  if (unusable(read)) return { kind: "groups", groups: [statusGroup(read)] };
  const { filters } = exec.plan;
  const range = rangeFor(exec);
  const dateField = filters.dateField ?? (range ? "lease_end" : null);
  if (dateField === "notice_deadline") {
    return {
      kind: "clarify",
      question:
        "The app does not record a notice deadline for leases. Should I use the lease end date, or renewal follow-ups that are due?",
      awaiting: "date_field",
    };
  }

  const notes: string[] = [];
  let status: SourceReadStatus = read.status;
  const clauses: Array<readonly [string, string]> = [];
  const desk: RenewalDeskQueryV2State = { ...DEFAULT_RENEWAL_DESK_QUERY_V2 };
  let records = read.records;

  if (filters.includeClosed) desk.scope = "all";
  else records = records.filter((record) => record.facts.inDefaultScope);

  if (related) {
    records = records.filter((record) => related.leaseIds.has(record.facts.leaseId));
    exec.interpretation.push("Limited to the leases linked to the previous answer.");
  }

  if (dateField === "lease_end" && range) {
    const preset = filters.range?.preset;
    if (
      preset === "month" ||
      preset === "this_month" ||
      preset === "next_month" ||
      preset === "last_month"
    ) {
      const month = range.endIso.slice(0, 7);
      records = records.filter((record) => record.facts.endMonth === month);
      desk.month = month;
    } else {
      records = records.filter((record) =>
        inBusinessRange(record.facts.endDateIso, range),
      );
      if (
        range.startIso &&
        inclusiveRangeDays(range.startIso, range.endIso) <= RENEWAL_DESK_RANGE_MAX_DAYS
      ) {
        desk.from = range.startIso;
        desk.through = range.endIso;
      }
    }
    exec.interpretation.push(
      `Dates: ${range.label}, on the America/Chicago business calendar.`,
    );
    exec.interpretation.push(
      "Lease date used: the lease end date, which the desk uses as the renewal date.",
    );
    clauses.push(
      preset === "overdue"
        ? [
            `ended before ${formatCalendarDate(exec.today)}`,
            `ended before ${formatCalendarDate(exec.today)}`,
          ]
        : [`ends ${range.label}`, `end ${range.label}`],
    );
    const gap = uncoveredNote(range, read.coverage);
    if (gap) {
      notes.push(gap);
      status = "partial";
    }
  } else if (dateField === "follow_up_due") {
    const dueNow =
      !range || filters.range?.preset === "overdue" || filters.range?.preset === "today";
    if (dueNow) {
      records = records.filter((record) => record.facts.followUpDueState === "due");
      desk.due = "due";
      clauses.push([
        "has a renewal follow-up due now",
        "have a renewal follow-up due now",
      ]);
      exec.interpretation.push(
        "Lease date used: the renewal follow-up due date (the desk's Action timing), due now.",
      );
    } else if (range) {
      records = records.filter((record) =>
        inBusinessRange(record.facts.followUpDueAtIso, range),
      );
      clauses.push([
        `has a renewal follow-up due ${range.label}`,
        `have renewal follow-ups due ${range.label}`,
      ]);
      exec.interpretation.push(
        `Dates: ${range.label}, on the America/Chicago business calendar.`,
      );
      exec.interpretation.push(
        "Lease date used: the renewal follow-up due date (the desk's Action timing).",
      );
    }
  }

  if (filters.blocked) {
    records = records.filter((record) => record.facts.blocked);
    desk.blocked = "blocked";
    clauses.push(["is blocked", "are blocked"]);
  }

  if (filters.text) {
    const wanted = normalizeText(filters.text);
    records = records.filter(
      (record) =>
        normalizeText(record.facts.address).includes(wanted) ||
        normalizeText(record.facts.leaseId) === wanted,
    );
    desk.lease = filters.text;
    clauses.push([`matches “${filters.text}”`, `match “${filters.text}”`]);
  }

  const extraDetail = new Map<string, string>();
  if (filters.assignee === "me") {
    const work = await exec.ctx.read("work");
    if (unusable(work)) {
      notes.push(
        "My Work could not be read, so leases assigned to you cannot be listed just now.",
      );
      status = "partial";
      records = [];
    } else {
      const mine = openTasksByLease(work, new Set([exec.ctx.actorUid]));
      records = records.filter((record) => mine.has(record.facts.leaseId));
      if (work.status === "partial") {
        status = "partial";
        notes.push(
          "My Work reached its record limit, so some assignments may be missing.",
        );
      }
    }
    clauses.push(["has open work assigned to you", "have open work assigned to you"]);
    exec.interpretation.push(
      "Assigned to you: a lease counts when an open My Work task for it is assigned to you.",
    );
  }

  if (filters.people.length) {
    const resolution = await resolvePeople(
      exec,
      read.records.map((record) => record.facts),
    );
    const question = ambiguityQuestion(resolution);
    if (question) return { kind: "clarify", question, awaiting: "person" };
    notes.push(...peopleNotes(resolution, exec));
    const found = [...resolution.matches.values()].flat();
    const partyLabels = new Set(
      found
        .filter((candidate) => candidate.role !== "staff")
        .map((candidate) => normalizeText(candidate.label)),
    );
    const staffUids = new Set(
      found.flatMap((candidate) =>
        candidate.role === "staff" && candidate.uid ? [candidate.uid] : [],
      ),
    );
    let assignedByLease = new Map<string, string[]>();
    if (staffUids.size) {
      const team = await exec.ctx.readTeamWork();
      if (unusable(team)) {
        notes.push(team.note ?? "The team work view could not be read just now.");
        status = "partial";
      } else assignedByLease = openTasksByLease(team, staffUids);
    }
    const staffLabels = new Map(
      found.flatMap((candidate) =>
        candidate.uid ? [[candidate.uid, candidate.label] as const] : [],
      ),
    );
    records = records.filter((record) => {
      const reasons: string[] = [];
      for (const owner of record.facts.ownerNames)
        if (partyLabels.has(normalizeText(owner))) reasons.push(`owner ${owner}`);
      for (const tenant of record.facts.tenantNames)
        if (partyLabels.has(normalizeText(tenant))) reasons.push(`tenant ${tenant}`);
      for (const uid of assignedByLease.get(record.facts.leaseId) ?? [])
        reasons.push(`assigned to ${staffLabels.get(uid) ?? "a matched staff member"}`);
      if (reasons.length)
        extraDetail.set(record.ref.id, [...new Set(reasons)].join(", "));
      return reasons.length > 0;
    });
    const names = [...resolution.matches.keys()];
    const verb =
      filters.peopleMatch === "assigned"
        ? (["has open work assigned to", "have open work assigned to"] as const)
        : filters.peopleMatch === "related"
          ? (["is related to", "are related to"] as const)
          : (["is assigned or related to", "are assigned or related to"] as const);
    clauses.push([
      `${verb[0]} ${quoteList(names.length ? names : filters.people)}`,
      `${verb[1]} ${quoteList(names.length ? names : filters.people)}`,
    ]);
  }

  if (exec.plan.followUp.detail && records.length === 1) {
    return { kind: "groups", groups: await answerDetail(exec, records[0].ref) };
  }

  if (clauses.length === 0)
    clauses.push(["is in the renewal worklist", "are in the renewal worklist"]);
  const matched = records.map((record) => toItem(record, extraDetail.get(record.ref.id)));
  return {
    kind: "groups",
    groups: [
      finishGroup({
        read,
        matched,
        summary: sentence(matched.length, ["lease", "leases"], clauses),
        notes,
        status,
        link: { label: "Open these on the Renewals desk", href: buildDeskHref(desk) },
      }),
    ],
  };
}

// ---- My Work ---------------------------------------------------------------------------------

async function answerWork(exec: Execution, related: Related | null): Promise<Outcome> {
  const { filters } = exec.plan;
  const notes: string[] = [];
  const clauses: Array<readonly [string, string]> = [];
  let staffUids: Set<string> | null = null;

  if (filters.people.length && filters.peopleMatch === "related")
    notes.push("Work is assigned to staff, so owner and tenant names do not filter it.");
  if (filters.people.length && filters.peopleMatch !== "related") {
    const resolution = await resolvePeople(exec, []);
    const question = ambiguityQuestion(resolution);
    if (question) return { kind: "clarify", question, awaiting: "person" };
    notes.push(...peopleNotes(resolution, exec));
    staffUids = new Set(
      [...resolution.matches.values()]
        .flat()
        .flatMap((candidate) => (candidate.uid ? [candidate.uid] : [])),
    );
  }
  const team = filters.assignee === "any" || staffUids !== null;
  const read = team ? await exec.ctx.readTeamWork() : await exec.ctx.read("work");
  if (unusable(read)) return { kind: "groups", groups: [statusGroup(read)] };

  let records = read.records;
  if (staffUids) {
    const uids = staffUids;
    records = records.filter(
      (record) => record.facts.assigneeUid !== null && uids.has(record.facts.assigneeUid),
    );
    clauses.push([
      `is assigned to ${quoteList(filters.people)}`,
      `are assigned to ${quoteList(filters.people)}`,
    ]);
  } else if (!team) {
    records = records.filter((record) => record.facts.assigneeUid === exec.ctx.actorUid);
  }

  if (related) {
    records = records.filter((record) => {
      const { sourceType, sourceId } = record.facts;
      if (related.taskIds.has(record.ref.id)) return true;
      if (!sourceId) return false;
      return linkedIdSet(related, sourceType)?.has(sourceId) ?? false;
    });
    exec.interpretation.push("Limited to the work linked to the previous answer.");
  }

  const range = rangeFor(exec);
  if (range && filters.range?.preset === "today" && !team) {
    records = records.filter((record) =>
      taskNeedsAttentionToday(
        {
          assigneeUid: record.facts.assigneeUid,
          state: record.facts.state,
          dueAtIso: record.facts.dueAtIso,
        },
        exec.ctx.actorUid,
        exec.nowIso,
      ),
    );
    clauses.push(["needs your attention today", "need your attention today"]);
    exec.interpretation.push(
      `Today, ${formatCalendarDate(exec.today)}: open work assigned to you that is due today, overdue, or blocked, as My Work shows it.`,
    );
  } else {
    if (!filters.includeClosed) records = records.filter((record) => record.facts.open);
    if (range) {
      records = records.filter((record) => inBusinessRange(record.facts.dueAtIso, range));
      clauses.push(
        filters.range?.preset === "overdue"
          ? ["is overdue", "are overdue"]
          : [`is due ${range.label}`, `are due ${range.label}`],
      );
      exec.interpretation.push(
        `Dates: ${range.label}, on the America/Chicago business calendar, by task due date.`,
      );
    }
    if (!staffUids)
      clauses.unshift(
        team
          ? [
              filters.includeClosed ? "is on the team's list" : "is open across the team",
              filters.includeClosed
                ? "are on the team's list"
                : "are open across the team",
            ]
          : [
              filters.includeClosed
                ? "is assigned to you"
                : "is open and assigned to you",
              filters.includeClosed
                ? "are assigned to you"
                : "are open and assigned to you",
            ],
      );
  }
  if (filters.blocked) {
    records = records.filter((record) => record.facts.blocked);
    clauses.push(["is blocked", "are blocked"]);
  }
  if (filters.text) {
    const wanted = normalizeText(filters.text);
    records = records.filter((record) => normalizeText(record.title).includes(wanted));
  }
  if (exec.plan.followUp.detail && records.length === 1)
    return { kind: "groups", groups: await answerDetail(exec, records[0].ref) };

  const matched = records.map((record) => toItem(record));
  return {
    kind: "groups",
    groups: [
      finishGroup({
        read,
        matched,
        summary: sentence(matched.length, ["task", "tasks"], clauses),
        notes,
      }),
    ],
  };
}

// ---- Approvals -------------------------------------------------------------------------------

async function answerApprovals(
  exec: Execution,
  related: Related | null,
): Promise<Outcome> {
  const read = await exec.ctx.read("approvals");
  if (unusable(read)) return { kind: "groups", groups: [statusGroup(read)] };
  const { filters } = exec.plan;
  let records = read.records;
  const notes: string[] = [];
  if (related) {
    records = records.filter(
      (record) =>
        related.approvalKeys.has(record.ref.id) ||
        (record.facts.leaseId !== null && related.leaseIds.has(record.facts.leaseId)) ||
        (record.facts.queueItemId !== null &&
          related.queueItemIds.has(record.facts.queueItemId)),
    );
    exec.interpretation.push("Limited to the approvals linked to the previous answer.");
  }
  const range = rangeFor(exec);
  if (range) {
    records = records.filter((record) => inBusinessRange(record.facts.dueDateIso, range));
    exec.interpretation.push(
      `Dates: ${range.label}, on the America/Chicago business calendar, by approval due date.`,
    );
  }

  const detailFor = (record: OperationalRecord<ApprovalRecordFacts>) =>
    record.facts.canApproveNow === true
      ? "you can approve this now"
      : record.facts.canApproveNow === false
        ? `waiting: ${record.facts.waitingReason ?? "someone else must act first"}`
        : "no approval rule is recorded here; open it to see who can approve";

  let summary: string;
  if (filters.needsMyApproval) {
    records = records.filter((record) => record.facts.canApproveNow === true);
    summary = sentence(
      records.length,
      ["item", "items"],
      [["is ready for you to approve now", "are ready for you to approve now"]],
    );
  } else if (filters.waitingOnOthers) {
    records = records.filter((record) => record.facts.canApproveNow === false);
    summary = sentence(
      records.length,
      ["item", "items"],
      [["is waiting on someone else", "are waiting on someone else"]],
    );
  } else {
    const yours = records.filter((record) => record.facts.canApproveNow === true).length;
    const waiting = records.filter(
      (record) => record.facts.canApproveNow === false,
    ).length;
    const unknown = records.length - yours - waiting;
    const breakdown = `${yours} you can approve now, ${waiting} waiting on someone else${unknown ? `, and ${unknown} with no approval rule recorded here` : ""}`;
    summary =
      records.length === 0
        ? related
          ? "None of those records has an item in your approval queue."
          : "Your approval queue is empty."
        : related
          ? `${records.length} ${plural(records.length, "approval item is", "approval items are")} linked to those records: ${breakdown}.`
          : `Your approval queue has ${records.length} ${plural(records.length, "item", "items")}: ${breakdown}.`;
  }
  if (
    records.some((record) => record.facts.canApproveNow === null) &&
    !filters.needsMyApproval
  )
    notes.push(
      "Viewing an item does not mean you can approve it; only the queue's own rule decides that.",
    );
  if (exec.plan.followUp.detail && records.length === 1)
    return { kind: "groups", groups: await answerDetail(exec, records[0].ref) };
  return {
    kind: "groups",
    groups: [
      finishGroup({
        read,
        matched: records.map((record) => toItem(record, detailFor(record))),
        summary,
        notes,
      }),
    ],
  };
}

// ---- Connections and stale information -------------------------------------------------------

function connectionDetail(facts: {
  state: string;
  verifiedByLiveCheck: boolean;
}): string {
  if (facts.state === "connected")
    return facts.verifiedByLiveCheck
      ? "passed a live read-only check in the last ten minutes"
      : "set up, with no live check in the last ten minutes";
  return "not connected and healthy";
}

async function answerConnections(exec: Execution): Promise<Outcome> {
  const read = await exec.ctx.read("connections");
  if (unusable(read)) return { kind: "groups", groups: [statusGroup(read)] };
  if (exec.plan.filters.stale) return answerStale(exec, read);
  const records = [...read.records].sort(
    (left, right) =>
      Number(right.facts.state === "connected") -
      Number(left.facts.state === "connected"),
  );
  const connected = records.filter((record) => record.facts.state === "connected");
  const verified = connected.filter((record) => record.facts.verifiedByLiveCheck).length;
  const attention = records.filter((record) => record.facts.state === "action").length;
  const summary = `${connected.length} of ${records.length} applications are connected; ${verified} of those passed a live read-only check in the last ten minutes${attention ? `, and ${attention} ${plural(attention, "needs", "need")} attention` : ""}.`;
  exec.interpretation.push(
    "Connected means set up; a live check is what shows it is working right now.",
  );
  return {
    kind: "groups",
    groups: [
      finishGroup({
        read,
        matched: records.map((record) => toItem(record, connectionDetail(record.facts))),
        summary,
      }),
    ],
  };
}

async function answerStale(
  exec: Execution,
  connections: TypedSourceRead<"connections">,
): Promise<Outcome> {
  const groups: AnswerGroup[] = [];
  const needs = connections.records.filter(
    (record) => record.facts.state !== "connected" || !record.facts.verifiedByLiveCheck,
  );
  groups.push(
    finishGroup({
      read: connections,
      matched: needs.map((record) => toItem(record, connectionDetail(record.facts))),
      summary: sentence(
        needs.length,
        ["connection", "connections"],
        [
          [
            "is not confirmed by a recent live check",
            "are not confirmed by a recent live check",
          ],
        ],
      ),
    }),
  );
  const renewals = await exec.ctx.read("renewals");
  if (renewals.status === "unavailable") groups.push(statusGroup(renewals));
  else if (renewals.status !== "not_authorized") {
    const currency = renewals.currency;
    const summary = currency
      ? `Renewal desk data was last read ${formatBusinessTimestamp(currency.readAtIso)} and is ${currency.state === "fresh" ? "current" : currency.state === "expired" ? "too old to act on" : "stale"}.`
      : "The renewal read did not report when its data was last read.";
    groups.push({
      source: "renewals",
      title: "Renewal data",
      summary,
      status: renewals.status,
      total: 0,
      items: [],
      notes: renewals.status === "partial" && renewals.note ? [renewals.note] : [],
      link: viewLink("renewals"),
    });
  }
  exec.interpretation.push("Nothing was refreshed; these are the last recorded reads.");
  return { kind: "groups", groups };
}

// ---- Internal Processes ----------------------------------------------------------------------

async function answerProcesses(
  exec: Execution,
  related: Related | null,
): Promise<Outcome> {
  const read = await exec.ctx.read("processes");
  if (unusable(read)) return { kind: "groups", groups: [statusGroup(read)] };
  const { filters } = exec.plan;
  const notes: string[] = [];
  const clauses: Array<readonly [string, string]> = [];
  let runs = read.records.filter((record) => record.facts.kind === "run");
  const definitions = read.records.filter((record) => record.facts.kind === "definition");
  if (!filters.includeClosed) {
    runs = runs.filter((record) => !TERMINAL_RUN_STATUSES.has(record.facts.status));
    clauses.push(["is open", "are open"]);
  }
  if (related) {
    runs = runs.filter((record) =>
      related.runIds.has(record.ref.id.replace(/^run:/, "")),
    );
    exec.interpretation.push(
      "Limited to the process runs linked to the previous answer.",
    );
  }
  const range = rangeFor(exec);
  if (range) {
    runs = runs.filter((record) => inBusinessRange(record.facts.dueDateIso, range));
    clauses.push([`is due ${range.label}`, `are due ${range.label}`]);
  }
  if (filters.blocked) {
    runs = runs.filter(
      (record) => record.blockers.length > 0 || record.facts.status === "Blocked",
    );
    clauses.push(["is blocked", "are blocked"]);
  }
  let matchedDefinitions: typeof definitions = [];
  if (filters.text) {
    const wanted = normalizeText(filters.text);
    runs = runs.filter((record) => normalizeText(record.title).includes(wanted));
    matchedDefinitions = definitions.filter((record) =>
      normalizeText(record.title).includes(wanted),
    );
  }
  if (filters.assignee || filters.people.length)
    notes.push("Process runs are not assigned to people; My Work lists assigned tasks.");
  if (exec.plan.followUp.detail && runs.length + matchedDefinitions.length === 1)
    return {
      kind: "groups",
      groups: await answerDetail(exec, (runs[0] ?? matchedDefinitions[0]).ref),
    };
  if (clauses.length === 0) clauses.push(["is recorded", "are recorded"]);
  const groups = [
    finishGroup({
      read,
      matched: runs.map((record) => toItem(record)),
      summary: sentence(runs.length, ["process run", "process runs"], clauses),
      notes,
      title: "Process runs",
    }),
  ];
  const showDefinitions =
    matchedDefinitions.length > 0 || (runs.length === 0 && !filters.text && !related);
  if (showDefinitions) {
    const list = matchedDefinitions.length ? matchedDefinitions : definitions;
    groups.push(
      finishGroup({
        read,
        matched: list.map((record) => toItem(record)),
        summary: `${list.length} ${plural(list.length, "process definition is", "process definitions are")} available.`,
        title: "Process definitions",
      }),
    );
  }
  return { kind: "groups", groups };
}

// ---- Maintenance -----------------------------------------------------------------------------

async function answerMaintenance(
  exec: Execution,
  related: Related | null,
): Promise<Outcome> {
  const read = await exec.ctx.read("maintenance");
  if (unusable(read)) return { kind: "groups", groups: [statusGroup(read)] };
  const { filters } = exec.plan;
  const notes: string[] = [];
  const clauses: Array<readonly [string, string]> = [];
  let records = read.records;
  if (!filters.includeClosed) {
    records = records.filter((record) => record.facts.status !== "Closed");
    clauses.push(["is open", "are open"]);
  }
  if (related) {
    records = records.filter((record) => related.ticketIds.has(record.facts.ticketId));
    exec.interpretation.push("Limited to the tickets linked to the previous answer.");
  }
  if (filters.assignee === "me") {
    records = records.filter((record) => record.facts.assigneeUid === exec.ctx.actorUid);
    clauses.push(["is assigned to you", "are assigned to you"]);
  }
  if (filters.people.length && filters.peopleMatch !== "related") {
    const resolution = await resolvePeople(exec, []);
    const question = ambiguityQuestion(resolution);
    if (question) return { kind: "clarify", question, awaiting: "person" };
    notes.push(...peopleNotes(resolution, exec));
    const uids = new Set(
      [...resolution.matches.values()]
        .flat()
        .flatMap((candidate) => (candidate.uid ? [candidate.uid] : [])),
    );
    records = records.filter(
      (record) => record.facts.assigneeUid !== null && uids.has(record.facts.assigneeUid),
    );
    clauses.push([
      `is assigned to ${quoteList(filters.people)}`,
      `are assigned to ${quoteList(filters.people)}`,
    ]);
  }
  if (filters.blocked || filters.waitingOnOthers) {
    records = records.filter(
      (record) => record.blockers.length > 0 || record.facts.waitingOn !== null,
    );
    clauses.push(["is waiting on someone", "are waiting on someone"]);
  }
  if (filters.range)
    notes.push(
      "Maintenance tickets have no due date, so the date range was not applied.",
    );
  if (filters.text) {
    const wanted = normalizeText(filters.text);
    records = records.filter((record) =>
      normalizeText(`${record.title} ${record.detail}`).includes(wanted),
    );
  }
  if (exec.plan.followUp.detail && records.length === 1)
    return { kind: "groups", groups: await answerDetail(exec, records[0].ref) };
  if (clauses.length === 0) clauses.push(["is recorded", "are recorded"]);
  return {
    kind: "groups",
    groups: [
      finishGroup({
        read,
        matched: records.map((record) => toItem(record)),
        summary: sentence(
          records.length,
          ["maintenance ticket", "maintenance tickets"],
          clauses,
        ),
        notes,
      }),
    ],
  };
}

// ---- Workflow-linked communication -----------------------------------------------------------

async function answerCommunications(
  exec: Execution,
  related: Related | null,
): Promise<Outcome> {
  const read = await exec.ctx.read("communications");
  if (unusable(read)) return { kind: "groups", groups: [statusGroup(read)] };
  const { filters } = exec.plan;
  const clauses: Array<readonly [string, string]> = [
    ["is linked to your work", "are linked to your work"],
  ];
  let records = read.records;
  if (related) {
    records = records.filter(
      (record) =>
        related.linkIds.has(record.ref.id) ||
        (linkedIdSet(related, record.facts.entityType)?.has(record.facts.entityId) ??
          false),
    );
    exec.interpretation.push(
      "Limited to the email records linked to the previous answer.",
    );
  }
  if (filters.waitingOnOthers) {
    records = records.filter(
      (record) =>
        record.facts.waitingOn !== null && OUTSIDE_WAITING.has(record.facts.waitingOn),
    );
    clauses.push([
      "is waiting on someone outside the team",
      "are waiting on someone outside the team",
    ]);
  }
  const range = rangeFor(exec);
  if (range) {
    records = records.filter((record) =>
      inBusinessRange(record.facts.lastContactIso, range),
    );
    clauses.push([
      `had its last contact ${range.label}`,
      `had their last contact ${range.label}`,
    ]);
  }
  if (exec.plan.followUp.detail && records.length === 1)
    return { kind: "groups", groups: await answerDetail(exec, records[0].ref) };
  return {
    kind: "groups",
    groups: [
      finishGroup({
        read,
        matched: records.map((record) => toItem(record)),
        summary: sentence(records.length, ["email record", "email records"], clauses),
      }),
    ],
  };
}

// ---- One record in detail --------------------------------------------------------------------

function detailFacts(
  record: OperationalRecord<unknown>,
  source: OperationalSource,
): string[] {
  const facts = record.facts as Record<string, unknown>;
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) lines.push(`${label}: ${value}`);
  };
  switch (source) {
    case "renewals":
      add(
        "Lease end",
        facts.endDateIso ? formatCalendarDate(String(facts.endDateIso)) : "not recorded",
      );
      add("Stage", facts.stage);
      add("Next action", facts.nextAction);
      add("Waiting", facts.waitingOn);
      if (facts.followUpDueAtIso)
        add(
          "Renewal follow-up due",
          formatBusinessTimestamp(String(facts.followUpDueAtIso)),
        );
      add("Renewal lifecycle", facts.lifecycle);
      add("Staff work status (recorded in the app)", facts.workStatus);
      break;
    case "work":
      add("State", facts.state);
      add(
        "Due",
        facts.dueAtIso ? formatBusinessTimestamp(String(facts.dueAtIso)) : "no due date",
      );
      break;
    case "approvals":
      add("Status", facts.status);
      add(
        "Due",
        facts.dueDateIso
          ? formatCalendarDate(String(facts.dueDateIso).slice(0, 10))
          : null,
      );
      add(
        "Who can approve",
        facts.canApproveNow === true
          ? "you can approve this now"
          : facts.canApproveNow === false
            ? String(facts.waitingReason ?? "someone else must act first")
            : "no approval rule is recorded here; open it to see who can approve",
      );
      break;
    case "maintenance":
      add("Status", facts.status);
      add("Waiting", facts.waitingOn);
      add(
        "Opened",
        facts.createdAtIso ? formatBusinessTimestamp(String(facts.createdAtIso)) : null,
      );
      break;
    case "processes":
      add("Status", facts.status);
      add("Due", facts.dueDateIso ? formatCalendarDate(String(facts.dueDateIso)) : null);
      add(
        "Last updated",
        facts.updatedAtIso ? formatBusinessTimestamp(String(facts.updatedAtIso)) : null,
      );
      break;
    case "communications":
      add(
        "Status",
        typeof facts.status === "string" ? facts.status.replaceAll("_", " ") : null,
      );
      add(
        "Last contact",
        facts.lastContactIso
          ? formatBusinessTimestamp(String(facts.lastContactIso))
          : "not recorded",
      );
      break;
    case "connections":
      add("State", record.detail);
      break;
  }
  return lines;
}

async function answerDetail(
  exec: Execution,
  ref: OperationalRecordRef,
): Promise<AnswerGroup[]> {
  const read = await exec.ctx.read(ref.source);
  if (unusable(read)) return [statusGroup(read)];
  const record = (read.records as readonly OperationalRecord<unknown>[]).find(
    (candidate) => candidate.ref.id === ref.id,
  );
  if (!record) {
    return [
      {
        source: ref.source,
        title: SOURCE_TITLES[ref.source],
        summary:
          "That record is not in your current view any more, so there is nothing current to show.",
        status: read.status,
        total: 0,
        items: [],
        notes: [],
        link: viewLink(ref.source),
      },
    ];
  }
  const blockers = record.blockers.length
    ? ` ${plural(record.blockers.length, "Blocker", "Blockers")}: ${record.blockers.join("; ")}.`
    : "";
  const groups: AnswerGroup[] = [
    {
      source: ref.source,
      title: SOURCE_TITLES[ref.source],
      summary: `${record.title}: ${record.detail}.${blockers}`,
      status: read.status,
      total: 1,
      items: [{ ...toItem(record), facts: detailFacts(record, ref.source) }],
      notes: readNotes(read),
      link: null,
    },
  ];
  if (ref.source === "renewals") groups.push(...(await leaseRelated(exec, ref.id)));
  return groups;
}

/** What else is recorded for one lease: its workflow-linked email, open work, and approvals. */
async function leaseRelated(exec: Execution, leaseId: string): Promise<AnswerGroup[]> {
  const groups: AnswerGroup[] = [];
  const communications = await exec.ctx.read("communications");
  if (unusable(communications)) groups.push(statusGroup(communications));
  else {
    const linked = communications.records.filter(
      (record) =>
        record.facts.entityType === "renewal_lease" && record.facts.entityId === leaseId,
    );
    groups.push(
      finishGroup({
        read: communications,
        matched: linked.map((record) => toItem(record)),
        summary:
          linked.length === 0
            ? "No workflow-linked email is recorded for this lease."
            : sentence(
                linked.length,
                ["email record", "email records"],
                [["is linked to this lease", "are linked to this lease"]],
              ),
      }),
    );
  }
  const work = await exec.ctx.read("work");
  if (!unusable(work)) {
    const tasks = work.records.filter(
      (record) =>
        record.facts.open &&
        record.facts.sourceType === "renewal_lease" &&
        record.facts.sourceId === leaseId,
    );
    if (tasks.length)
      groups.push(
        finishGroup({
          read: work,
          matched: tasks.map((record) => toItem(record)),
          summary: sentence(
            tasks.length,
            ["open task", "open tasks"],
            [["is linked to this lease", "are linked to this lease"]],
          ),
        }),
      );
  }
  const approvals = await exec.ctx.read("approvals");
  if (!unusable(approvals)) {
    const items = approvals.records.filter((record) => record.facts.leaseId === leaseId);
    if (items.length)
      groups.push(
        finishGroup({
          read: approvals,
          matched: items.map((record) => toItem(record)),
          summary: sentence(
            items.length,
            ["approval item", "approval items"],
            [["is linked to this lease", "are linked to this lease"]],
          ),
        }),
      );
  }
  return groups;
}

const ONE_RECORD_NOUNS: Record<string, OperationalSource | null> = {
  lease: "renewals",
  task: "work",
  ticket: "maintenance",
  run: "processes",
  process: "processes",
  approval: "approvals",
  email: "communications",
  one: null,
  item: null,
};

/** The one previous record a follow-up points at, or why it cannot be chosen. */
function pickPreviousRecord(
  plan: ConversationPlan,
  question: string,
  previous: ConversationTurn | null,
):
  | { readonly kind: "ref"; readonly ref: OperationalRecordRef }
  | { readonly kind: "message"; readonly text: string; readonly clarify: boolean }
  | null {
  if (!previous) return null;
  const refs = previous.refs;
  if (plan.followUp.ordinal !== null) {
    const ref = refs[plan.followUp.ordinal - 1];
    return ref
      ? { kind: "ref", ref }
      : {
          kind: "message",
          text: `The last answer listed ${refs.length} ${plural(refs.length, "record", "records")}, so there is no number ${plan.followUp.ordinal}.`,
          clarify: false,
        };
  }
  const noun =
    /\b(?:this|that|the same) (lease|one|task|ticket|item|run|process|approval|email)\b/.exec(
      question.toLowerCase(),
    )?.[1];
  if (!noun || !plan.followUp.detail) return null;
  const source = ONE_RECORD_NOUNS[noun];
  const candidates = source ? refs.filter((ref) => ref.source === source) : refs;
  if (candidates.length === 1) return { kind: "ref", ref: candidates[0] };
  if (candidates.length === 0) return null;
  return {
    kind: "message",
    text: "Which one do you mean? Say the first, the second, and so on, from the last answer.",
    clarify: true,
  };
}

// ---- Entry point -----------------------------------------------------------------------------

const UNSUPPORTED_SUMMARY =
  "I answer from leases and renewals, My Work, approvals, connections, Internal Processes, maintenance tickets, and workflow-linked email.";

export async function runAssistantConversation(
  request: ConversationRequest,
  deps: ConversationDependencies,
): Promise<ConversationAnswer> {
  const question = request.question.trim();
  const incoming = request.conversation ?? null;
  const contextReset = incoming !== null && incoming.actorKey !== deps.actorKey;
  const turns = incoming && !contextReset ? incoming.turns.slice(-MAX_CONTEXT_TURNS) : [];
  const previous = turns.at(-1) ?? null;

  let interpretedBy: InterpretedBy = "deterministic";
  let proposed: ConversationPlan | null = null;
  if (deps.interpret) {
    try {
      proposed = await deps.interpret(question, turns, deps.nowIso);
    } catch {
      proposed = null;
    }
  }
  let plan: ConversationPlan;
  if (proposed) {
    plan = groundPlan(proposed, question, turns);
    interpretedBy = "model";
  } else plan = interpretDeterministically(question, previous, deps.nowIso);
  plan = completeClarification(plan, question, previous);
  const effective = mergeWithPrevious(plan, previous);
  plan = effective.plan;

  const interpretation: string[] = [];
  if (contextReset) interpretation.push("Started a new conversation for this sign-in.");
  if (effective.continued)
    interpretation.push("Continuing from your last question with fresh records.");

  const respond = (
    kind: ConversationAnswerKind,
    summary: string,
    groups: AnswerGroup[],
    extra: {
      clarification?: string | null;
      knowledgeQuestion?: string | null;
      awaiting?: AwaitingDetail | null;
    } = {},
  ): ConversationAnswer => {
    const refs = groups
      .flatMap((group) => group.items.map((item) => item.ref))
      .slice(0, MAX_TURN_REFS);
    const turn: ConversationTurn = {
      question: question.slice(0, 500),
      plan,
      awaiting: extra.awaiting ?? null,
      refs:
        kind === "clarification" && previous && refs.length === 0 ? previous.refs : refs,
    };
    const answer: ConversationAnswer = {
      version: ASSISTANT_CONVERSATION_VERSION,
      kind,
      summary,
      interpretation: [...new Set(interpretation)],
      groups,
      clarification: extra.clarification ?? null,
      knowledgeQuestion: extra.knowledgeQuestion ?? null,
      interpretedBy,
      conversation: {
        version: 1,
        actorKey: deps.actorKey,
        turns: [...turns, turn].slice(-MAX_CONTEXT_TURNS),
      },
      contextReset,
    };
    console.info(
      JSON.stringify({
        event: "assistant_conversation",
        kind,
        interpretedBy,
        subjects: plan.subjects,
        continued: effective.continued,
        groups: groups.map((group) => ({
          source: group.source,
          status: group.status,
          total: group.total,
        })),
      }),
    );
    return answer;
  };

  if (plan.kind === "clarify") {
    const awaiting: AwaitingDetail | null =
      plan.subjects.includes("leases") && !plan.filters.range ? "period" : null;
    const text =
      plan.clarification ??
      "Which period do you mean? For example this week, next month, or an exact month like 2026-11.";
    return respond("clarification", text, [], { clarification: text, awaiting });
  }
  if (plan.kind === "knowledge")
    return respond("knowledge", "", [], { knowledgeQuestion: question });
  if (plan.kind === "unsupported" && !effective.continued)
    return respond("unsupported", UNSUPPORTED_SUMMARY, [], {
      knowledgeQuestion: question,
    });

  const exec: Execution = {
    ctx: deps.context,
    nowIso: deps.nowIso,
    today: businessDateIso(deps.nowIso),
    plan,
    relatedRefs: effective.relatedRefs,
    interpretation,
  };

  const picked = pickPreviousRecord(plan, question, previous);
  if (picked?.kind === "message")
    return picked.clarify
      ? respond("clarification", picked.text, [], { clarification: picked.text })
      : respond("answer", picked.text, []);
  if (picked?.kind === "ref") {
    const groups = await answerDetail(exec, picked.ref);
    return respond("answer", groups[0]?.summary ?? "", groups, {
      knowledgeQuestion: plan.kind === "mixed" ? question : null,
    });
  }

  const subjects: PlanSubject[] = plan.subjects.length
    ? [...plan.subjects]
    : plan.filters.stale
      ? ["connections"]
      : [];
  if (subjects.length === 0)
    return respond("unsupported", UNSUPPORTED_SUMMARY, [], {
      knowledgeQuestion: question,
    });

  const related = await resolveRelated(exec);
  const groups: AnswerGroup[] = [];
  for (const subject of subjects) {
    let outcome: Outcome;
    try {
      outcome = await runSubject(subject, exec, related);
    } catch (error) {
      console.error(
        `Assistant ${subject} answer failed (${error instanceof Error ? error.name : "unknown"}).`,
      );
      const source = SUBJECT_SOURCE[subject];
      outcome = {
        kind: "groups",
        groups: [
          {
            source,
            title: SOURCE_TITLES[source],
            summary: "These records could not be read just now.",
            status: "unavailable",
            total: 0,
            items: [],
            notes: [],
            link: viewLink(source),
          },
        ],
      };
    }
    if (outcome.kind === "clarify")
      return respond("clarification", outcome.question, [], {
        clarification: outcome.question,
        awaiting: outcome.awaiting,
      });
    groups.push(...outcome.groups);
  }
  const summary =
    groups.length === 1
      ? groups[0].summary
      : `Here is what matches in ${new Set(groups.map((group) => group.source)).size} areas.`;
  return respond("answer", summary, groups, {
    knowledgeQuestion: plan.kind === "mixed" ? question : null,
  });
}

function runSubject(
  subject: PlanSubject,
  exec: Execution,
  related: Related | null,
): Promise<Outcome> {
  switch (subject) {
    case "leases":
      return answerLeases(exec, related);
    case "work":
      return answerWork(exec, related);
    case "approvals":
      return answerApprovals(exec, related);
    case "connections":
      return answerConnections(exec);
    case "processes":
      return answerProcesses(exec, related);
    case "maintenance":
      return answerMaintenance(exec, related);
    case "communications":
      return answerCommunications(exec, related);
  }
}
