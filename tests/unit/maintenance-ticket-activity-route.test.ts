import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the service; keep the real module otherwise.
vi.mock("@/lib/firestore/maintenance-tickets", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/firestore/maintenance-tickets")>();
  return {
    ...actual,
    listMaintenanceTicketActivity: vi.fn(),
  };
});

import { GET } from "@/app/api/maintenance/tickets/[ticketId]/activity/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { listMaintenanceTicketActivity } from "@/lib/firestore/maintenance-tickets";

const ctx = { params: Promise.resolve({ ticketId: "t1" }) };

function activityRequest() {
  return new Request("http://localhost/api/maintenance/tickets/t1/activity");
}

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(listMaintenanceTicketActivity).mockReset();
});

describe("maintenance ticket activity route", () => {
  it("returns 401 when unauthenticated and never reads the trail", async () => {
    setAuthResolverForTest(() => null);
    const response = await GET(activityRequest(), ctx);
    expect(response.status).toBe(401);
    expect(listMaintenanceTicketActivity).not.toHaveBeenCalled();
  });

  it("returns the activity trail for a signed-in reader", async () => {
    setEditor();
    const trail = [
      {
        id: "a1",
        ticket_id: "t1",
        actor_uid: "editor-1",
        action: "create",
        created_at: "2026-07-09T10:00:00.000Z",
      },
    ];
    vi.mocked(listMaintenanceTicketActivity).mockResolvedValue(trail as never);
    const response = await GET(activityRequest(), ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activity: trail });
    expect(vi.mocked(listMaintenanceTicketActivity).mock.calls[0][1]).toBe("t1");
  });
});
