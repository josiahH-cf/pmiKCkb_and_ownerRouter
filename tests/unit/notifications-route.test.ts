import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/notifications/route";
import { POST } from "@/app/api/notifications/mark-read/route";
import {
  GET as prefsGet,
  PATCH as prefsPatch,
} from "@/app/api/notifications/preferences/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  listApprovalQueueNotifications,
  markApprovalQueueNotificationRead,
} from "@/lib/firestore/approval-queue-notifications";
import {
  listMaintenanceTicketNotifications,
  markMaintenanceTicketNotificationRead,
  type MaintenanceTicketNotificationRecord,
} from "@/lib/firestore/maintenance-ticket-notifications";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/firestore/notification-preferences";
import type { ApprovalQueueNotificationRecord } from "@/lib/firestore/types";

// Mock the data layer so the routes never reach the Admin SDK; the pure feed builder stays real.
vi.mock("@/lib/firestore/approval-queue-notifications", () => ({
  listApprovalQueueNotifications: vi.fn(),
  markApprovalQueueNotificationRead: vi.fn(),
}));
vi.mock("@/lib/firestore/maintenance-ticket-notifications", () => ({
  listMaintenanceTicketNotifications: vi.fn(),
  markMaintenanceTicketNotificationRead: vi.fn(),
}));
vi.mock("@/lib/firestore/notification-preferences", () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

const editor = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
  uid: "editor-uid",
};

const maintenanceEditor = {
  ...editor,
  scopes: ["maintenance"] as const,
};

const renewalsEditor = {
  ...editor,
  scopes: ["renewals"] as const,
};

afterEach(() => {
  setAuthResolverForTest(null);
  vi.clearAllMocks();
});

function jsonReq(body: unknown) {
  return new Request("http://localhost/api/notifications/x", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

// Fully-typed notification records so the mocked readers feed the REAL (unmocked) feed builder valid
// input; each accepts overrides so a test can vary id / created_at without restating every field.
function approvalRecord(
  overrides: Partial<ApprovalQueueNotificationRecord> = {},
): ApprovalQueueNotificationRecord {
  return {
    id: "a-1",
    item_id: "item-1",
    event: "assigned",
    recipient_uid: "editor-uid",
    recipient_role: "Assignee",
    title: "Approval assigned",
    message: "You have an approval waiting.",
    process_run_ref: { id: "run-1", label: "Run 1" },
    status: "Ready for Approval",
    risk: "Low",
    direct_link: "/approval-queue?item_id=item-1",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function maintenanceRecord(
  overrides: Partial<MaintenanceTicketNotificationRecord> = {},
): MaintenanceTicketNotificationRecord {
  return {
    id: "m-1",
    ticket_id: "ticket-1",
    event: "assigned",
    recipient_uid: "editor-uid",
    title: "Maintenance ticket assigned",
    message: "A maintenance ticket was assigned to you.",
    ticket_status: "Open",
    href: "/maintenance",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("notifications routes", () => {
  it("GET returns the unified feed with all four families (two stubbed)", async () => {
    setAuthResolverForTest(() => editor);
    vi.mocked(listApprovalQueueNotifications).mockResolvedValue([]);
    vi.mocked(listMaintenanceTicketNotifications).mockResolvedValue([]);
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      uid: "editor-uid",
      muted_families: [],
      email_enabled: false,
    });

    const response = await GET(
      new Request("http://localhost/api/notifications?unread_only=true&limit=8"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.notifications).toEqual([]);
    expect(body.families).toHaveLength(4);
    expect(
      body.families.filter((f: { available: boolean }) => !f.available),
    ).toHaveLength(2);
  });

  it("GET returns 401 when unauthenticated, without reading the data layer", async () => {
    setAuthResolverForTest(() => null);
    const response = await GET(new Request("http://localhost/api/notifications"));
    expect(response.status).toBe(401);
    expect(listApprovalQueueNotifications).not.toHaveBeenCalled();
    expect(listMaintenanceTicketNotifications).not.toHaveBeenCalled();
  });

  it("GET rejects an invalid limit with 400", async () => {
    setAuthResolverForTest(() => editor);
    const response = await GET(new Request("http://localhost/api/notifications?limit=0"));
    expect(response.status).toBe(400);
  });

  it("GET forwards unread_only + limit from the query into the readers and the feed builder", async () => {
    setAuthResolverForTest(() => editor);
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      uid: "editor-uid",
      muted_families: [],
      email_enabled: false,
    });
    // Two approval notifications so a limit of 1 has something to slice off.
    vi.mocked(listApprovalQueueNotifications).mockResolvedValue([
      approvalRecord({ id: "a-old", created_at: "2026-07-01T00:00:00.000Z" }),
      approvalRecord({ id: "a-new", created_at: "2026-07-02T00:00:00.000Z" }),
    ]);
    vi.mocked(listMaintenanceTicketNotifications).mockResolvedValue([]);

    const response = await GET(
      new Request("http://localhost/api/notifications?unread_only=true&limit=1"),
    );
    expect(response.status).toBe(200);

    // unread_only=true is forwarded to BOTH readers (approval additionally gets recipientOnly).
    expect(listApprovalQueueNotifications).toHaveBeenCalledWith(editor, {
      recipientOnly: true,
      unreadOnly: true,
    });
    expect(listMaintenanceTicketNotifications).toHaveBeenCalledWith(editor, {
      unreadOnly: true,
    });

    // limit=1 reaches the (real) feed builder: two eligible notifications slice to the newest one.
    const body = await response.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].id).toBe("a-new");
  });

  it("GET drops a family the caller's preferences mute and marks it muted in the family views", async () => {
    setAuthResolverForTest(() => editor);
    // Preferences mute maintenance_tickets; that resolved muted set must reach the feed builder.
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      uid: "editor-uid",
      muted_families: ["maintenance_tickets"],
      email_enabled: false,
    });
    vi.mocked(listApprovalQueueNotifications).mockResolvedValue([
      approvalRecord({ id: "a-1", created_at: "2026-07-01T00:00:00.000Z" }),
    ]);
    // The maintenance notification is the NEWEST, so only muting (not ordering or a limit) can drop it.
    vi.mocked(listMaintenanceTicketNotifications).mockResolvedValue([
      maintenanceRecord({ id: "m-1", created_at: "2026-07-09T00:00:00.000Z" }),
    ]);

    const response = await GET(new Request("http://localhost/api/notifications"));
    expect(response.status).toBe(200);
    const body = await response.json();

    // The muted maintenance notification is excluded even though it is newest; the approval survives.
    expect(body.notifications.map((n: { id: string }) => n.id)).toEqual(["a-1"]);
    expect(
      body.notifications.some(
        (n: { family: string }) => n.family === "maintenance_tickets",
      ),
    ).toBe(false);

    // The resolved muted set is reflected in the per-family views handed to the menu.
    const families = body.families as Array<{ key: string; muted: boolean }>;
    expect(families.find((f) => f.key === "maintenance_tickets")?.muted).toBe(true);
    expect(families.find((f) => f.key === "approval_queue")?.muted).toBe(false);
  });

  it("GET does not read or return renewal notifications for a maintenance-only user", async () => {
    setAuthResolverForTest(() => maintenanceEditor);
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      uid: "editor-uid",
      muted_families: [],
      email_enabled: false,
    });
    vi.mocked(listMaintenanceTicketNotifications).mockResolvedValue([
      maintenanceRecord(),
    ]);

    const response = await GET(new Request("http://localhost/api/notifications"));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(listApprovalQueueNotifications).not.toHaveBeenCalled();
    expect(listMaintenanceTicketNotifications).toHaveBeenCalledOnce();
    expect(body.notifications.map((item: { source: string }) => item.source)).toEqual([
      "maintenance_ticket",
    ]);
    expect(body.families.map((family: { key: string }) => family.key)).not.toContain(
      "approval_queue",
    );
  });

  it("GET does not read or return maintenance notifications for a renewals-only user", async () => {
    setAuthResolverForTest(() => renewalsEditor);
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      uid: "editor-uid",
      muted_families: [],
      email_enabled: false,
    });
    vi.mocked(listApprovalQueueNotifications).mockResolvedValue([approvalRecord()]);

    const response = await GET(new Request("http://localhost/api/notifications"));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(listApprovalQueueNotifications).toHaveBeenCalledOnce();
    expect(listMaintenanceTicketNotifications).not.toHaveBeenCalled();
    expect(body.notifications.map((item: { source: string }) => item.source)).toEqual([
      "approval_queue",
    ]);
    expect(body.families.map((family: { key: string }) => family.key)).not.toContain(
      "maintenance_tickets",
    );
  });

  it("mark-read dispatches to the maintenance writer for a maintenance source", async () => {
    setAuthResolverForTest(() => editor);
    vi.mocked(markMaintenanceTicketNotificationRead).mockResolvedValue(
      undefined as never,
    );

    const response = await POST(jsonReq({ source: "maintenance_ticket", id: "n-1" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(markMaintenanceTicketNotificationRead).toHaveBeenCalledWith(editor, "n-1");
    expect(markApprovalQueueNotificationRead).not.toHaveBeenCalled();
  });

  it("mark-read dispatches to the approval writer for an approval source", async () => {
    setAuthResolverForTest(() => editor);
    vi.mocked(markApprovalQueueNotificationRead).mockResolvedValue(undefined as never);

    const response = await POST(jsonReq({ source: "approval_queue", id: "a-1" }));
    expect(response.status).toBe(200);
    expect(markApprovalQueueNotificationRead).toHaveBeenCalledWith(editor, "a-1");
    expect(markMaintenanceTicketNotificationRead).not.toHaveBeenCalled();
  });

  it("mark-read rejects a notification source outside the caller's spaces", async () => {
    setAuthResolverForTest(() => maintenanceEditor);

    const response = await POST(jsonReq({ source: "approval_queue", id: "a-1" }));
    expect(response.status).toBe(403);
    expect(markApprovalQueueNotificationRead).not.toHaveBeenCalled();

    setAuthResolverForTest(() => renewalsEditor);
    const maintenanceResponse = await POST(
      jsonReq({ source: "maintenance_ticket", id: "m-1" }),
    );
    expect(maintenanceResponse.status).toBe(403);
    expect(markMaintenanceTicketNotificationRead).not.toHaveBeenCalled();
  });

  it("preferences GET and PATCH round-trip the self-scoped record", async () => {
    setAuthResolverForTest(() => editor);
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      uid: "editor-uid",
      muted_families: [],
      email_enabled: false,
    });
    const getResponse = await prefsGet();
    expect(getResponse.status).toBe(200);
    expect((await getResponse.json()).preferences.email_enabled).toBe(false);

    vi.mocked(updateNotificationPreferences).mockResolvedValue({
      uid: "editor-uid",
      muted_families: ["maintenance_tickets"],
      email_enabled: false,
    });
    const patchResponse = await prefsPatch(
      jsonReq({ muted_families: ["maintenance_tickets"] }),
    );
    expect(patchResponse.status).toBe(200);
    expect((await patchResponse.json()).preferences.muted_families).toEqual([
      "maintenance_tickets",
    ]);
    expect(updateNotificationPreferences).toHaveBeenCalledWith(editor, {
      muted_families: ["maintenance_tickets"],
    });
  });
});
