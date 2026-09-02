import { describe, expect, it } from "vitest";

import { ExternalExecutionError } from "@/lib/external-execution/types";
import type { ExternalActionInput } from "@/lib/external-execution/types";
import {
  RentVineWorkOrderChatSyncExecutor,
  WORK_ORDER_CHAT_SYNC_KEY,
  type ChatSyncCommitInput,
} from "@/lib/maintenance/execution/chat-sync-service";

const ACCOUNT = "rentvine:pmikcmetro";

function action(values: Record<string, unknown> = {}): ExternalActionInput {
  return {
    workflowId: "maintenance:ticket-9",
    actionId: "work-order-chat-sync:ticket-9:p1",
    actionKey: WORK_ORDER_CHAT_SYNC_KEY,
    dataMode: "live",
    values: {
      ticket_ref: "ticket-9",
      work_order_id: "9005",
      page: "1",
      page_size: "20",
      marks_read_for_managers: true,
      ...values,
    },
    sourceRefs: ["ticket:ticket-9", "rentvine:work-order:9005"],
  };
}

function tenantRow(overrides: Record<string, unknown> = {}) {
  return {
    "message.messageID": 501,
    "message.chatObjectTypeID": 1,
    "message.objectID": 9005,
    "message.roleTypeID": 2,
    "message.message": "The sink is still leaking.",
    "message.dateTimeCreated": "2026-09-01T15:04:05Z",
    "message.contactID": 77,
    "contact.contactID": 77,
    "message.userID": null,
    "user.userID": null,
    ...overrides,
  };
}

const PAGINATION_READ = {
  rows: [
    tenantRow(),
    {
      "message.messageID": 502,
      "message.chatObjectTypeID": 1,
      "message.objectID": 9005,
      "message.roleTypeID": 1,
      "message.message": "We scheduled the plumber.",
      "message.dateTimeCreated": "2026-09-01T16:00:00Z",
      "message.userID": 4,
      "user.userID": 4,
      "message.contactID": null,
      "contact.contactID": null,
    },
    { "message.messageID": 503, "message.chatObjectTypeID": 1, "message.objectID": 7 },
  ],
  pagination: { currentPage: 1, pageSize: 20, totalItems: 3, totalPages: 2, nextPage: 2 },
};

const LEASE_RESPONSE = {
  lease: { leaseID: "115" },
  tenants: [
    {
      leaseTenant: { leaseTenantID: "88", leaseID: "115", contactID: "77" },
      contact: { contactID: "77", email: "resident@residentdomain.test" },
    },
  ],
};

function harness(
  overrides: {
    chatRead?: () => Promise<typeof PAGINATION_READ>;
    getWorkOrder?: () => Promise<{ workOrder: { leaseId: string | null } }>;
    commit?: (input: ChatSyncCommitInput) => Promise<void>;
  } = {},
) {
  const calls = { chat: 0, workOrder: 0, lease: 0, commits: [] as ChatSyncCommitInput[] };
  const executor = new RentVineWorkOrderChatSyncExecutor({
    clients: () => ({
      chat: {
        listWorkOrderChatPage: async () => {
          calls.chat += 1;
          return overrides.chatRead ? overrides.chatRead() : PAGINATION_READ;
        },
      },
      workOrders: {
        getWorkOrder: async () => {
          calls.workOrder += 1;
          return (
            overrides.getWorkOrder
              ? overrides.getWorkOrder()
              : Promise.resolve({ workOrder: { leaseId: "115" } })
          ) as never;
        },
      },
      leases: { getLeaseWithTenants: async () => ((calls.lease += 1), LEASE_RESPONSE) },
    }),
    accountRef: ACCOUNT,
    commit: async (input) => {
      calls.commits.push(input);
      if (overrides.commit) await overrides.commit(input);
    },
  });
  return { executor, calls };
}

describe("S100 chat-sync executor", () => {
  it("validates without constructing any client and names each exact blocker", () => {
    const executor = new RentVineWorkOrderChatSyncExecutor({
      clients: () => {
        throw new Error("validate must never construct clients");
      },
      accountRef: ACCOUNT,
      commit: async () => {},
    });
    expect(
      executor.validate({ ...action(), actionKey: "rentvine.work_order.read" }),
    ).toMatch(/wrong action key/);
    expect(executor.validate(action({ ticket_ref: "  " }))).toMatch(/ticket_ref/);
    expect(executor.validate(action({ work_order_id: "0900" }))).toMatch(
      /canonical positive decimal/,
    );
    expect(executor.validate(action({ page: "0" }))).toMatch(/confirmed page/);
    expect(executor.validate(action({ page_size: "25" }))).toMatch(/exact literal "20"/);
    expect(executor.validate(action({ marks_read_for_managers: false }))).toMatch(
      /read marker/,
    );
    expect(executor.validate(action())).toBeNull();
  });

  it("refuses a blocked action definitively before the one dispatch", async () => {
    const { executor, calls } = harness();
    await expect(
      executor.execute(action({ marks_read_for_managers: false })),
    ).rejects.toMatchObject({ code: "blocked" });
    expect(calls.chat).toBe(0);
    expect(calls.commits).toHaveLength(0);
  });

  it("dispatches exactly once and commits decoded dispositions with resident bindings", async () => {
    const { executor, calls } = harness();
    const receipt = await executor.execute(action());

    expect(calls.chat).toBe(1);
    expect(calls.workOrder).toBe(1);
    expect(calls.lease).toBe(1);
    expect(calls.commits).toHaveLength(1);
    const commit = calls.commits[0];
    expect(commit.dispositions.map((entry) => entry.kind)).toEqual([
      "message",
      "message",
      "rejected",
    ]);
    expect(commit.residentBindings.get(77)).toMatchObject({
      contactId: 77,
      leaseId: "115",
      leaseTenantId: "88",
    });
    expect(commit.pagination.nextPage).toBe(2);

    expect(receipt.providerRef).toBe("chat:9005:page:1");
    expect(receipt.outcome).toBe("succeeded");
    expect(receipt.reconciled).toBe(false);
    expect(receipt.resultHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("skips the lease read when the work order no longer binds a lease", async () => {
    const { executor, calls } = harness({
      getWorkOrder: async () => ({ workOrder: { leaseId: null } }),
    });
    await executor.execute(action());
    expect(calls.lease).toBe(0);
    expect(calls.commits[0].residentBindings.size).toBe(0);
  });

  it("treats a post-dispatch relation-read failure as ambiguous, never definitive", async () => {
    const { executor, calls } = harness({
      getWorkOrder: async () => {
        throw new Error("provider timeout");
      },
    });
    await expect(executor.execute(action())).rejects.toMatchObject({
      code: "ambiguous",
    });
    expect(calls.chat).toBe(1);
    expect(calls.commits).toHaveLength(0);
  });

  it("treats a local commit failure after the dispatch as ambiguous", async () => {
    const { executor } = harness({
      commit: async () => {
        throw new Error("firestore write contention");
      },
    });
    const failure = await executor.execute(action()).catch((error) => error);
    expect(failure).toBeInstanceOf(ExternalExecutionError);
    expect((failure as ExternalExecutionError).code).toBe("ambiguous");
    expect(String(failure)).toMatch(/may already be marked read/);
  });

  it("never reconciles via the provider: reconcile always resolves null", async () => {
    const { executor, calls } = harness();
    await expect(executor.reconcile()).resolves.toBeNull();
    expect(calls.chat).toBe(0);
  });
});
