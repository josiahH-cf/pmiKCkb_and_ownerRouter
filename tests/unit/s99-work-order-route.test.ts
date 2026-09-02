import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore } from "../helpers/fake-firestore";
import type { Firestore } from "firebase-admin/firestore";

const S99_KEYS = vi.hoisted(
  () =>
    new Set([
      "rentvine.work_order.read",
      "rentvine.work_order.create",
      "rentvine.work_order.update_status",
    ]),
);

const mocks = vi.hoisted(() => ({
  user: { uid: "editor-1", email: "editor@pmikcmetro.com", role: "Editor" as string },
  db: null as unknown,
  tickets: new Map<string, unknown>(),
  unitCandidates: [
    { unitId: "217", label: "123 Main St Unit A", propertyId: "84" },
  ] as unknown[],
  transportState: {
    created: false,
    record: {} as Record<string, unknown>,
    posts: [] as { path: string; body: Record<string, unknown> }[],
    gets: [] as string[],
  },
}));

// The happy-path file runs with the three S99 keys opened in a test-scoped registry overlay;
// the separate closed-path file proves the committed-seed refusal with the real seed.
vi.mock("@/lib/integrations/action-registry-seed", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/integrations/action-registry-seed")>();
  return {
    ...actual,
    ACTION_REGISTRY_SEED: actual.ACTION_REGISTRY_SEED.map((entry) =>
      S99_KEYS.has(entry.key)
        ? {
            ...entry,
            readiness: "Approved for Execution" as const,
            production_allowed: true,
          }
        : entry,
    ),
  };
});

vi.mock("@/lib/firestore/admin", () => ({
  getAdminFirestore: () => mocks.db,
}));

vi.mock("@/lib/auth/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: vi.fn(async () => mocks.user),
}));

vi.mock("@/lib/environment/descriptor", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/environment/descriptor")>()),
  requireEnvironmentDescriptor: () => ({
    environmentKind: "production",
    dataContext: "live",
    source: "explicit",
  }),
}));

vi.mock("@/lib/firestore/maintenance-tickets", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/firestore/maintenance-tickets")>()),
  getMaintenanceTicket: vi.fn(
    async (_actor: unknown, ticketId: string) => mocks.tickets.get(ticketId) ?? null,
  ),
}));

vi.mock("@/lib/maintenance/live-unit-source", () => ({
  loadLiveUnitCandidates: vi.fn(async () => ({
    status: "ok",
    candidates: mocks.unitCandidates,
    skipped: 0,
  })),
}));

function fakeTransport() {
  const state = mocks.transportState;
  const respond = (status: number, body: unknown) => ({
    status,
    headers: {} as Record<string, string>,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
  return {
    async send(request: { method: string; url: string; body?: string }) {
      const path = new URL(request.url).pathname;
      if (request.method === "GET") state.gets.push(path);
      const statusMatch = /\/work-order\/statuses\/(\d+)$/.exec(path);
      if (request.method === "GET" && statusMatch) {
        const known: Record<string, { name: string; primary: string }> = {
          "9101": { name: "Open", primary: "2" },
          "9102": { name: "Completed", primary: "3" },
          "9103": { name: "On Hold", primary: "4" },
        };
        const entry = known[statusMatch[1]];
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
      if (request.method === "GET" && path.endsWith("/work-order/statuses")) {
        return respond(200, [
          {
            workOrderStatus: {
              workOrderStatusID: "9101",
              primaryWorkOrderStatusID: "2",
              name: "Open",
              isSystemStatus: "1",
            },
          },
          {
            workOrderStatus: {
              workOrderStatusID: "9102",
              primaryWorkOrderStatusID: "3",
              name: "Completed",
              isSystemStatus: "1",
            },
          },
        ]);
      }
      if (request.method === "GET" && path.endsWith("/vendor-trades")) {
        return respond(200, [{ vendorTradeID: 4, name: "Plumbing" }]);
      }
      const tradeMatch = /\/vendor-trades\/(\d+)$/.exec(path);
      if (request.method === "GET" && tradeMatch) {
        return respond(200, {
          vendorTrade: { vendorTradeID: tradeMatch[1], name: "Plumbing" },
        });
      }
      const detailMatch = /\/work-orders\/(\d+)$/.exec(path);
      if (request.method === "GET" && detailMatch) {
        if (!state.created) return respond(400, { error: "Unknown work order." });
        return respond(200, {
          workOrder: { ...state.record },
          schedulingStatusID: null,
        });
      }
      if (request.method === "GET" && path.endsWith("/work-orders")) {
        return respond(
          200,
          state.created ? [{ workOrder: { ...state.record }, contact: null }] : [],
        );
      }
      if (request.method === "POST" && path.endsWith("/work-orders")) {
        const body = JSON.parse(request.body ?? "{}") as Record<string, unknown>;
        state.posts.push({ path, body });
        state.created = true;
        state.record = {
          workOrderID: "9005",
          workOrderNumber: "WO-9005",
          propertyID: body["propertyID"],
          unitID: body["unitID"],
          workOrderStatusID: body["workOrderStatusID"],
          primaryWorkOrderStatusID: "2",
          priorityID: body["priorityID"],
          description: body["description"],
          isOwnerApproved: "0",
          isVacant: body["isVacant"] === true ? "1" : "0",
          isSharedWithTenant: "0",
          isSharedWithOwner: "0",
        };
        return respond(200, {
          workOrder: { ...state.record },
          schedulingStatusID: null,
        });
      }
      if (request.method === "POST" && detailMatch) {
        const body = JSON.parse(request.body ?? "{}") as Record<string, unknown>;
        state.posts.push({ path, body });
        state.record = {
          ...state.record,
          workOrderStatusID: body["workOrderStatusID"],
        };
        return respond(200, { workOrder: { ...state.record } });
      }
      return respond(400, { error: `unexpected ${request.method} ${path}` });
    },
  };
}

vi.mock("@/lib/integrations/rentvine/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/integrations/rentvine/client")>()),
  createFetchTransport: () => fakeTransport(),
}));

vi.mock("@/lib/integrations/rentvine/write-client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/integrations/rentvine/write-client")>()),
  createRentVineWriteFetchTransport: () => fakeTransport(),
}));

import { POST } from "@/app/api/maintenance/rentvine-work-orders/route";
import { approveActionExecution } from "@/lib/firestore/action-executions";

const ADMIN = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  role: "Admin",
  hd: "pmikcmetro.com",
} as never;

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    id: "ticket-9",
    data_mode: "live",
    status: "Open",
    priority: "Normal",
    priority_provenance: "operator-set",
    summary: "Sink leak",
    description: "Kitchen sink drips at the trap.",
    unit: { unitId: "217", label: "123 Main St Unit A" },
    photo_refs: [],
    reporter: { kind: "staff", uid: "editor-1" },
    labels: [],
    space_id: "maintenance-work-order-intake",
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/maintenance/rentvine-work-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function prepareCreate() {
  const response = await post({
    operation: "propose_create",
    ticketId: "ticket-9",
    priorityId: "2",
    workOrderStatusId: "9101",
    isVacant: false,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as {
    execution_id: string;
    approval_state: string;
    preview: Record<string, unknown>;
  };
}

describe("S99 work-order route (keys opened by test overlay)", () => {
  beforeEach(() => {
    mocks.user = { uid: "editor-1", email: "editor@pmikcmetro.com", role: "Editor" };
    mocks.db = new FakeFirestore() as unknown as Firestore;
    mocks.tickets.clear();
    mocks.tickets.set("ticket-9", ticket());
    mocks.transportState.created = false;
    mocks.transportState.record = {};
    mocks.transportState.posts = [];
    mocks.transportState.gets = [];
    process.env.RENTVINE_API_BASE_URL = "https://pmikcmetro.rentvine.com/api/manager";
    process.env.RENTVINE_API_KEY = "unit-key";
    process.env.RENTVINE_API_SECRET = "unit-secret";
  });

  it("runs a bounded ticket-scoped read with catalogs and explicit completeness", async () => {
    const response = await post({ operation: "read", ticketId: "ticket-9" });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      list: { rows: unknown[]; complete: boolean };
      statuses: { name: string }[];
      filters: { propertyId: string; unitId: string };
    };
    expect(payload.list.complete).toBe(true);
    expect(payload.list.rows).toHaveLength(0);
    expect(payload.statuses.map((entry) => entry.name)).toContain("Open");
    expect(payload.filters).toEqual({ propertyId: "84", unitId: "217" });
    expect(mocks.transportState.posts).toHaveLength(0);
  });

  it("prepares a create as Awaiting Admin with the exact wire-mirroring preview", async () => {
    const prepared = await prepareCreate();
    expect(prepared.approval_state).toBe("Awaiting Admin");
    expect(prepared.preview).toEqual({
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
    });
    expect(mocks.transportState.posts).toHaveLength(0);

    const second = await post({
      operation: "propose_create",
      ticketId: "ticket-9",
      priorityId: "2",
      workOrderStatusId: "9101",
      isVacant: false,
    });
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error_type: string }).error_type).toBe(
      "create_already_live",
    );
  });

  it("refuses execution before Admin approval and executes exactly once after it", async () => {
    const prepared = await prepareCreate();

    const early = await post({
      operation: "execute",
      executionId: prepared.execution_id,
    });
    expect(early.status).toBeGreaterThanOrEqual(400);
    expect(mocks.transportState.posts).toHaveLength(0);

    const record = (mocks.db as FakeFirestore).store.get(
      `action_executions/${prepared.execution_id}`,
    ) as { preview_hash: string; context_hash: string };
    await approveActionExecution(
      ADMIN,
      prepared.execution_id,
      {
        contextHash: record.context_hash,
        previewHash: record.preview_hash,
        reason: "Approved for the unit repair.",
      },
      mocks.db as Firestore,
    );

    const response = await post({
      operation: "execute",
      executionId: prepared.execution_id,
    });
    const payload = (await response.json()) as {
      execution_state: string;
      receipt?: { provider_ref: string };
    };
    expect(response.status).toBe(200);
    expect(payload.execution_state).toBe("Succeeded");
    expect(payload.receipt?.provider_ref).toBe("9005");
    expect(mocks.transportState.posts).toHaveLength(1);
    expect(mocks.transportState.posts[0].body["sendVendorNotification"]).toBe(false);
    expect(mocks.transportState.posts[0].body["sendEmail"]).toBe(false);

    const link = (mocks.db as FakeFirestore).store.get(
      "maintenance_work_order_links/ticket-9",
    ) as { state: string; provider_work_order_id: string };
    expect(link.state).toBe("succeeded");
    expect(link.provider_work_order_id).toBe("9005");

    const duplicate = await post({
      operation: "execute",
      executionId: prepared.execution_id,
    });
    expect(duplicate.status).toBe(200);
    expect(mocks.transportState.posts).toHaveLength(1);
  });

  it("prepares and executes a status update against a fresh unshared work order", async () => {
    mocks.transportState.created = true;
    mocks.transportState.record = {
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
    const prepared = await post({
      operation: "propose_status",
      workOrderId: "9005",
      targetStatusId: "9102",
    });
    expect(prepared.status).toBe(200);
    const payload = (await prepared.json()) as {
      execution_id: string;
      preview: Record<string, unknown>;
    };
    expect(payload.preview).toEqual({
      work_order_id: "9005",
      current_status_id: "9101",
      target_status_id: "9102",
      send_vendor_notification: false,
      send_review: false,
    });

    const record = (mocks.db as FakeFirestore).store.get(
      `action_executions/${payload.execution_id}`,
    ) as { preview_hash: string; context_hash: string };
    await approveActionExecution(
      ADMIN,
      payload.execution_id,
      {
        contextHash: record.context_hash,
        previewHash: record.preview_hash,
        reason: "Approved status correction.",
      },
      mocks.db as Firestore,
    );
    const response = await post({
      operation: "execute",
      executionId: payload.execution_id,
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { execution_state: string }).execution_state).toBe(
      "Succeeded",
    );
    expect(mocks.transportState.posts).toHaveLength(1);
    expect(mocks.transportState.posts[0].body).toEqual({
      workOrderStatusID: "9102",
      sendVendorNotification: false,
      sendReview: false,
    });
  });

  it("refuses an ineligible ticket and an unsafe initial status before any S20 record", async () => {
    mocks.tickets.set("ticket-9", ticket({ unit: null }));
    const noUnit = await post({
      operation: "propose_create",
      ticketId: "ticket-9",
      priorityId: "2",
      workOrderStatusId: "9101",
      isVacant: false,
    });
    expect(noUnit.status).toBe(409);
    expect(((await noUnit.json()) as { error_type: string }).error_type).toBe(
      "ticket_not_eligible",
    );

    mocks.tickets.set("ticket-9", ticket());
    const unsafe = await post({
      operation: "propose_create",
      ticketId: "ticket-9",
      priorityId: "2",
      workOrderStatusId: "9103",
      isVacant: false,
    });
    expect(unsafe.status).toBe(409);
    expect(((await unsafe.json()) as { error_type: string }).error_type).toBe(
      "status_not_creatable",
    );
    expect(mocks.transportState.posts).toHaveLength(0);
  });

  it("rejects structural extras and non-decimal ids at the boundary", async () => {
    const extra = await post({
      operation: "propose_create",
      ticketId: "ticket-9",
      priorityId: "2",
      workOrderStatusId: "9101",
      isVacant: false,
      sendVendorNotification: true,
    });
    expect(extra.status).toBe(400);
    const badId = await post({
      operation: "propose_status",
      workOrderId: "wo-9005",
      targetStatusId: "9102",
    });
    expect(badId.status).toBe(400);
  });
});
