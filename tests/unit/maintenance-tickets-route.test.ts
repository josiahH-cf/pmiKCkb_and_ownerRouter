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

  it("POST creates a ticket from a valid draft", async () => {
    setEditor();
    vi.mocked(createMaintenanceTicket).mockResolvedValue({
      id: "t1",
      status: "Open",
    } as never);
    const response = await POST(
      jsonRequest("http://localhost/api/maintenance/tickets", "POST", {
        summary: "Leak",
        priority: "Emergency",
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
