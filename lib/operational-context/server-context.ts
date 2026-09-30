// S137 server wiring: one request-scoped context whose reads call the owning services as the signed-in
// actor. Each read runs at most once per request, keeps its own failure state, and never widens the
// actor's role or Space access. Nothing here writes, sends, drafts, starts a run, or calls a
// stateful provider GET (RentVine chat sync is never read here). The renewal and approval reads use
// the same orchestrations as their owning pages, including the separately approved notice metadata.

import { buildNeedsDecisionInbox } from "@/lib/approval/needs-decision-inbox";
import { canViewApprovalQueueItem } from "@/lib/approval/queue";
import { buildRenewalReviewBoard } from "@/lib/approval/renewal-review";
import { buildWritebackApprovalQueue } from "@/lib/approval/writeback-approval-queue";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import {
  buildConnectionView,
  projectConnectorConnection,
  type ConnectorConnectionView,
} from "@/lib/connections/connection-status";
import { can } from "@/lib/auth/roles";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import { getVerifiedConnectorIds } from "@/lib/connections/verification";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { listApprovalQueue } from "@/lib/firestore/approval-queue";
import { getConnectorConnectionStore } from "@/lib/firestore/connector-connections";
import { listMaintenancePropertyPreapprovals } from "@/lib/firestore/maintenance-property-preapprovals";
import { listMaintenanceTickets } from "@/lib/firestore/maintenance-tickets";
import { getMaintenanceWorkOrderLink } from "@/lib/firestore/maintenance-work-order-links";
import { WorkAccountabilityStore } from "@/lib/firestore/work-accountability";
import { listProcessDefinitions, listWorkflowRuns } from "@/lib/firestore/workflows";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { loadRenewalAssistantSource } from "@/lib/lease-renewal/assistant-source";
import { loadRenewalRunViews } from "@/lib/lease-renewal/renewal-review-board";
import {
  effectivePropertyPreapproval,
  maintenancePropertyIdentity,
} from "@/lib/maintenance/property-identity";
import {
  projectMaintenanceWaitingOn,
  type MaintenanceWaitingOnProjection,
} from "@/lib/maintenance/waiting-on";
import {
  filterProcessDefinitionsForUser,
  filterWorkflowRunsForUser,
} from "@/lib/space-scope-resources";
import { listWorkAssignableUsers } from "@/lib/work-accountability/roster";
import {
  projectApprovalRead,
  projectCommunicationRead,
  projectConnectionRead,
  projectMaintenanceRead,
  projectProcessRead,
  projectRenewalRead,
  projectWorkRead,
} from "@/lib/operational-context/projections";
import {
  notAuthorizedRead,
  unavailableRead,
  type KnownPerson,
  type OperationalContext,
  type OperationalSource,
  type TypedSourceRead,
} from "@/lib/operational-context/types";

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

/** Log only the source key and error class; never provider bodies or record values. */
function logReadFailure(source: string, error: unknown): void {
  console.error(`Operational context ${source} read failed (${errorClass(error)}).`);
}

type Loaders = { [S in OperationalSource]: () => Promise<TypedSourceRead<S>> };

export function createServerOperationalContext(
  user: AuthenticatedUser,
  now: Date,
): OperationalContext {
  const nowIso = now.toISOString();
  const db = () => getAdminFirestore();

  const loaders: Loaders = {
    renewals: async () => {
      if (!hasSpaceAccess(user, "renewals"))
        return notAuthorizedRead(
          "renewals",
          "Renewal records need access to the Renewals Space.",
        );
      try {
        const source = await loadRenewalAssistantSource(user, now);
        if (source.outcome.status !== "ok")
          return projectRenewalRead({ status: source.outcome.status, rows: [] });
        return projectRenewalRead({
          status: "ok",
          rows: source.outcome.view.items,
          readComplete: source.outcome.view.readComplete,
          dataCurrency: source.outcome.view.dataCurrency,
          coverage: source.coverage,
          degraded: source.auxiliaryFailures.map((failure) => failure.key),
        });
      } catch (error) {
        logReadFailure("renewals", error);
        return unavailableRead(
          "renewals",
          "The renewal source could not be read just now.",
        );
      }
    },
    work: async () => {
      try {
        return projectWorkRead(
          await new WorkAccountabilityStore({ db: db() }).listSnapshot(user, "mine"),
        );
      } catch (error) {
        logReadFailure("work", error);
        return unavailableRead("work", "Your My Work list could not be read just now.");
      }
    },
    approvals: async () => {
      if (!hasSpaceAccess(user, "renewals"))
        return notAuthorizedRead(
          "approvals",
          "The Approval Queue needs access to the Renewals Space.",
        );
      const [queueResult, viewsResult] = await Promise.allSettled([
        listApprovalQueue(user),
        loadRenewalRunViews(user),
      ]);
      if (queueResult.status === "rejected") {
        logReadFailure("approvals", queueResult.reason);
        return unavailableRead(
          "approvals",
          "The Approval Queue could not be read just now.",
        );
      }
      const queueItems = queueResult.value.filter((item) =>
        canViewApprovalQueueItem(user, item),
      );
      let board;
      let writebacks;
      let renewalFeedFailed = viewsResult.status === "rejected";
      if (viewsResult.status === "fulfilled") {
        try {
          board = buildRenewalReviewBoard(viewsResult.value);
          writebacks = buildWritebackApprovalQueue(viewsResult.value);
        } catch (error) {
          logReadFailure("approvals.renewal_feed", error);
          renewalFeedFailed = true;
        }
      } else logReadFailure("approvals.renewal_feed", viewsResult.reason);
      return projectApprovalRead({
        actor: user,
        inbox: buildNeedsDecisionInbox(queueItems, board, writebacks, user),
        queueItems,
        renewalFeedFailed,
        asOf: nowIso,
      });
    },
    connections: async () => {
      let verifiedIds: ReadonlySet<string> = new Set();
      let liveChecksFailed = false;
      try {
        verifiedIds = await getVerifiedConnectorIds();
      } catch (error) {
        logReadFailure("connections.live_checks", error);
        liveChecksFailed = true;
      }
      let connections = new Map<string, ConnectorConnectionView>();
      try {
        const canManage = can(user.role, "manageAdmin");
        const records = await getConnectorConnectionStore().listConnections();
        connections = new Map(
          records.map((record) => [
            record.connectorId,
            projectConnectorConnection(record, canManage),
          ]),
        );
      } catch (error) {
        logReadFailure("connections.records", error);
      }
      return projectConnectionRead({
        view: buildConnectionView(readConnectorPresence(), verifiedIds, connections),
        verifiedIds,
        liveChecksFailed,
        asOf: nowIso,
      });
    },
    processes: async () => {
      let definitions;
      try {
        definitions = filterProcessDefinitionsForUser(
          user,
          await listProcessDefinitions(user),
        );
      } catch (error) {
        logReadFailure("processes", error);
        return unavailableRead(
          "processes",
          "Internal Processes could not be read just now.",
        );
      }
      try {
        const runs = filterWorkflowRunsForUser(user, await listWorkflowRuns(user));
        return projectProcessRead({ definitions, runs, runsFailed: false, asOf: nowIso });
      } catch (error) {
        logReadFailure("processes.runs", error);
        return projectProcessRead({
          definitions,
          runs: [],
          runsFailed: true,
          asOf: nowIso,
        });
      }
    },
    maintenance: async () => {
      if (!hasSpaceAccess(user, "maintenance"))
        return notAuthorizedRead(
          "maintenance",
          "Maintenance tickets need access to the Maintenance Space.",
        );
      let tickets;
      try {
        tickets = await listMaintenanceTickets(user);
      } catch (error) {
        logReadFailure("maintenance", error);
        return unavailableRead(
          "maintenance",
          "The maintenance ticket queue could not be read just now.",
        );
      }
      const waitingOn = new Map<string, MaintenanceWaitingOnProjection>();
      let blockerViewFailed = false;
      try {
        const preapprovals = await listMaintenancePropertyPreapprovals(user);
        const byProperty = new Map(
          preapprovals.map((entry) => [entry.property_key, entry] as const),
        );
        const links = await Promise.all(
          tickets.map(async (ticket) => getMaintenanceWorkOrderLink(user, ticket.id)),
        );
        tickets.forEach((ticket, index) => {
          const link = links[index] ?? null;
          const { propertyId } = maintenancePropertyIdentity(ticket, link);
          waitingOn.set(
            ticket.id,
            projectMaintenanceWaitingOn({
              ticket,
              link,
              preapproval: effectivePropertyPreapproval(
                propertyId ? (byProperty.get(propertyId) ?? null) : null,
                nowIso,
              ),
            }),
          );
        });
      } catch (error) {
        logReadFailure("maintenance.blockers", error);
        blockerViewFailed = true;
      }
      return projectMaintenanceRead({
        tickets,
        waitingOn,
        blockerViewFailed,
        asOf: nowIso,
      });
    },
    communications: async () => {
      try {
        const links = await createGmailHubService(user).listCommunications();
        return projectCommunicationRead({ links, asOf: nowIso });
      } catch (error) {
        logReadFailure("communications", error);
        return unavailableRead(
          "communications",
          "Your workflow-linked email records could not be read just now.",
        );
      }
    },
  };

  const memo = new Map<string, Promise<unknown>>();
  function once<T>(key: string, load: () => Promise<T>): Promise<T> {
    let pending = memo.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = load();
      memo.set(key, pending);
    }
    return pending;
  }

  return {
    actorUid: user.uid,
    nowIso,
    read: <S extends OperationalSource>(source: S) =>
      once(source, loaders[source] as () => Promise<TypedSourceRead<S>>),
    readTeamWork: () =>
      once("work.team", async () => {
        if (user.role !== "Admin")
          return notAuthorizedRead(
            "work",
            "Only an Admin can see other people's assigned work.",
          );
        try {
          return projectWorkRead(
            await new WorkAccountabilityStore({ db: db() }).listSnapshot(user, "team"),
          );
        } catch (error) {
          logReadFailure("work.team", error);
          return unavailableRead(
            "work",
            "The team work view could not be read just now.",
          );
        }
      }),
    listKnownPeople: () =>
      once("people", async (): Promise<readonly KnownPerson[] | null> => {
        if (user.role !== "Admin") return null;
        try {
          return (await listWorkAssignableUsers()).map((person) => ({
            uid: person.uid,
            label: person.email,
            email: person.email,
          }));
        } catch (error) {
          logReadFailure("people", error);
          return null;
        }
      }),
  };
}
