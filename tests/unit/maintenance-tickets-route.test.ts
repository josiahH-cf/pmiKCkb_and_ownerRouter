import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the service; keep the real Zod schemas (the routes parse with them).
vi.mock("@/lib/firestore/maintenance-tickets", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/firestore/maintenance-tickets")>();
  return {
    ...actual,
    listMaintenanceTickets: vi.fn(),
    createMaintenanceTicket: vi.fn(),
    transitionMaintenanceTicket: vi.fn(),
  };
});

import { GET, POST } from "@/app/api/maintenance/tickets/route";
import { PATCH } from "@/app/api/maintenance/tickets/[ticketId]/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  createMaintenanceTicket,
  listMaintenanceTickets,
  transitionMaintenanceTicket,
} from "@/lib/firestore/maintenance-tickets";

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
  });
}

const ticketCtx = { params: Promise.resolve({ ticketId: "t1" }) };

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(listMaintenanceTickets).mockReset();
  vi.mocked(createMaintenanceTicket).mockReset();
  vi.mocked(transitionMaintenanceTicket).mockReset();
});

describe("maintenance tickets API route", () => {
  it("GET returns 401 when unauthenticated", async () => {
    setAuthResolverForTest(() => null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(listMaintenanceTickets).not.toHaveBeenCalled();
  });

  it("GET returns the queue for an editor", async () => {
    setEditor();
    vi.mocked(listMaintenanceTickets).mockResolvedValue([]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tickets: [] });
  });

  it("GET supports an explicit Test-only queue address", async () => {
    setEditor();
    vi.mocked(listMaintenanceTickets).mockResolvedValue([
      { id: "live", data_mode: "live" },
      { id: "test", data_mode: "test" },
    ] as never);
    const response = await GET(
      new Request("http://localhost/api/maintenance/tickets?data_mode=test"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      tickets: [{ id: "test", data_mode: "test" }],
    });
  });

  it("GET rejects an unknown data mode", async () => {
    setEditor();
    vi.mocked(listMaintenanceTickets).mockResolvedValue([]);
    const response = await GET(
      new Request("http://localhost/api/maintenance/tickets?data_mode=demo"),
    );
    expect(response.status).toBe(400);
  });

  it("POST creates a ticket from a valid draft", async () => {
    setEditor();
    vi.mocked(createMaintenanceTicket).mockResolvedValue({
      id: "t1",
      status: "Open",
    } as never);
    const response = await POST(
      jsonRequest("http://localhost/api/maintenance/tickets", "POST", {
        summary: "Leak",
        description: "Water is leaking below the kitchen sink.",
        priority: "Emergency",
        unit: { unitId: "unit-1", label: "123 Main St Unit 1", confidence: "Verified" },
      }),
    );
    expect(response.status).toBe(201);
    expect(vi.mocked(createMaintenanceTicket).mock.calls[0][1]).toMatchObject({
      summary: "Leak",
      priority: "Emergency",
    });
  });

  it("POST rejects an invalid body before any write", async () => {
    setEditor();
    const response = await POST(
      jsonRequest("http://localhost/api/maintenance/tickets", "POST", { summary: "" }),
    );
    expect(response.ok).toBe(false);
    expect(createMaintenanceTicket).not.toHaveBeenCalled();
  });

  it("POST rejects browser-created Test data in favor of the canonical seed route", async () => {
    setEditor();
    const response = await POST(
      jsonRequest("http://localhost/api/maintenance/tickets", "POST", {
        data_mode: "test",
        summary: "Attempted Test ticket",
        description: "Browser-supplied scenario",
        priority: "High",
        unit: {
          unitId: "unit:test-maple-204",
          label: "TEST — 204 Maple Court Unit 2",
          confidence: "Verified",
        },
      }),
    );
    expect(response.status).toBe(400);
    expect(createMaintenanceTicket).not.toHaveBeenCalled();
  });

  it.each([
    [
      "blank description",
      {
        summary: "Leak",
        description: "   ",
        priority: "High",
        unit: { unitId: "u1", label: "Unit 1", confidence: "Verified" },
      },
    ],
    ["missing unit", { summary: "Leak", description: "Pipe leak", priority: "High" }],
    [
      "unverified unit",
      {
        summary: "Leak",
        description: "Pipe leak",
        priority: "High",
        unit: { unitId: "u1", label: "Unit 1", confidence: "Suggested" },
      },
    ],
  ])("POST rejects %s before any ticket/activity write", async (_case, body) => {
    setEditor();
    const response = await POST(
      jsonRequest("http://localhost/api/maintenance/tickets", "POST", body),
    );
    expect(response.ok).toBe(false);
    expect(createMaintenanceTicket).not.toHaveBeenCalled();
  });

  it("PATCH applies a transition for an editor", async () => {
    setEditor();
    vi.mocked(transitionMaintenanceTicket).mockResolvedValue({
      id: "t1",
      status: "Waiting on Vendor",
    } as never);
    const response = await PATCH(
      jsonRequest("http://localhost/api/maintenance/tickets/t1", "PATCH", {
        op: "status",
        status: "Waiting on Vendor",
      }),
      ticketCtx,
    );
    expect(response.status).toBe(200);
    expect(vi.mocked(transitionMaintenanceTicket).mock.calls[0][2]).toMatchObject({
      op: "status",
      status: "Waiting on Vendor",
    });
  });

  it("PATCH returns 401 when unauthenticated", async () => {
    setAuthResolverForTest(() => null);
    const response = await PATCH(
      jsonRequest("http://localhost/api/maintenance/tickets/t1", "PATCH", {
        op: "note",
        text: "x",
      }),
      ticketCtx,
    );
    expect(response.status).toBe(401);
    expect(transitionMaintenanceTicket).not.toHaveBeenCalled();
  });
});
