import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore } from "../helpers/fake-firestore";
import type { Firestore } from "firebase-admin/firestore";

const S100_KEYS = vi.hoisted(
  () =>
    new Set([
      "rentvine.work_order.read",
      "rentvine.work_order.chat.sync",
      "gmail.maintenance_resident_reply.draft_create",
    ]),
);

const mocks = vi.hoisted(() => ({
  user: { uid: "editor-1", email: "editor@pmikcmetro.com", role: "Editor" as string },
  db: null as unknown,
  transport: {
    chatGets: [] as string[],
    otherGets: [] as string[],
    tenants: [] as unknown[],
    leaseId: "115" as string | null,
  },
  drafts: [] as { to: string; subject: string; body: string; messageId?: string }[],
}));

// The happy-path file opens the S100 keys in a test-scoped registry overlay; the separate
// closed-path file proves the committed-seed refusal with the real seed.
vi.mock("@/lib/integrations/action-registry-seed", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/integrations/action-registry-seed")>();
  return {
    ...actual,
    ACTION_REGISTRY_SEED: actual.ACTION_REGISTRY_SEED.map((entry) =>
      S100_KEYS.has(entry.key)
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

const RESIDENT_EMAIL = "resident9@residents-pmikc.net";

function tenantEntry(contactId: string, leaseTenantId: string, email: string | null) {
  return {
    leaseTenant: { leaseTenantID: leaseTenantId, leaseID: "115", contactID: contactId },
    contact: { contactID: contactId, email },
  };
}

function chatRows() {
  return [
    {
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
    },
    {
      "message.messageID": 502,
      "message.chatObjectTypeID": 1,
      "message.objectID": 9005,
      "message.roleTypeID": 1,
      "message.message": "We scheduled the plumber for Tuesday.",
      "message.dateTimeCreated": "2026-09-01T16:00:00Z",
      "message.userID": 4,
      "user.userID": 4,
      "message.contactID": null,
      "contact.contactID": null,
    },
    {
      "message.messageID": 504,
      "message.chatObjectTypeID": 1,
      "message.objectID": 9005,
      "message.roleTypeID": 2,
      "message.message": "This is the co-occupant; please call me instead.",
      "message.dateTimeCreated": "2026-09-01T17:00:00Z",
      "message.contactID": 78,
      "contact.contactID": 78,
      "message.userID": null,
      "user.userID": null,
    },
  ];
}

function fakeTransport() {
  const respond = (status: number, body: unknown) => ({
    status,
    headers: {} as Record<string, string>,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
  return {
    async send(request: { method: string; url: string }) {
      const url = new URL(request.url);
      const path = url.pathname;
      if (request.method === "GET" && path.endsWith("/chat/messages")) {
        mocks.transport.chatGets.push(url.search);
        return {
          status: 200,
          headers: {
            "pagination-current-page": "1",
            "pagination-page-size": "20",
            "pagination-total-items": "3",
            "pagination-total-pages": "2",
            "pagination-next-page": "2",
          },
          text: async () => JSON.stringify(chatRows()),
          json: async () => chatRows(),
        };
      }
      mocks.transport.otherGets.push(path);
      if (request.method === "GET" && /\/work-orders\/9005$/.test(path)) {
        return respond(200, {
          workOrder: {
            workOrderID: "9005",
            workOrderNumber: "WO-9005",
            propertyID: "84",
            unitID: "217",
            ...(mocks.transport.leaseId === null
              ? {}
              : { leaseID: mocks.transport.leaseId }),
            workOrderStatusID: "9101",
            primaryWorkOrderStatusID: "2",
            priorityID: "2",
            description: "Kitchen sink drips at the trap.",
            isOwnerApproved: "0",
            isVacant: "0",
            isSharedWithTenant: "0",
            isSharedWithOwner: "0",
          },
          schedulingStatusID: null,
        });
      }
      if (request.method === "GET" && /\/leases\/115$/.test(path)) {
        return respond(200, {
          lease: { leaseID: "115" },
          tenants: mocks.transport.tenants,
        });
      }
      return respond(400, { error: `unexpected ${request.method} ${path}` });
    },
  };
}

vi.mock("@/lib/integrations/rentvine/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/integrations/rentvine/client")>()),
  createFetchTransport: () => fakeTransport(),
}));

vi.mock("@/lib/gmail-hub/dependencies", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/gmail-hub/dependencies")>()),
  createDescriptorBoundGmailRuntimeClient: (subject: string) => ({
    subject,
    createDraft: async (input: {
      to: string;
      subject: string;
      body: string;
      messageId?: string;
    }) => {
      mocks.drafts.push(input);
      return { draftId: "draft-1", messageId: "gm-provider-1" };
    },
  }),
}));

import { POST as chatPost } from "@/app/api/maintenance/work-order-chat/route";
import { POST as replyPost } from "@/app/api/maintenance/resident-reply-draft/route";
import { DRAFT_BANNER } from "@/lib/constants";

function post(handler: typeof chatPost, body: Record<string, unknown>) {
  return handler(
    new Request("http://localhost/api/maintenance/s100", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function seedLink() {
  (mocks.db as FakeFirestore).store.set("maintenance_work_order_links/ticket-9", {
    ticket_ref: "ticket-9",
    action_key: "rentvine.work_order.create",
    execution_id: `exec_${"a".repeat(40)}`,
    state: "succeeded",
    provider_work_order_id: "9005",
    created_by_uid: "editor-1",
    attempt_seq: 0,
  });
}

async function syncFirstPage() {
  seedLink();
  const preview = await post(chatPost, {
    operation: "preview_sync",
    ticketId: "ticket-9",
  });
  expect(preview.status).toBe(200);
  const prepared = (await preview.json()) as {
    execution_id: string;
    preview_hash: string;
    warning: string;
  };
  const confirm = await post(chatPost, {
    operation: "confirm_sync",
    executionId: prepared.execution_id,
    previewHash: prepared.preview_hash,
  });
  expect(confirm.status).toBe(200);
  return { prepared, confirm: (await confirm.json()) as Record<string, unknown> };
}

describe("S100 chat routes (keys opened by test overlay)", () => {
  beforeEach(() => {
    mocks.user = { uid: "editor-1", email: "editor@pmikcmetro.com", role: "Editor" };
    mocks.db = new FakeFirestore() as unknown as Firestore;
    mocks.transport.chatGets = [];
    mocks.transport.otherGets = [];
    mocks.transport.tenants = [tenantEntry("77", "88", RESIDENT_EMAIL)];
    mocks.transport.leaseId = "115";
    mocks.drafts = [];
    process.env.RENTVINE_API_BASE_URL = "https://pmikcmetro.rentvine.com/api/manager";
    process.env.RENTVINE_API_KEY = "unit-key";
    process.env.RENTVINE_API_SECRET = "unit-secret";
  });

  it("loads an empty thread with zero provider calls and reports work-order eligibility", async () => {
    const bare = await post(chatPost, { operation: "thread", ticketId: "ticket-9" });
    expect(bare.status).toBe(200);
    expect(await bare.json()).toMatchObject({ eligible: false, records: [] });

    seedLink();
    const linked = await post(chatPost, { operation: "thread", ticketId: "ticket-9" });
    expect(await linked.json()).toMatchObject({ eligible: true, work_order_id: "9005" });
    expect(mocks.transport.chatGets).toHaveLength(0);
    expect(mocks.transport.otherGets).toHaveLength(0);
  });

  it("refuses a sync preview without a receipted work-order binding", async () => {
    const response = await post(chatPost, {
      operation: "preview_sync",
      ticketId: "ticket-9",
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error_type: string }).error_type).toBe(
      "binding_missing",
    );
  });

  it("previews with the exact read-marker warning and zero provider calls", async () => {
    seedLink();
    const response = await post(chatPost, {
      operation: "preview_sync",
      ticketId: "ticket-9",
    });
    const payload = (await response.json()) as {
      warning: string;
      preview: Record<string, unknown>;
    };
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.warning).toBe(
      "RentVine will mark retrieved messages as read for managers.",
    );
    expect(payload.preview).toEqual({
      ticket_ref: "ticket-9",
      work_order_id: "9005",
      page: "1",
      page_size: "20",
      marks_read_for_managers: true,
    });
    expect(mocks.transport.chatGets).toHaveLength(0);
    expect(mocks.transport.otherGets).toHaveLength(0);
  });

  it("confirms one dispatch, stores exact counts and bindings, and reports the next page", async () => {
    const { confirm } = await syncFirstPage();
    expect(confirm).toMatchObject({
      status: "synced",
      execution_state: "Succeeded",
      next_page: 2,
      counts: {
        new_messages: 3,
        already_synced: 0,
        needs_mapping: 1,
        review: 0,
        rejected: 0,
        truncated: 0,
      },
    });
    expect(String(confirm.read_marker_note)).toMatch(/no rollback/);
    expect(mocks.transport.chatGets).toEqual([
      "?chatObjectTypeID=1&objectID=9005&page=1&pageSize=20",
    ]);

    const thread = await post(chatPost, { operation: "thread", ticketId: "ticket-9" });
    const payload = (await thread.json()) as {
      records: { message_id: number; mapping_state?: string; role?: string }[];
    };
    const byId = new Map(payload.records.map((entry) => [entry.message_id, entry]));
    expect(byId.get(501)?.mapping_state).toBe("resident_bound");
    expect(byId.get(502)?.mapping_state).toBe("nonresident");
    expect(byId.get(504)?.mapping_state).toBe("needs_mapping");
  });

  it("reruns mapping with the same source algorithm and binds only on a unique fresh match", async () => {
    await syncFirstPage();
    const still = await post(chatPost, { operation: "rerun_mapping", messageId: 504 });
    expect(still.status).toBe(200);
    expect(await still.json()).toEqual({
      status: "rerun_complete",
      mapping_state: "needs_mapping",
    });

    mocks.transport.tenants = [
      tenantEntry("77", "88", RESIDENT_EMAIL),
      tenantEntry("78", "89", "resident10@residents-pmikc.net"),
    ];
    const bound = await post(chatPost, { operation: "rerun_mapping", messageId: 504 });
    expect(await bound.json()).toEqual({
      status: "rerun_complete",
      mapping_state: "resident_bound",
    });
  });

  it("previews a resident reply only from the fresh authoritative source and confirms one draft", async () => {
    await syncFirstPage();
    const preview = await post(replyPost, {
      messageId: 501,
      subject: "Re: your maintenance request",
      body: "We will send the plumber Tuesday morning.",
    });
    expect(preview.status).toBe(200);
    const payload = (await preview.json()) as Record<string, string>;
    expect(payload.status).toBe("preview");
    expect(payload.to).toBe(RESIDENT_EMAIL);
    expect(payload.from).toBe("editor@pmikcmetro.com");
    expect(payload.recipient_source_ref).toMatch(
      /^rentvine:lease:115:lease-tenant:88:v[a-f0-9]{16}$/,
    );
    expect(payload.body.startsWith(`${DRAFT_BANNER}\n\n`)).toBe(true);
    expect(mocks.drafts).toHaveLength(0);

    const confirm = await post(replyPost, {
      messageId: 501,
      subject: "Re: your maintenance request",
      body: "We will send the plumber Tuesday morning.",
      confirm: {
        executionId: payload.execution_id,
        previewHash: payload.preview_hash,
      },
    });
    expect(confirm.status).toBe(200);
    expect(await confirm.json()).toMatchObject({
      status: "created",
      draft_id: "draft-1",
    });
    expect(mocks.drafts).toHaveLength(1);
    expect(mocks.drafts[0].to).toBe(RESIDENT_EMAIL);
    expect(mocks.drafts[0].messageId).toMatch(/^<.+@pmikcmetro\.com>$/);
  });

  it("refuses manager-origin, unmapped, line-broken, and source-lost reply requests", async () => {
    await syncFirstPage();

    const manager = await post(replyPost, {
      messageId: 502,
      subject: "Re: request",
      body: "Reply.",
    });
    expect(manager.status).toBe(409);
    expect(((await manager.json()) as { error_type: string }).error_type).toBe(
      "message_not_eligible",
    );

    const unmapped = await post(replyPost, {
      messageId: 504,
      subject: "Re: request",
      body: "Reply.",
    });
    expect(unmapped.status).toBe(409);
    expect(((await unmapped.json()) as { error_type: string }).error_type).toBe(
      "needs_mapping",
    );

    const crlf = await post(replyPost, {
      messageId: 501,
      subject: "Re: request\r\nBcc: attacker@example.org",
      body: "Reply.",
    });
    expect(crlf.status).toBe(400);

    mocks.transport.tenants = [];
    const lost = await post(replyPost, {
      messageId: 501,
      subject: "Re: request",
      body: "Reply.",
    });
    expect(lost.status).toBe(409);
    expect(((await lost.json()) as { error_type: string }).error_type).toBe(
      "resident_source_unavailable",
    );
    expect(mocks.drafts).toHaveLength(0);
  });
});
