import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firestore/maintenance-tickets", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/firestore/maintenance-tickets")>();
  return {
    ...actual,
    createCanonicalMaintenanceTestTicket: vi.fn(),
    listMaintenanceTestActionReceipts: vi.fn(),
    simulateMaintenanceTestAction: vi.fn(),
  };
});

import {
  GET as getTestActions,
  POST as postTestAction,
} from "@/app/api/maintenance/tickets/[ticketId]/test-actions/route";
import { POST as seedTestTicket } from "@/app/api/maintenance/tickets/test-seed/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  createCanonicalMaintenanceTestTicket,
  listMaintenanceTestActionReceipts,
  simulateMaintenanceTestAction,
} from "@/lib/firestore/maintenance-tickets";
import { MAINTENANCE_TEST_CONFIRMATION } from "@/lib/maintenance/test-workflow";

const context = { params: Promise.resolve({ ticketId: "test-ticket-1" }) };

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(createCanonicalMaintenanceTestTicket).mockReset();
  vi.mocked(listMaintenanceTestActionReceipts).mockReset();
  vi.mocked(simulateMaintenanceTestAction).mockReset();
});

describe("Maintenance production Test routes", () => {
  it("creates only the canonical server-owned scenario", async () => {
    setEditor();
    vi.mocked(createCanonicalMaintenanceTestTicket).mockResolvedValue({
      id: "test-ticket-1",
      data_mode: "test",
    } as never);

    const response = await seedTestTicket(
      jsonRequest("http://localhost/api/maintenance/tickets/test-seed", {
        scenario: "plumbing",
      }),
    );

    expect(response.status).toBe(201);
    expect(createCanonicalMaintenanceTestTicket).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      { scenario: "plumbing" },
    );
  });

  it("rejects browser-supplied aliases at the seed route", async () => {
    setEditor();
    const response = await seedTestTicket(
      jsonRequest("http://localhost/api/maintenance/tickets/test-seed", {
        scenario: "plumbing",
        unit: { unitId: "customer-unit" },
      }),
    );
    expect(response.status).toBe(400);
    expect(createCanonicalMaintenanceTestTicket).not.toHaveBeenCalled();
  });

  it("requires the exact confirmation phrase before invoking the Test service", async () => {
    setEditor();
    const response = await postTestAction(
      jsonRequest("http://localhost/api/maintenance/tickets/test-ticket-1/test-actions", {
        actionKey: "rentvine.work_order.create",
        confirmation: "yes",
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(simulateMaintenanceTestAction).not.toHaveBeenCalled();
  });

  it("returns the bodyless Test receipt after explicit confirmation", async () => {
    setEditor();
    vi.mocked(simulateMaintenanceTestAction).mockResolvedValue({
      id: "receipt-1",
      ticket_id: "test-ticket-1",
      data_mode: "test",
      action_key: "rentvine.work_order.create",
      target_label: "TEST RentVine workspace (internal simulation)",
      outcome: "simulated_success",
      provider_contacted: false,
      live_proof_eligible: false,
      actor_uid: "editor-1",
      created_at: "2026-07-15T12:00:00.000Z",
    });

    const response = await postTestAction(
      jsonRequest("http://localhost/api/maintenance/tickets/test-ticket-1/test-actions", {
        actionKey: "rentvine.work_order.create",
        confirmation: MAINTENANCE_TEST_CONFIRMATION,
      }),
      context,
    );
    expect(response.status).toBe(201);
    expect(simulateMaintenanceTestAction).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      "test-ticket-1",
      {
        actionKey: "rentvine.work_order.create",
        confirmation: MAINTENANCE_TEST_CONFIRMATION,
      },
    );
  });

  it("lists receipts for the addressed ticket", async () => {
    setEditor();
    vi.mocked(listMaintenanceTestActionReceipts).mockResolvedValue([]);
    const response = await getTestActions(
      new Request("http://localhost/api/maintenance/tickets/test-ticket-1/test-actions"),
      context,
    );
    expect(response.status).toBe(200);
    expect(listMaintenanceTestActionReceipts).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      "test-ticket-1",
    );
  });
});
