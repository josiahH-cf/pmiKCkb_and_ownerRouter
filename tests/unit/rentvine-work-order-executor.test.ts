import { describe, expect, it } from "vitest";

import type { ExternalActionInput } from "@/lib/external-execution/types";
import { ExternalExecutionError } from "@/lib/external-execution/types";
import {
  RentVineWorkOrderReader,
  RentVineWorkOrderWriter,
} from "@/lib/integrations/rentvine/work-order-client";
import { RentVineWorkOrderWriteExecutor } from "@/lib/maintenance/execution/providers";

const CONFIG = {
  baseUrl: "https://pmikcmetro.rentvine.com/api/manager",
  apiKey: "unit-key",
  apiSecret: "unit-secret",
};

interface FakeState {
  created: boolean;
  record: Record<string, unknown>;
  statuses: Record<string, { name: string; primary: string }>;
  /** Applied to the record served AFTER the create/update POST (readback drift injection). */
  readbackDrift?: Record<string, unknown>;
  listIncomplete?: boolean;
}

function baseRecord(): Record<string, unknown> {
  return {
    workOrderID: "9005",
    workOrderNumber: "WO-9005",
    propertyID: "84",
    unitID: "217",
    workOrderStatusID: "9101",
    primaryWorkOrderStatusID: "2",
    priorityID: "2",
    description: "Kitchen sink drips at the trap.",
    isOwnerApproved: "0",
    isVacant: "0",
    isSharedWithTenant: "0",
    isSharedWithOwner: "0",
  };
}

function harness(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    created: false,
    record: baseRecord(),
    statuses: {
      "9101": { name: "Open", primary: "2" },
      "9102": { name: "Completed", primary: "3" },
    },
    ...overrides,
  };
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const respond = (status: number, body: unknown) => ({
    status,
    headers: {} as Record<string, string>,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
  const transport = {
    async send(request: { method: string; url: string; body?: string }) {
      const path = new URL(request.url).pathname;
      const statusMatch = /\/work-order\/statuses\/(\d+)$/.exec(path);
      if (request.method === "GET" && statusMatch) {
        const entry = state.statuses[statusMatch[1]];
        if (!entry) return respond(400, { error: "Unknown status." });
        return respond(200, {
          workOrderStatus: {
            workOrderStatusID: statusMatch[1],
            primaryWorkOrderStatusID: entry.primary,
            name: entry.name,
            isSystemStatus: "1",
          },
        });
      }
      const detailMatch = /\/work-orders\/(\d+)$/.exec(path);
      if (request.method === "GET" && detailMatch) {
        if (!state.created) return respond(400, { error: "Unknown work order." });
        // Drift injection targets the post-write readback, not the fresh before-read.
        const drift = posts.length > 0 ? (state.readbackDrift ?? {}) : {};
        return respond(200, {
          workOrder: { ...state.record, ...drift },
          schedulingStatusID: null,
        });
      }
      if (request.method === "GET" && path.endsWith("/work-orders")) {
        if (state.listIncomplete) {
          const rows = Array.from({ length: 15 }, (_, index) => ({
            workOrder: { ...state.record, workOrderID: String(8000 + index) },
            contact: null,
          }));
          return respond(200, rows);
        }
        return respond(
          200,
          state.created ? [{ workOrder: { ...state.record }, contact: null }] : [],
        );
      }
      if (request.method === "POST" && path.endsWith("/work-orders")) {
        const body = JSON.parse(request.body ?? "{}") as Record<string, unknown>;
        posts.push({ path, body });
        state.created = true;
        state.record = {
          ...state.record,
          propertyID: body["propertyID"],
          unitID: body["unitID"],
          description: body["description"],
          priorityID: body["priorityID"],
          workOrderStatusID: body["workOrderStatusID"],
          isVacant: body["isVacant"] === true ? "1" : "0",
        };
        return respond(200, {
          workOrder: { ...state.record },
          schedulingStatusID: null,
        });
      }
      if (request.method === "POST" && detailMatch) {
        const body = JSON.parse(request.body ?? "{}") as Record<string, unknown>;
        posts.push({ path, body });
        state.record = {
          ...state.record,
          workOrderStatusID: body["workOrderStatusID"],
        };
        return respond(200, { workOrder: { ...state.record } });
      }
      return respond(400, { error: `unexpected ${request.method} ${path}` });
    },
  };
  const executor = new RentVineWorkOrderWriteExecutor(() => ({
    reader: new RentVineWorkOrderReader(CONFIG, transport),
    writer: new RentVineWorkOrderWriter(CONFIG, transport),
  }));
  return { executor, state, posts };
}

function createInput(
  overrides: Record<string, string | number | boolean | undefined> = {},
): ExternalActionInput {
  const values: Record<string, string | number | boolean | undefined> = {
    ticket_ref: "ticket-9",
    property_id: "84",
    unit_id: "217",
    description: "Kitchen sink drips at the trap.",
    priority_id: "2",
    work_order_status_id: "9101",
    is_vacant: false,
    owner_approved: false,
    shared_with_tenant: "0",
    shared_with_owner: false,
    send_vendor_notification: false,
    send_email: false,
    ...overrides,
  };
  const defined: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) defined[key] = value;
  }
  return {
    workflowId: "ticket-9",
    dataMode: "live",
    actionId: "create-1",
    actionKey: "rentvine.work_order.create",
    values: defined,
    sourceRefs: ["source:ticket-9"],
  };
}

function statusInput(
  overrides: Record<string, string | number | boolean> = {},
): ExternalActionInput {
  return {
    workflowId: "ticket-9",
    dataMode: "live",
    actionId: "status-1",
    actionKey: "rentvine.work_order.update_status",
    values: {
      work_order_id: "9005",
      current_status_id: "9101",
      target_status_id: "9102",
      send_vendor_notification: false,
      send_review: false,
      ...overrides,
    },
    sourceRefs: ["source:ticket-9"],
  };
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ExternalExecutionError);
    return (error as ExternalExecutionError).code;
  }
  throw new Error("expected an ExternalExecutionError");
}

describe("S99 official-contract work-order executor: create", () => {
  it("revalidates the initial status, POSTs the exact fixed-flag body once, and verifies readback", async () => {
    const { executor, posts } = harness();
    const receipt = await executor.execute(createInput());
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({
      propertyID: "84",
      unitID: "217",
      description: "Kitchen sink drips at the trap.",
      priorityID: "2",
      workOrderStatusID: "9101",
      isVacant: false,
      isOwnerApproved: false,
      isSharedWithTenant: "0",
      isSharedWithOwner: false,
      sendVendorNotification: false,
      sendEmail: false,
    });
    expect(receipt.providerRef).toBe("9005");
    expect(receipt.reconciled).toBe(false);
    // Bodyless evidence: the receipt carries hashes, never the reviewed description text.
    expect(JSON.stringify(receipt)).not.toContain("Kitchen sink");
  });

  it("refuses definitively before the POST when the status no longer groups Pending/Open", async () => {
    const { executor, posts, state } = harness();
    state.statuses["9101"] = { name: "Completed", primary: "3" };
    expect(await codeOf(executor.execute(createInput()))).toBe("provider");
    expect(posts).toHaveLength(0);
  });

  it("reports ambiguity when readback does not match the reviewed fields", async () => {
    const { executor, posts, state } = harness();
    state.readbackDrift = { description: "Someone edited this in RentVine." };
    expect(await codeOf(executor.execute(createInput()))).toBe("ambiguous");
    expect(posts).toHaveLength(1);
  });

  it("blocks unsupported priority, coerced flags, missing vacancy, and drifted literals before any read", async () => {
    const { executor, posts } = harness();
    expect(executor.validate(createInput({ priority_id: "4" }))).toMatch(/priority/);
    expect(executor.validate(createInput({ is_vacant: "false" }))).toMatch(/boolean/);
    expect(executor.validate(createInput({ is_vacant: undefined }))).toMatch(/boolean/);
    expect(executor.validate(createInput({ send_email: true }))).toMatch(/send_email/);
    expect(executor.validate(createInput({ shared_with_tenant: "1" }))).toMatch(
      /shared_with_tenant/,
    );
    expect(executor.validate(createInput({ property_id: "084" }))).toMatch(/decimal/);
    expect(posts).toHaveLength(0);
  });

  it("reconciles only when exactly one complete-list candidate matches every reviewed field", async () => {
    const { executor, state } = harness();
    state.created = true;
    const receipt = await executor.reconcile(createInput());
    expect(receipt?.reconciled).toBe(true);
    expect(receipt?.providerRef).toBe("9005");

    const empty = harness();
    expect(await empty.executor.reconcile(createInput())).toBeNull();

    const incomplete = harness({ listIncomplete: true, created: true });
    expect(await incomplete.executor.reconcile(createInput())).toBeNull();
  });
});

describe("S99 official-contract work-order executor: update_status", () => {
  it("verifies fresh before-state, POSTs the three-field body once, and binds unchanged tracked fields", async () => {
    const { executor, posts } = harness({ created: true });
    const receipt = await executor.execute(statusInput());
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({
      workOrderStatusID: "9102",
      sendVendorNotification: false,
      sendReview: false,
    });
    expect(receipt.providerRef).toBe("9005");
  });

  it("refuses definitively when the current status drifted, with zero POSTs", async () => {
    const { executor, posts, state } = harness({ created: true });
    state.record["workOrderStatusID"] = "9102";
    expect(await codeOf(executor.execute(statusInput()))).toBe("provider");
    expect(posts).toHaveLength(0);
  });

  it("refuses a shared work order before any write", async () => {
    const { executor, posts, state } = harness({ created: true });
    state.record["isSharedWithOwner"] = "1";
    expect(await codeOf(executor.execute(statusInput()))).toBe("provider");
    expect(posts).toHaveLength(0);
  });

  it("reports ambiguity when a tracked non-status field changed on readback", async () => {
    const { executor, state } = harness({ created: true });
    state.readbackDrift = { priorityID: "3" };
    expect(await codeOf(executor.execute(statusInput()))).toBe("ambiguous");
  });

  it("blocks a same-target update and non-decimal ids in validation", () => {
    const { executor } = harness();
    expect(executor.validate(statusInput({ target_status_id: "9101" }))).toMatch(
      /differ/,
    );
    expect(executor.validate(statusInput({ work_order_id: "wo-9005" }))).toMatch(
      /decimal/,
    );
    expect(executor.validate(statusInput({ send_review: true }))).toMatch(/send_review/);
  });

  it("reconciles to the observed target without claiming causality, else null", async () => {
    const applied = harness({ created: true });
    applied.state.record["workOrderStatusID"] = "9102";
    const receipt = await applied.executor.reconcile(statusInput());
    expect(receipt?.reconciled).toBe(true);

    const still = harness({ created: true });
    expect(await still.executor.reconcile(statusInput())).toBeNull();
  });

  it("rejects a foreign action key outright", () => {
    const { executor } = harness();
    expect(
      executor.validate({
        ...statusInput(),
        actionKey: "rentvine.work_order.assign_vendor",
      }),
    ).toMatch(/wrong action key/);
  });
});
