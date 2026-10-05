// S137 pure projections from each owning service's own read result into the shared typed context.
// Every function here is deterministic and performs no I/O: the loaders in server-context.ts call
// the owning services as the signed-in actor and hand their results to these projections. Titles,
// details and links reuse the owning views' wording so a record reads the same everywhere.

import { projectRenewalItems } from "@/lib/assistant/renewal-adapter";
import { projectWorkItems } from "@/lib/assistant/work-adapter";
import type { NeedsDecisionInbox } from "@/lib/approval/needs-decision-inbox";
import {
  isQueueItemTerminal,
  queueActionAvailability,
  type ApprovalQueueActor,
} from "@/lib/approval/queue";
import type { ConnectionCenterView } from "@/lib/connections/connection-status";
import { formatBusinessTimestamp, formatCalendarDate } from "@/lib/date-display";
import {
  communicationStateOf,
  describeCommunicationState,
} from "@/lib/gmail-hub/communication-state";
import type {
  ApprovalQueueItemRecord,
  ProcessDefinitionRecord,
  WorkflowRunRecord,
} from "@/lib/firestore/types";
import {
  workflowEntityHref,
  type WorkflowCommunicationLink,
} from "@/lib/gmail-hub/workflow-context";
import type { DeskDataCurrency, DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import {
  renewalDeskItemInScope,
  renewalDeskItemIsBlocked,
} from "@/lib/lease-renewal/desk-query-v2";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import {
  MAINTENANCE_WAITING_ON_LABELS,
  type MaintenanceWaitingOnProjection,
} from "@/lib/maintenance/waiting-on";
import {
  OPEN_WORK_TASK_STATES,
  type WorkAccountabilitySnapshot,
  type WorkTaskState,
} from "@/lib/work-accountability/types";
import type {
  ApprovalRecordFacts,
  CommunicationRecordFacts,
  ConnectionRecordFacts,
  MaintenanceRecordFacts,
  OperationalRecord,
  ProcessRecordFacts,
  RenewalRecordFacts,
  TypedSourceRead,
  WorkRecordFacts,
} from "@/lib/operational-context/types";

// ---- Renewals -------------------------------------------------------------------------------

export interface RenewalSourceSnapshot {
  readonly status: "ok" | "read_error" | "not_configured" | "account_mismatch";
  readonly rows: readonly DeskLeaseRow[];
  readonly readComplete?: boolean;
  readonly dataCurrency?: DeskDataCurrency;
  readonly coverage?: { readonly startIso: string; readonly endIso: string };
  readonly degraded?: readonly string[];
}

const WAITING_LABELS: Record<string, string> = {
  owner: "Waiting on the owner",
  tenant: "Waiting on the tenant",
  resident: "Waiting on the resident",
  team: "Waiting on the team",
  needs_verification: "Waiting status needs verification",
};

export function projectRenewalRead(
  snapshot: RenewalSourceSnapshot,
): TypedSourceRead<"renewals"> {
  if (snapshot.status !== "ok") {
    return {
      source: "renewals",
      status: "unavailable",
      records: [],
      truncated: false,
      asOf: null,
      note:
        snapshot.status === "not_configured"
          ? "The renewal sources are not connected in this environment."
          : "The renewal source could not be read just now.",
    };
  }
  const items = projectRenewalItems(snapshot.rows);
  const records: OperationalRecord<RenewalRecordFacts>[] = snapshot.rows.map(
    (row, index) => ({
      ref: { source: "renewals", id: row.id },
      title: items[index].title,
      detail: items[index].detail,
      href: items[index].href,
      ...(row.sourceDestinations?.rentvine
        ? {
            sourceHref: `/lease-renewal/live/desk/lease/${encodeURIComponent(row.id)}/rentvine`,
          }
        : {}),
      blockers: items[index].blockers,
      facts: {
        leaseId: row.id,
        endDateIso: row.endDateIso,
        endMonth: row.queryKeys.endMonth ?? null,
        followUpDueState: row.queryKeys.dueState ?? "needs_verification",
        followUpDueAtIso: row.queryKeys.dueAtIso ?? null,
        inDefaultScope: renewalDeskItemInScope(row),
        blocked: renewalDeskItemIsBlocked(row),
        ownerNames: row.ownerNameLabels,
        tenantNames: row.tenantNameLabels,
        address: row.addressLabel,
        propertyName: row.propertyNameLabel,
        unitLabel: row.identity.unit?.label?.label ?? null,
        stage: row.stageLabel,
        nextAction: row.nextAction,
        waitingOn: WAITING_LABELS[row.queryKeys.waitingOn] ?? null,
        workStatus: row.workStatus?.state === "recorded" ? row.workStatus.label : null,
        lifecycle: row.lifecycle?.label ?? null,
      },
    }),
  );
  const degraded = [...(snapshot.degraded ?? [])];
  if (snapshot.readComplete === false) degraded.push("portfolio_read_incomplete");
  const stale =
    snapshot.dataCurrency && snapshot.dataCurrency.state !== "fresh"
      ? `Renewal data was last read ${formatBusinessTimestamp(snapshot.dataCurrency.readAtIso)} and is ${snapshot.dataCurrency.state === "expired" ? "too old to act on" : "stale"}.`
      : undefined;
  return {
    source: "renewals",
    status: degraded.length ? "partial" : "ok",
    records,
    truncated: snapshot.readComplete === false,
    asOf: snapshot.dataCurrency?.readAtIso ?? null,
    ...(snapshot.dataCurrency
      ? {
          currency: {
            state: snapshot.dataCurrency.state,
            readAtIso: snapshot.dataCurrency.readAtIso,
          },
        }
      : {}),
    ...(snapshot.coverage ? { coverage: snapshot.coverage } : {}),
    ...(degraded.length ? { degraded } : {}),
    ...(degraded.length || stale
      ? {
          note: [
            degraded.includes("portfolio_read_incomplete")
              ? "The RentVine portfolio read did not return every lease."
              : degraded.length
                ? "Some supporting renewal records did not answer."
                : null,
            stale ?? null,
          ]
            .filter(Boolean)
            .join(" "),
        }
      : {}),
  };
}

// ---- My Work --------------------------------------------------------------------------------

export function projectWorkRead(
  snapshot: Pick<WorkAccountabilitySnapshot, "tasks" | "server_now" | "may_be_truncated">,
): TypedSourceRead<"work"> {
  const items = projectWorkItems(snapshot.tasks);
  const records: OperationalRecord<WorkRecordFacts>[] = snapshot.tasks.map(
    (task, index) => ({
      ref: { source: "work", id: task.id },
      title: items[index].title,
      detail: items[index].detail,
      href: items[index].href,
      blockers: items[index].blockers,
      facts: {
        taskId: task.id,
        state: task.state,
        open: OPEN_WORK_TASK_STATES.has(task.state as WorkTaskState),
        dueAtIso: task.due_at ?? null,
        blocked: task.state === "Blocked" || Boolean(task.blocker_reason),
        assigneeUid: task.assignee_uid ?? null,
        sourceType: task.source.type,
        sourceId: task.source.id ?? null,
        spaceId: task.space_id,
      },
    }),
  );
  return {
    source: "work",
    status: snapshot.may_be_truncated ? "partial" : "ok",
    records,
    truncated: snapshot.may_be_truncated,
    asOf: snapshot.server_now,
    ...(snapshot.may_be_truncated
      ? {
          note: "My Work reached its record limit, so older tasks may be missing from this answer.",
        }
      : {}),
  };
}

// ---- Approvals ------------------------------------------------------------------------------

const LEASE_PATH = /\/lease-renewal\/live\/desk\/lease\/(\d+)/;

export function projectApprovalRead(input: {
  readonly actor: ApprovalQueueActor;
  readonly inbox: NeedsDecisionInbox;
  readonly queueItems: readonly ApprovalQueueItemRecord[];
  readonly renewalFeedFailed: boolean;
  readonly asOf: string;
}): TypedSourceRead<"approvals"> {
  const byId = new Map(input.queueItems.map((item) => [item.id, item] as const));
  const records: OperationalRecord<ApprovalRecordFacts>[] = input.inbox.rows.map(
    (row) => {
      const item = row.itemId ? byId.get(row.itemId) : undefined;
      const availability = item ? queueActionAvailability(input.actor, item) : null;
      const leaseMatch = LEASE_PATH.exec(row.href);
      const status = item?.status ?? null;
      return {
        ref: { source: "approvals", id: row.key },
        title: row.label,
        detail: [row.detail, status].filter(Boolean).join(" · "),
        href: row.href,
        blockers: [],
        facts: {
          kind: row.kind,
          queueItemId: item?.id ?? null,
          status,
          dueDateIso: item?.due_date ?? null,
          canApproveNow: availability ? availability.approve : null,
          waitingReason:
            availability && !availability.approve
              ? (availability.approveReason ?? null)
              : null,
          leaseId: leaseMatch?.[1] ?? null,
        },
      };
    },
  );
  return {
    source: "approvals",
    status: input.renewalFeedFailed ? "partial" : "ok",
    records,
    truncated: false,
    asOf: input.asOf,
    ...(input.renewalFeedFailed
      ? {
          note: "The renewal review feed did not answer, so renewal flags and write-backs may be missing.",
          degraded: ["renewal_review_feed"],
        }
      : {}),
  };
}

/** Open queue items that still need a decision, matching the unified inbox rule. */
export function queueItemIsOpen(item: Pick<ApprovalQueueItemRecord, "status">): boolean {
  return (
    !isQueueItemTerminal(item.status) &&
    item.status !== "Snoozed" &&
    item.status !== "Returned"
  );
}

// ---- Connections ----------------------------------------------------------------------------

export function projectConnectionRead(input: {
  readonly view: ConnectionCenterView;
  readonly verifiedIds: ReadonlySet<string>;
  readonly liveChecksFailed: boolean;
  readonly asOf: string;
}): TypedSourceRead<"connections"> {
  const records: OperationalRecord<ConnectionRecordFacts>[] = input.view.items.map(
    (item) => ({
      ref: { source: "connections", id: item.def.id },
      title: item.def.name,
      detail: `${item.status.label} · ${item.status.detail}`,
      href: "/connections",
      blockers: [],
      facts: {
        connectorId: item.def.id,
        state: item.status.state,
        verifiedByLiveCheck: input.verifiedIds.has(item.def.id),
        configuredCount: item.status.configuredCount,
        requiredCount: item.status.requiredCount,
      },
    }),
  );
  return {
    source: "connections",
    status: input.liveChecksFailed ? "partial" : "ok",
    records,
    truncated: false,
    asOf: input.asOf,
    note: input.liveChecksFailed
      ? "The live connection checks did not answer, so status reflects configuration only."
      : "Live connection checks are read-only and reused for up to ten minutes; the app keeps no longer check history.",
  };
}

// ---- Internal Processes ---------------------------------------------------------------------

export function projectProcessRead(input: {
  readonly definitions: readonly ProcessDefinitionRecord[];
  readonly runs: readonly WorkflowRunRecord[];
  readonly runsFailed: boolean;
  readonly asOf: string;
}): TypedSourceRead<"processes"> {
  const records: OperationalRecord<ProcessRecordFacts>[] = [
    ...input.definitions.map((definition) => ({
      ref: { source: "processes" as const, id: `definition:${definition.id}` },
      title: definition.name,
      detail: `Process definition · ${definition.status}`,
      href: `/processes/${encodeURIComponent(definition.id)}`,
      blockers: [],
      facts: {
        kind: "definition" as const,
        definitionId: definition.id,
        status: definition.status,
        spaceId: definition.space_id ?? null,
        updatedAtIso: definition.updated_at ?? null,
        dueDateIso: null,
      },
    })),
    ...input.runs.map((run) => ({
      ref: { source: "processes" as const, id: `run:${run.id}` },
      title: run.process_name,
      detail: [
        `Run · ${run.status}`,
        run.next_action ? `Next: ${run.next_action}` : null,
        run.due_date ? `due ${formatCalendarDate(run.due_date.slice(0, 10))}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/workflow-runs/${encodeURIComponent(run.id)}`,
      blockers: run.blocker ? [run.blocker] : [],
      facts: {
        kind: "run" as const,
        definitionId: run.definition_id,
        status: run.status,
        spaceId: run.space_id ?? null,
        updatedAtIso: run.updated_at,
        dueDateIso: run.due_date ? run.due_date.slice(0, 10) : null,
      },
    })),
  ];
  return {
    source: "processes",
    status: input.runsFailed ? "partial" : "ok",
    records,
    truncated: false,
    asOf: input.asOf,
    ...(input.runsFailed
      ? {
          note: "Process runs could not be read just now; process definitions are shown.",
          degraded: ["workflow_runs"],
        }
      : {}),
  };
}

// ---- Maintenance ----------------------------------------------------------------------------

export function projectMaintenanceRead(input: {
  readonly tickets: readonly MaintenanceTicketRecord[];
  readonly waitingOn: ReadonlyMap<string, MaintenanceWaitingOnProjection>;
  readonly blockerViewFailed: boolean;
  readonly asOf: string;
}): TypedSourceRead<"maintenance"> {
  const records: OperationalRecord<MaintenanceRecordFacts>[] = input.tickets.map(
    (ticket) => {
      const projection = input.waitingOn.get(ticket.id) ?? null;
      const waiting = projection
        ? `Waiting on: ${MAINTENANCE_WAITING_ON_LABELS[projection.waitingOn]}`
        : null;
      return {
        ref: { source: "maintenance", id: ticket.id },
        title: ticket.summary,
        detail: [ticket.status, ticket.unit?.label ?? null, waiting]
          .filter(Boolean)
          .join(" · "),
        href: `/maintenance?ticket_id=${encodeURIComponent(ticket.id)}`,
        blockers:
          projection && projection.waitingOn !== "none" && projection.nextAction
            ? [projection.nextAction]
            : [],
        facts: {
          ticketId: ticket.id,
          status: ticket.status,
          waitingOn: waiting,
          createdAtIso: ticket.created_at,
          assigneeUid: ticket.assignee_uid ?? null,
        },
      };
    },
  );
  return {
    source: "maintenance",
    status: input.blockerViewFailed ? "partial" : "ok",
    records,
    truncated: false,
    asOf: input.asOf,
    ...(input.blockerViewFailed
      ? {
          note: "The maintenance blocker view could not be read, so waiting-on details may be missing.",
          degraded: ["maintenance_blockers"],
        }
      : {}),
  };
}

// ---- Workflow-linked communications ---------------------------------------------------------

export function projectCommunicationRead(input: {
  readonly links: readonly WorkflowCommunicationLink[];
  readonly asOf: string;
}): TypedSourceRead<"communications"> {
  const records: OperationalRecord<CommunicationRecordFacts>[] = input.links.map(
    (link) => {
      const lastContactIso =
        typeof link.last_contact_at_ms === "number"
          ? new Date(link.last_contact_at_ms).toISOString()
          : null;
      const state = describeCommunicationState(
        communicationStateOf(link),
        formatBusinessTimestamp,
      );
      return {
        ref: { source: "communications", id: link.id },
        title: `${link.purpose.replaceAll("_", " ")} email`,
        // The same words the Communications hub and the linked detail use.
        detail: `${state.status} · ${state.evidence}`,
        href: workflowEntityHref(link),
        blockers: [],
        facts: {
          linkId: link.id,
          lane: link.lane,
          entityType: link.entity_type,
          entityId: link.entity_id,
          status: link.status,
          waitingOn: link.waiting_on ?? null,
          lastContactIso,
        },
      };
    },
  );
  return {
    source: "communications",
    status: "ok",
    records,
    truncated: false,
    asOf: input.asOf,
    note: "Only workflow-linked email you linked in the app is included; no inbox search runs.",
  };
}
