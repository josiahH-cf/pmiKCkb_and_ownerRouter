import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { projectRenewalItems } from "@/lib/assistant/renewal-adapter";
import type { NeedsDecisionInbox } from "@/lib/approval/needs-decision-inbox";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { ApprovalQueueItemRecord } from "@/lib/firestore/types";
import {
  projectApprovalRead,
  projectCommunicationRead,
  projectConnectionRead,
  projectProcessRead,
  projectRenewalRead,
  projectWorkRead,
} from "@/lib/operational-context/projections";
import type { WorkflowCommunicationLink } from "@/lib/gmail-hub/workflow-context";
import { TEST_NOW, deskRow, task } from "@/tests/helpers/operational-context-fake";

// S137: one actor-scoped typed context over the owning services. Projections keep the owning views'
// identities, labels and links; failure states stay distinct; the server wiring reads each source at
// most once per request as the signed-in actor and never widens role or Space access.

const loaders = vi.hoisted(() => ({
  loadRenewalAssistantSource: vi.fn(),
  listApprovalQueue: vi.fn(),
  loadRenewalRunViews: vi.fn(),
  listSnapshot: vi.fn(),
  listWorkAssignableUsers: vi.fn(),
  listCommunications: vi.fn(),
  listProcessDefinitions: vi.fn(),
  listWorkflowRuns: vi.fn(),
  listMaintenanceTickets: vi.fn(),
  listMaintenanceWorkOrderLinks: vi.fn(),
  getMaintenanceWorkOrderLink: vi.fn(),
}));

vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => ({}) }));
vi.mock("@/lib/lease-renewal/assistant-source", () => ({
  loadRenewalAssistantSource: loaders.loadRenewalAssistantSource,
}));
vi.mock("@/lib/firestore/approval-queue", () => ({
  listApprovalQueue: loaders.listApprovalQueue,
}));
vi.mock("@/lib/lease-renewal/renewal-review-board", () => ({
  loadRenewalRunViews: loaders.loadRenewalRunViews,
}));
vi.mock("@/lib/firestore/work-accountability", () => ({
  WorkAccountabilityStore: class {
    listSnapshot(...args: unknown[]) {
      return loaders.listSnapshot(...args);
    }
  },
}));
vi.mock("@/lib/work-accountability/roster", () => ({
  listWorkAssignableUsers: loaders.listWorkAssignableUsers,
}));
vi.mock("@/lib/gmail-hub/dependencies", () => ({
  createGmailHubService: () => ({ listCommunications: loaders.listCommunications }),
}));
vi.mock("@/lib/firestore/workflows", () => ({
  listProcessDefinitions: loaders.listProcessDefinitions,
  listWorkflowRuns: loaders.listWorkflowRuns,
}));
vi.mock("@/lib/firestore/maintenance-tickets", () => ({
  listMaintenanceTickets: loaders.listMaintenanceTickets,
}));
vi.mock("@/lib/firestore/maintenance-property-preapprovals", () => ({
  listMaintenancePropertyPreapprovals: async () => [],
}));
vi.mock("@/lib/firestore/maintenance-work-order-links", () => ({
  getMaintenanceWorkOrderLink: loaders.getMaintenanceWorkOrderLink,
  listMaintenanceWorkOrderLinks: loaders.listMaintenanceWorkOrderLinks,
}));
vi.mock("@/lib/connections/verification", () => ({
  getVerifiedConnectorIds: async () => new Set<string>(),
}));
vi.mock("@/lib/firestore/connector-connections", () => ({
  getConnectorConnectionStore: () => ({ listConnections: async () => [] }),
}));

const editor: AuthenticatedUser = {
  uid: "uid-editor",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  for (const loader of Object.values(loaders)) loader.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("S137 projections keep the owning views' identities and states", () => {
  it("projects renewal rows with the desk's ids, labels, links, blockers and date keys", () => {
    const rows = [
      deskRow({
        id: "L1",
        endDateIso: "2026-10-05",
        blockers: ["Owner has not responded"],
      }),
      deskRow({
        id: "L2",
        followUpDue: { state: "due", atIso: "2026-09-29T15:00:00.000Z" },
      }),
    ];
    const read = projectRenewalRead({ status: "ok", rows, readComplete: true });
    const items = projectRenewalItems(rows);
    expect(read.status).toBe("ok");
    expect(
      read.records.map((record) => [record.ref.id, record.title, record.href]),
    ).toEqual(items.map((item) => [item.id, item.title, item.href]));
    expect(read.records[0].blockers).toEqual(["Owner has not responded"]);
    expect(read.records[0].facts).toMatchObject({ endMonth: "2026-10", blocked: true });
    expect(read.records[1].facts).toMatchObject({
      followUpDueState: "due",
      followUpDueAtIso: "2026-09-29T15:00:00.000Z",
    });
  });

  it("keeps a failed, unconfigured, incomplete and stale renewal read distinct", () => {
    expect(projectRenewalRead({ status: "read_error", rows: [] })).toMatchObject({
      status: "unavailable",
      note: "The renewal source could not be read just now.",
    });
    expect(projectRenewalRead({ status: "not_configured", rows: [] }).note).toMatch(
      /not connected/,
    );
    const incomplete = projectRenewalRead({
      status: "ok",
      rows: [],
      readComplete: false,
    });
    expect(incomplete).toMatchObject({ status: "partial", truncated: true });
    const stale = projectRenewalRead({
      status: "ok",
      rows: [],
      readComplete: true,
      dataCurrency: {
        state: "expired",
        readAtIso: TEST_NOW,
        ageMs: 1,
        refreshing: false,
        lastError: false,
      },
    });
    expect(stale.status).toBe("ok");
    expect(stale.currency).toEqual({ state: "expired", readAtIso: TEST_NOW });
    expect(stale.note).toMatch(/too old to act on/);
  });

  it("marks exactly the open My Work states open and a truncated snapshot partial", () => {
    const read = projectWorkRead({
      tasks: [
        task({ id: "a", state: "Not started" }),
        task({ id: "b", state: "In progress" }),
        task({ id: "c", state: "Paused" }),
        task({ id: "d", state: "Blocked" }),
        task({ id: "e", state: "Completed" }),
        task({ id: "f", state: "Cancelled" }),
      ],
      server_now: TEST_NOW,
      may_be_truncated: true,
    });
    expect(read.records.map((record) => record.facts.open)).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(read.status).toBe("partial");
    expect(read.note).toMatch(/record limit/);
  });

  it("takes approval eligibility from the queue's own rule, never from visibility", () => {
    const item = {
      id: "q1",
      status: "Ready for Approval",
      assignee_uid: "uid-other",
      required_approver_uid: null,
      action_execution_id: null,
      due_date: "2026-10-02",
    } as unknown as ApprovalQueueItemRecord;
    const inbox = {
      rows: [
        {
          kind: "queue_item",
          key: "queue:q1",
          label: "Approve rent change",
          detail: "Lease renewal",
          severity: "high",
          href: "/approval-queue?item=q1",
          itemId: "q1",
        },
        {
          kind: "renewal_flag",
          key: "flag:L1",
          label: "Review renewal",
          detail: "Owner decision",
          severity: "medium",
          href: "/lease-renewal/live/desk/lease/123",
        },
      ],
      counts: {},
    } as unknown as NeedsDecisionInbox;
    const read = projectApprovalRead({
      actor: editor,
      inbox,
      queueItems: [item],
      renewalFeedFailed: true,
      asOf: TEST_NOW,
    });
    expect(read.records[0].facts).toMatchObject({
      queueItemId: "q1",
      canApproveNow: false,
      waitingReason: "Approver or Admin role is required.",
    });
    expect(read.records[1].facts).toMatchObject({ canApproveNow: null, leaseId: "123" });
    expect(read.status).toBe("partial");
  });

  it("distinguishes configured connections from live-checked ones and keeps process definitions when runs fail", () => {
    const connections = projectConnectionRead({
      view: {
        items: [
          {
            def: { id: "rentvine", name: "RentVine" },
            status: {
              state: "connected",
              label: "Connected",
              detail: "Set up by an Admin.",
              configuredCount: 2,
              requiredCount: 2,
            },
          },
        ],
      } as never,
      verifiedIds: new Set(),
      liveChecksFailed: true,
      asOf: TEST_NOW,
    });
    expect(connections.records[0].facts).toMatchObject({
      state: "connected",
      verifiedByLiveCheck: false,
    });
    expect(connections.status).toBe("partial");
    const processes = projectProcessRead({
      definitions: [{ id: "d1", name: "Move-in", status: "Active" } as never],
      runs: [],
      runsFailed: true,
      asOf: TEST_NOW,
    });
    expect(processes.status).toBe("partial");
    expect(processes.records.map((record) => record.ref.id)).toEqual(["definition:d1"]);
  });

  it("projects workflow-linked email without any body, address or provider link", () => {
    const read = projectCommunicationRead({
      links: [
        {
          id: "m1",
          lane: "renewals",
          entity_type: "renewal_lease",
          entity_id: "123",
          purpose: "renewal_owner",
          status: "sent",
          waiting_on: "owner",
          last_contact_at_ms: Date.parse(TEST_NOW),
        } as unknown as WorkflowCommunicationLink,
      ],
      asOf: TEST_NOW,
    });
    expect(read.records[0].href).toBe("/lease-renewal/live/desk/lease/123");
    expect(JSON.stringify(read.records[0])).not.toMatch(/@|https?:|body|snippet/);
  });
});

describe("S137 server wiring reads as the actor, once per request", () => {
  async function context(user: AuthenticatedUser) {
    const { createServerOperationalContext } =
      await import("@/lib/operational-context/server-context");
    return createServerOperationalContext(user, new Date(TEST_NOW));
  }

  it("S168 starts the independent process run read before definitions finish", async () => {
    let finish!: (value: never[]) => void;
    loaders.listProcessDefinitions.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    loaders.listWorkflowRuns.mockResolvedValue([]);
    const ctx = await context(editor);
    const pending = ctx.read("processes");
    await Promise.resolve();
    await Promise.resolve();
    try {
      expect(loaders.listWorkflowRuns).toHaveBeenCalledWith(editor);
    } finally {
      finish([]);
      await pending;
    }
  });
  it.each(["cold_fixture", "warm_fixture"] as const)(
    "S168 comparable %s process and 80-ticket source workloads",
    async (temperature) => {
      const delayMs = temperature === "cold_fixture" ? 40 : 10;
      const delay = <T>(value: T) =>
        new Promise<T>((resolve) => setTimeout(() => resolve(value), delayMs));
      loaders.listProcessDefinitions.mockImplementation(() => delay([]));
      loaders.listWorkflowRuns.mockImplementation(() => delay([]));
      loaders.listMaintenanceTickets.mockResolvedValue(
        Array.from({ length: 80 }, (_, index) => ({
          id: `ticket-${index}`,
          state: "new",
          description: "Local fixture",
          created_at: TEST_NOW,
          updated_at: TEST_NOW,
        })),
      );
      loaders.getMaintenanceWorkOrderLink.mockImplementation(() => delay(null));
      loaders.listMaintenanceWorkOrderLinks.mockImplementation(() => delay(new Map()));
      const ctx = await context(editor);
      const start = performance.now();
      const processes = await ctx.read("processes");
      const processMs = Math.round(performance.now() - start);
      const maintenanceStart = performance.now();
      const maintenance = await ctx.read("maintenance");
      expect(processes.status).toBe("ok");
      expect(maintenance.records).toHaveLength(80);
      console.info(
        JSON.stringify({
          event: "batch005_fixture_benchmark",
          temperature,
          adapterDelayMs: delayMs,
          processMs,
          maintenanceMs: Math.round(performance.now() - maintenanceStart),
          ticketCount: maintenance.records.length,
          perTicketReads: loaders.getMaintenanceWorkOrderLink.mock.calls.length,
          batchReads: loaders.listMaintenanceWorkOrderLinks.mock.calls.length,
          environment:
            "native ready-process unit; deterministic adapters; not live service latency",
        }),
      );
    },
  );

  it("S168 reads maintenance links in one owning batch instead of once per ticket", async () => {
    loaders.listMaintenanceTickets.mockResolvedValue(
      Array.from({ length: 80 }, (_, index) => ({
        id: `ticket-${index}`,
        state: "new",
        description: "Local fixture",
        created_at: TEST_NOW,
        updated_at: TEST_NOW,
      })),
    );
    loaders.getMaintenanceWorkOrderLink.mockResolvedValue(null);
    loaders.listMaintenanceWorkOrderLinks.mockResolvedValue(new Map());
    const ctx = await context(editor);
    await ctx.read("maintenance");
    expect(loaders.listMaintenanceWorkOrderLinks).toHaveBeenCalledTimes(1);
    expect(loaders.getMaintenanceWorkOrderLink).not.toHaveBeenCalled();
  });

  // S167: an account without the Renewals Space used to get not_authorized here before any read.
  // Every staff account now reads both sources, still as the signed-in actor.
  it("reads renewals and approvals for an Editor as the actor, with no Space refusal", async () => {
    loaders.loadRenewalAssistantSource.mockResolvedValue({
      outcome: { status: "read_error" },
      coverage: undefined,
      auxiliaryFailures: [],
    });
    loaders.listApprovalQueue.mockResolvedValue([]);
    loaders.loadRenewalRunViews.mockResolvedValue([]);
    const ctx = await context(editor);

    const renewals = await ctx.read("renewals");
    const approvals = await ctx.read("approvals");

    expect(renewals.status).toBe("unavailable");
    expect(approvals.status).toBe("ok");
    expect(loaders.loadRenewalAssistantSource).toHaveBeenCalledWith(
      editor,
      new Date(TEST_NOW),
    );
    expect(loaders.listApprovalQueue).toHaveBeenCalledWith(editor);
    expect(loaders.loadRenewalRunViews).toHaveBeenCalledWith(editor);
  });

  it("reads each source at most once per request", async () => {
    loaders.loadRenewalAssistantSource.mockResolvedValue({
      outcome: { status: "read_error" },
      coverage: undefined,
      auxiliaryFailures: [],
    });
    const ctx = await context(editor);
    await Promise.all([ctx.read("renewals"), ctx.read("renewals")]);
    await ctx.read("renewals");
    expect(loaders.loadRenewalAssistantSource).toHaveBeenCalledTimes(1);
    expect(loaders.loadRenewalAssistantSource).toHaveBeenCalledWith(
      editor,
      new Date(TEST_NOW),
    );
  });

  it("turns a thrown read into an unavailable source and logs only the error class", async () => {
    loaders.listSnapshot.mockRejectedValue(new TypeError("secret provider body"));
    const ctx = await context(editor);
    const read = await ctx.read("work");
    expect(read.status).toBe("unavailable");
    expect(loaders.listSnapshot).toHaveBeenCalledWith(editor, "mine");
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("TypeError");
    expect(logged).not.toContain("secret provider body");
  });

  it("keeps other people's work and the staff roster Admin-only", async () => {
    const ctx = await context(editor);
    expect((await ctx.readTeamWork()).status).toBe("not_authorized");
    expect(await ctx.listKnownPeople()).toBeNull();
    expect(loaders.listSnapshot).not.toHaveBeenCalled();
    expect(loaders.listWorkAssignableUsers).not.toHaveBeenCalled();

    loaders.listWorkAssignableUsers.mockResolvedValue([
      { uid: "uid-casey", email: "casey.doe@pmikcmetro.com" },
    ]);
    loaders.listSnapshot.mockResolvedValue({
      tasks: [],
      server_now: TEST_NOW,
      may_be_truncated: false,
    });
    const admin = await context({ ...editor, role: "Admin" });
    expect((await admin.readTeamWork()).status).toBe("ok");
    expect(loaders.listSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ role: "Admin" }),
      "team",
    );
    expect(await admin.listKnownPeople()).toEqual([
      {
        uid: "uid-casey",
        label: "casey.doe@pmikcmetro.com",
        email: "casey.doe@pmikcmetro.com",
      },
    ]);
  });

  it("lists only the actor's own workflow-linked email records", async () => {
    loaders.listCommunications.mockResolvedValue([]);
    const ctx = await context(editor);
    expect((await ctx.read("communications")).status).toBe("ok");
    expect(loaders.listCommunications).toHaveBeenCalledTimes(1);
  });
});
