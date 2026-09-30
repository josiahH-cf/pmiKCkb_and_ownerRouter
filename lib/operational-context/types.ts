// S137 shared actor-scoped operational context. One typed read shape over the owning services, so
// the Dashboard conversation and workflow-linked email refinement see the same record identities,
// provenance, coverage and failure states the owning screens use. Types only; no I/O.

export const OPERATIONAL_SOURCES = [
  "renewals",
  "work",
  "approvals",
  "connections",
  "processes",
  "maintenance",
  "communications",
] as const;

export type OperationalSource = (typeof OPERATIONAL_SOURCES)[number];

/**
 * How one owning read answered. `ok` is a complete read (possibly with zero records); `partial` kept
 * real records but some supporting read or page did not answer; `unavailable` could not read at all;
 * `not_authorized` is the actor's own access boundary. None of these ever masquerades as another.
 */
export type SourceReadStatus = "ok" | "partial" | "unavailable" | "not_authorized";

export interface OperationalRecordRef {
  readonly source: OperationalSource;
  /** The owning record's stable id, exactly as its owning view uses it. */
  readonly id: string;
}

export interface OperationalRecord<F = unknown> {
  readonly ref: OperationalRecordRef;
  readonly title: string;
  /** The most useful status or date for this record, in the owning view's own words. */
  readonly detail: string;
  /** An exact in-app link to the owning view. Never a provider URL. */
  readonly href: string;
  readonly blockers: readonly string[];
  /** Typed filter facts: stable ids, dates and states only; never message bodies or secrets. */
  readonly facts: F;
}

export interface SourceRead<F = unknown> {
  readonly source: OperationalSource;
  readonly status: SourceReadStatus;
  readonly records: readonly OperationalRecord<F>[];
  /** True when the owning read itself may have stopped before every record (a record cap). */
  readonly truncated: boolean;
  /** When the served data was read, when the owning read reports it. */
  readonly asOf: string | null;
  /** The owning read's own inclusive date coverage, when it is windowed. */
  readonly coverage?: { readonly startIso: string; readonly endIso: string };
  /** Plain-language limitation for a non-ok status. Never provider error text. */
  readonly note?: string;
  /** Supporting reads that did not answer, by stable key. */
  readonly degraded?: readonly string[];
  /** The served snapshot's own currency, when the owning read reports one. */
  readonly currency?: {
    readonly state: "fresh" | "stale" | "expired";
    readonly readAtIso: string;
  };
}

export interface RenewalRecordFacts {
  readonly leaseId: string;
  readonly endDateIso: string | null;
  /** The desk's Renewal-month key: the lease end month, never a periodic-review anchor. */
  readonly endMonth: string | null;
  /** The desk's Action timing: the follow-up due state and its due instant, when one is recorded. */
  readonly followUpDueState: string;
  readonly followUpDueAtIso: string | null;
  readonly inDefaultScope: boolean;
  readonly blocked: boolean;
  readonly ownerNames: readonly string[];
  readonly tenantNames: readonly string[];
  readonly address: string;
  readonly stage: string | null;
  readonly nextAction: string | null;
  readonly waitingOn: string | null;
  readonly workStatus: string | null;
  readonly lifecycle: string | null;
}

export interface WorkRecordFacts {
  readonly taskId: string;
  readonly state: string;
  readonly open: boolean;
  readonly dueAtIso: string | null;
  readonly blocked: boolean;
  readonly assigneeUid: string | null;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly spaceId: string;
}

export interface ApprovalRecordFacts {
  readonly kind: "queue_item" | "renewal_flag" | "writeback";
  /** The Approval Queue item id for a queue item; null for renewal flags and write-backs. */
  readonly queueItemId: string | null;
  readonly status: string | null;
  readonly dueDateIso: string | null;
  /** True only when the owning availability rule lets this actor approve now; null when unknown. */
  readonly canApproveNow: boolean | null;
  /** The owning rule's own reason when this actor cannot approve now. */
  readonly waitingReason: string | null;
  readonly leaseId: string | null;
}

export interface ConnectionRecordFacts {
  readonly connectorId: string;
  readonly state: "connected" | "action" | "none" | "closed";
  readonly verifiedByLiveCheck: boolean;
  readonly configuredCount: number;
  readonly requiredCount: number;
}

export interface ProcessRecordFacts {
  readonly kind: "definition" | "run";
  readonly definitionId: string;
  readonly status: string;
  readonly spaceId: string | null;
  readonly updatedAtIso: string | null;
  /** A run's own due date; null for a definition or an undated run. */
  readonly dueDateIso: string | null;
}

export interface MaintenanceRecordFacts {
  readonly ticketId: string;
  readonly status: string;
  readonly waitingOn: string | null;
  readonly createdAtIso: string | null;
  readonly assigneeUid: string | null;
}

export interface CommunicationRecordFacts {
  readonly linkId: string;
  readonly lane: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly status: string;
  readonly waitingOn: string | null;
  readonly lastContactIso: string | null;
}

export interface OperationalFactsBySource {
  readonly renewals: RenewalRecordFacts;
  readonly work: WorkRecordFacts;
  readonly approvals: ApprovalRecordFacts;
  readonly connections: ConnectionRecordFacts;
  readonly processes: ProcessRecordFacts;
  readonly maintenance: MaintenanceRecordFacts;
  readonly communications: CommunicationRecordFacts;
}

export type TypedSourceRead<S extends OperationalSource> = SourceRead<
  OperationalFactsBySource[S]
> & { readonly source: S };

/** A staff member the actor may already see in an owning roster; never guessed from free text. */
export interface KnownPerson {
  readonly uid: string;
  readonly label: string;
  readonly email: string | null;
}

/**
 * One request-scoped context. Each read runs at most once per request through the owning service
 * and always as the signed-in actor; the caller never supplies an identity, role or Space.
 */
export interface OperationalContext {
  readonly actorUid: string;
  readonly nowIso: string;
  read<S extends OperationalSource>(source: S): Promise<TypedSourceRead<S>>;
  /** The actor's team work view when their role already allows it; otherwise not_authorized. */
  readTeamWork(): Promise<TypedSourceRead<"work">>;
  /** Staff the actor may already see in the assignment roster. Empty when that roster is not visible. */
  listKnownPeople(): Promise<readonly KnownPerson[] | null>;
}

/** The owning view for each source, for "open the full list" links. In-app routes only. */
export const OPERATIONAL_SOURCE_VIEWS: Record<
  OperationalSource,
  { readonly label: string; readonly href: string }
> = {
  renewals: { label: "Open the Renewals desk", href: "/lease-renewal/live/desk?v=2" },
  work: { label: "Open My Work", href: "/work" },
  approvals: { label: "Open the Approval Queue", href: "/approval-queue" },
  connections: { label: "Open Connections", href: "/connections" },
  processes: { label: "Open Internal Processes", href: "/processes" },
  maintenance: { label: "Open Maintenance", href: "/maintenance" },
  communications: { label: "Open Communications", href: "/gmail-hub" },
};

export function unavailableRead<S extends OperationalSource>(
  source: S,
  note: string,
): TypedSourceRead<S> {
  return {
    source,
    status: "unavailable",
    records: [],
    truncated: false,
    asOf: null,
    note,
  };
}

export function notAuthorizedRead<S extends OperationalSource>(
  source: S,
  note: string,
): TypedSourceRead<S> {
  return {
    source,
    status: "not_authorized",
    records: [],
    truncated: false,
    asOf: null,
    note,
  };
}
