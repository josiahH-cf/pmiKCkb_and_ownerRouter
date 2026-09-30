// Test double for the S137 operational context. Reads are built from fixtures through the REAL
// projections where the owning shape is simple (renewal rows, My Work tasks), and directly as typed
// records otherwise. Every read is counted so tests can prove memoization and that no source was
// read that the question did not need.

import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import {
  projectRenewalRead,
  projectWorkRead,
} from "@/lib/operational-context/projections";
import type {
  ApprovalRecordFacts,
  CommunicationRecordFacts,
  ConnectionRecordFacts,
  KnownPerson,
  MaintenanceRecordFacts,
  OperationalContext,
  OperationalRecord,
  OperationalSource,
  ProcessRecordFacts,
  TypedSourceRead,
} from "@/lib/operational-context/types";
import type { WorkTaskRecord } from "@/lib/work-accountability/types";

export const TEST_NOW = "2026-09-30T17:00:00.000Z";

type ReadOrError<S extends OperationalSource> = TypedSourceRead<S> | Error;

export interface FakeContextInput {
  readonly actorUid?: string;
  readonly nowIso?: string;
  readonly reads?: { readonly [S in OperationalSource]?: ReadOrError<S> };
  readonly teamWork?: ReadOrError<"work">;
  readonly people?: readonly KnownPerson[] | null;
}

export interface FakeContext extends OperationalContext {
  readonly calls: string[];
}

function emptyRead<S extends OperationalSource>(source: S): TypedSourceRead<S> {
  return { source, status: "ok", records: [], truncated: false, asOf: TEST_NOW };
}

export function fakeOperationalContext(input: FakeContextInput = {}): FakeContext {
  const calls: string[] = [];
  const memo = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, load: () => T | Error): Promise<T> => {
    let pending = memo.get(key) as Promise<T> | undefined;
    if (!pending) {
      calls.push(key);
      pending = Promise.resolve().then(() => {
        const value = load();
        if (value instanceof Error) throw value;
        return value;
      });
      memo.set(key, pending);
    }
    return pending;
  };
  return {
    actorUid: input.actorUid ?? "uid-me",
    nowIso: input.nowIso ?? TEST_NOW,
    calls,
    read: <S extends OperationalSource>(source: S) =>
      once(
        source,
        () => (input.reads?.[source] as ReadOrError<S> | undefined) ?? emptyRead(source),
      ),
    readTeamWork: () => once("work.team", () => input.teamWork ?? emptyRead("work")),
    listKnownPeople: () => once("people", () => input.people ?? null),
  };
}

// ---- Renewal rows -----------------------------------------------------------------------------

export interface LeaseFixture {
  readonly id: string;
  readonly address?: string;
  readonly endDateIso?: string | null;
  readonly owners?: readonly string[];
  readonly tenants?: readonly string[];
  readonly blockers?: readonly string[];
  readonly retention?: string;
  readonly followUpDue?: { readonly state: string; readonly atIso: string | null };
  readonly stage?: string | null;
  readonly nextAction?: string | null;
  readonly waitingOn?: string;
}

export function deskRow(fixture: LeaseFixture): DeskLeaseRow {
  const endDateIso = fixture.endDateIso === undefined ? "2026-10-31" : fixture.endDateIso;
  const blockers = fixture.blockers ?? [];
  return {
    id: fixture.id,
    addressLabel: fixture.address ?? `${fixture.id} Test St`,
    propertyNameLabel: null,
    tenantNameLabel: (fixture.tenants ?? ["Tenant Of Record"])[0],
    tenantNameLabels: [...(fixture.tenants ?? ["Tenant Of Record"])],
    ownerNameLabels: [...(fixture.owners ?? ["Owner Of Record"])],
    identity: { leaseRef: fixture.id },
    endDateIso,
    disposition: "review",
    reason: "in_window",
    reasonLabel: "In the renewal window",
    leaseTerm: { term: "fixed_term" },
    currentRent: 1500,
    unitListedRent: 1500,
    retention: { state: fixture.retention ?? "unknown" },
    processVersion: null,
    workflowStepId: null,
    stageIndex: 0,
    stageLabel: fixture.stage ?? null,
    nextAction: fixture.nextAction ?? null,
    openConflicts: 0,
    queryKeys: {
      normalizedOwners: [],
      normalizedTenants: [],
      endDateIso,
      endMonth: endDateIso ? endDateIso.slice(0, 7) : null,
      waitingOn: fixture.waitingOn ?? "not_waiting",
      dueState: fixture.followUpDue?.state ?? "not_applicable",
      dueAtIso: fixture.followUpDue?.atIso ?? null,
    },
    guidance: {
      currentBaseRent: 1500,
      currentBaseRentSource: "RentVine",
      rentVerification: { state: "verified" },
      overallStatus: blockers.length ? "blocked" : "on_track",
      urgencyRank: 3,
      isBlocked: blockers.length > 0,
      blockers: blockers.map((label, index) => ({
        id: `blocker-${index}`,
        label,
        type: "dependency",
        phaseId: null,
        destination: { kind: "none" },
      })),
      action: blockers.length
        ? { kind: "blocked" }
        : { kind: "act", label: "Open", destination: { kind: "none" } },
    },
    processState: null,
  } as unknown as DeskLeaseRow;
}

export function renewalsRead(
  fixtures: readonly LeaseFixture[],
  options: {
    readonly coverage?: { startIso: string; endIso: string } | null;
    readonly currency?: { state: "fresh" | "stale" | "expired"; readAtIso: string };
    readonly degraded?: readonly string[];
    readonly readComplete?: boolean;
  } = {},
): TypedSourceRead<"renewals"> {
  return projectRenewalRead({
    status: "ok",
    rows: fixtures.map(deskRow),
    readComplete: options.readComplete ?? true,
    dataCurrency: {
      state: options.currency?.state ?? "fresh",
      readAtIso: options.currency?.readAtIso ?? TEST_NOW,
      ageMs: 0,
      refreshing: false,
      lastError: false,
    },
    ...(options.coverage === null
      ? {}
      : {
          coverage: options.coverage ?? { startIso: "2026-09-01", endIso: "2027-01-28" },
        }),
    degraded: options.degraded ?? [],
  });
}

// ---- My Work ----------------------------------------------------------------------------------

export function task(
  overrides: Partial<WorkTaskRecord> & { id: string },
): WorkTaskRecord {
  return {
    space_id: "renewals",
    source: { type: "manual", status: "verified" },
    task_type: "renewal_followup",
    title: `Task ${overrides.id}`,
    assignee_uid: "uid-me",
    creator_uid: "uid-me",
    state: "Not started",
    next_action: "Do the thing",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as WorkTaskRecord;
}

export function workRead(
  tasks: readonly WorkTaskRecord[],
  truncated = false,
): TypedSourceRead<"work"> {
  return projectWorkRead({
    tasks: [...tasks],
    server_now: TEST_NOW,
    may_be_truncated: truncated,
  });
}

// ---- Directly typed reads ---------------------------------------------------------------------

function typedRead<S extends OperationalSource, F>(
  source: S,
  records: readonly OperationalRecord<F>[],
  extra: Partial<TypedSourceRead<S>> = {},
): TypedSourceRead<S> {
  return {
    source,
    status: "ok",
    records,
    truncated: false,
    asOf: TEST_NOW,
    ...extra,
  } as unknown as TypedSourceRead<S>;
}

export function approvalsRead(
  items: ReadonlyArray<Partial<ApprovalRecordFacts> & { key: string; title?: string }>,
  extra: Partial<TypedSourceRead<"approvals">> = {},
): TypedSourceRead<"approvals"> {
  return typedRead(
    "approvals",
    items.map((item) => ({
      ref: { source: "approvals" as const, id: item.key },
      title: item.title ?? `Approval ${item.key}`,
      detail: "Ready for Approval",
      href: `/approval-queue?item=${item.key}`,
      blockers: [],
      facts: {
        kind: item.kind ?? "queue_item",
        queueItemId: item.queueItemId ?? item.key,
        status: item.status ?? "Ready for Approval",
        dueDateIso: item.dueDateIso ?? null,
        canApproveNow: item.canApproveNow ?? null,
        waitingReason: item.waitingReason ?? null,
        leaseId: item.leaseId ?? null,
      },
    })),
    extra,
  );
}

export function connectionsRead(
  items: ReadonlyArray<Partial<ConnectionRecordFacts> & { id: string; name?: string }>,
  extra: Partial<TypedSourceRead<"connections">> = {},
): TypedSourceRead<"connections"> {
  return typedRead(
    "connections",
    items.map((item) => ({
      ref: { source: "connections" as const, id: item.id },
      title: item.name ?? item.id,
      detail:
        item.state === "connected"
          ? "Connected · Verified and ready."
          : "Not connected · Add details.",
      href: "/connections",
      blockers: [],
      facts: {
        connectorId: item.id,
        state: item.state ?? "none",
        verifiedByLiveCheck: item.verifiedByLiveCheck ?? false,
        configuredCount: item.configuredCount ?? 0,
        requiredCount: item.requiredCount ?? 1,
      },
    })),
    extra,
  );
}

export function processesRead(
  items: ReadonlyArray<
    Partial<ProcessRecordFacts> & { id: string; title: string; blockers?: string[] }
  >,
): TypedSourceRead<"processes"> {
  return typedRead(
    "processes",
    items.map((item) => ({
      ref: { source: "processes" as const, id: `${item.kind ?? "run"}:${item.id}` },
      title: item.title,
      detail: `Run · ${item.status ?? "In Progress"}`,
      href:
        item.kind === "definition"
          ? `/processes/${item.id}`
          : `/workflow-runs/${item.id}`,
      blockers: item.blockers ?? [],
      facts: {
        kind: item.kind ?? "run",
        definitionId: item.definitionId ?? "def-1",
        status: item.status ?? "In Progress",
        spaceId: null,
        updatedAtIso: item.updatedAtIso ?? TEST_NOW,
        dueDateIso: item.dueDateIso ?? null,
      },
    })),
  );
}

export function maintenanceRead(
  items: ReadonlyArray<
    Partial<MaintenanceRecordFacts> & { id: string; title?: string; blockers?: string[] }
  >,
): TypedSourceRead<"maintenance"> {
  return typedRead(
    "maintenance",
    items.map((item) => ({
      ref: { source: "maintenance" as const, id: item.id },
      title: item.title ?? `Ticket ${item.id}`,
      detail: item.status ?? "Open",
      href: `/maintenance?ticket_id=${item.id}`,
      blockers: item.blockers ?? [],
      facts: {
        ticketId: item.id,
        status: item.status ?? "Open",
        waitingOn: item.waitingOn ?? null,
        createdAtIso: item.createdAtIso ?? TEST_NOW,
        assigneeUid: item.assigneeUid ?? null,
      },
    })),
  );
}

export function communicationsRead(
  items: ReadonlyArray<Partial<CommunicationRecordFacts> & { id: string }>,
): TypedSourceRead<"communications"> {
  return typedRead(
    "communications",
    items.map((item) => ({
      ref: { source: "communications" as const, id: item.id },
      title: "renewal owner email",
      detail: item.status ?? "linked",
      href: `/lease-renewal/live/desk/lease/${item.entityId ?? "x"}`,
      blockers: [],
      facts: {
        linkId: item.id,
        lane: item.lane ?? "renewals",
        entityType: item.entityType ?? "renewal_lease",
        entityId: item.entityId ?? "x",
        status: item.status ?? "linked",
        waitingOn: item.waitingOn ?? null,
        lastContactIso: item.lastContactIso ?? null,
      },
    })),
    {
      note: "Only workflow-linked email you linked in the app is included; no inbox search runs.",
    },
  );
}
