import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the roster validator + the writer so the route test exercises the assign-validation branch only.
vi.mock("@/lib/maintenance/assignees", () => ({
  isAssignableUser: vi.fn(async () => true),
}));
vi.mock("@/lib/firestore/maintenance-tickets", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/firestore/maintenance-tickets")>();
  return {
    ...actual,
    transitionMaintenanceTicket: vi.fn(async () => ({ id: "t1", status: "Open" })),
  };
});

import { PATCH } from "@/app/api/maintenance/tickets/[ticketId]/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { transitionMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import { isAssignableUser } from "@/lib/maintenance/assignees";

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

function patch(body: unknown) {
  return new Request("http://localhost/api/maintenance/tickets/t1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ ticketId: "t1" }) };

beforeEach(() => {
  setEditor();
  vi.mocked(isAssignableUser).mockReset();
  vi.mocked(isAssignableUser).mockResolvedValue(true);
  vi.mocked(transitionMaintenanceTicket).mockClear();
});

afterEach(() => setAuthResolverForTest(null));

describe("maintenance ticket PATCH — assign validation", () => {
  it("401s when unauthenticated (never validates or writes)", async () => {
    setAuthResolverForTest(() => null);
    const res = await PATCH(patch({ op: "assign", assigneeUid: "u1" }), ctx);
    expect(res.status).toBe(401);
    expect(isAssignableUser).not.toHaveBeenCalled();
    expect(transitionMaintenanceTicket).not.toHaveBeenCalled();
  });

  it("rejects an assign to a uid not in the roster (400), without writing", async () => {
    vi.mocked(isAssignableUser).mockResolvedValue(false);
    const res = await PATCH(patch({ op: "assign", assigneeUid: "ghost" }), ctx);
    expect(res.status).toBe(400);
    expect(transitionMaintenanceTicket).not.toHaveBeenCalled();
  });

  it("allows an assign to a rostered uid (200) and writes", async () => {
    const res = await PATCH(patch({ op: "assign", assigneeUid: "u1" }), ctx);
    expect(res.status).toBe(200);
    expect(isAssignableUser).toHaveBeenCalledWith("u1");
    expect(transitionMaintenanceTicket).toHaveBeenCalledTimes(1);
  });

  it("allows unassign (null) without a roster check", async () => {
    const res = await PATCH(patch({ op: "assign", assigneeUid: null }), ctx);
    expect(res.status).toBe(200);
    expect(isAssignableUser).not.toHaveBeenCalled();
    expect(transitionMaintenanceTicket).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty-string assignee at the schema (400), before any roster check", async () => {
    const res = await PATCH(patch({ op: "assign", assigneeUid: "" }), ctx);
    expect(res.status).toBe(400);
    expect(isAssignableUser).not.toHaveBeenCalled();
    expect(transitionMaintenanceTicket).not.toHaveBeenCalled();
  });

  it("does not roster-check non-assign ops (status)", async () => {
    const res = await PATCH(patch({ op: "status", status: "Scheduled" }), ctx);
    expect(res.status).toBe(200);
    expect(isAssignableUser).not.toHaveBeenCalled();
    expect(transitionMaintenanceTicket).toHaveBeenCalledTimes(1);
  });
});
