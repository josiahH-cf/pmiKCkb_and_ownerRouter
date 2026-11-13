import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/notifications/route";
import { POST } from "@/app/api/notifications/mark-read/route";
import { POST as markAllRead } from "@/app/api/notifications/mark-all-read/route";
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
import {
  listGmailWorkflowNotifications,
  markGmailWorkflowNotificationRead,
} from "@/lib/gmail-hub/notifications";

// Mock the data layer so the routes never reach the Admin SDK; the pure feed builder stays real.
vi.mock("@/lib/firestore/approval-queue-notifications", () => ({
  listApprovalQueueNotifications: vi.fn(),
  markApprovalQueueNotificationRead: vi.fn(),
}));
vi.mock("@/lib/firestore/maintenance-ticket-notifications", () => ({
  listMaintenanceTicketNotifications: vi.fn(),
  markMaintenanceTicketNotificationRead: vi.fn(),
}));
vi.mock("@/lib/gmail-hub/notifications", () => ({
  listGmailWorkflowNotifications: vi.fn(async () => []),
  markGmailWorkflowNotificationRead: vi.fn(),
}));
vi.mock("@/lib/firestore/notification-preferences", () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  // Pure projection reused by the hub loader; keep the real behavior so the low-alarm resolver runs.
  toLowAlarmPreferences: (record: {
    lane_thresholds?: unknown;
    snoozed_lanes?: unknown;
    digest_lanes?: unknown;
  }) => ({
    lane_thresholds: record.lane_thresholds,
    snoozed_lanes: record.snoozed_lanes,
    digest_lanes: record.digest_lanes,
  }),
}));

const editor = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
  uid: "editor-uid",
};

// S167: claims an existing account may still carry. The scope claim is ignored, so every data
// layer call below receives the same user as the claim-free `editor`.
const maintenanceEditor = {
  ...editor,
  scopes: ["maintenance"] as const,
};

const renewalsEditor = {
  ...editor,
  scopes: ["renewals"] as const,
};

const admin = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
  uid: "admin-uid",
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
  // S280 BEH-S280-4 (changed on purpose): an Editor is served staff work only. Setup, coverage,
  // review and feedback are Admin families, and the maintenance families are retired.
  it("GET serves the staff family set to an editor", async () => {
    setAuthResolverForTest(() => editor);
    vi.mocked(listApprovalQueueNotifications).mockResolvedValue([]);
    vi.mocked(listMaintenanceTicketNotifications).mockResolvedValue([]);
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      uid: "editor-uid",
      muted_families: [],
      lane_thresholds: {},
      snoozed_lanes: {},
      digest_lanes: [],
      email_enabled: false,
    });

    const response = await GET(
      new Request("http://localhost/api/notifications?unread_only=true&limit=8"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.notifications).toEqual([]);
    expect(body.families.map((f: { key: string }) => f.key)).toEqual([
      "approval_queue",
      "renewal_communications",
    ]);
    expect(listMaintenanceTicketNotifications).not.toHaveBeenCalled();
    // Workflow communication families are available but carry no content without linked attention.
    expect(
      body.families.filter((f: { available: boolean }) => !f.available),
    ).toHaveLength(0);
  });

  it("GET returns 401 when unauthenticated, without reading the data layer", async () => {
    setAuthResolverForTest(() => null);
    const response = await GET(new Request("http://localhost/api/notifications"));
    expect(response.status).toBe(401);
    expect(listApprovalQueueNotifications).not.toHaveBeenCalled();
    expect(listMaintenanceTicketNotifications).not.toHaveBeenCalled();
    expect(listGmailWorkflowNotifications).not.toHaveBeenCalled();
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
      lane_thresholds: {},
      snoozed_lanes: {},
      digest_lanes: [],
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

    // unread_only=true is forwarded to BOTH readers. The approval reader relies on the recipient-only
    // DEFAULT (LR-02) — the route passes no cross-recipient opt-in. Each source is read UNCAPPED (LR-01)
    // so the unread total is exact and never truncated by a per-source preview cap.
    expect(listApprovalQueueNotifications).toHaveBeenCalledWith(editor, {
      unreadOnly: true,
      limit: Number.MAX_SAFE_INTEGER,
    });
    // S280 R-S280-5: the retired maintenance family is not read at all.
    expect(listMaintenanceTicketNotifications).not.toHaveBeenCalled();
    expect(listGmailWorkflowNotifications).toHaveBeenCalledWith(editor, {
      unreadOnly: true,
      limit: Number.MAX_SAFE_INTEGER,
    });

    // limit=1 reaches the (real) feed builder: two eligible notifications slice to the newest one.
    const body = await response.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].id).toBe("a-new");
    // LR-01: the badge total is decoupled from the limit — both unread rows are counted before the slice.
    expect(body.unreadTotal).toBe(2);
  });

  // S280 (changed on purpose): the muted family is now a served staff family (renewal
  // communications), since the maintenance families are retired and no longer served.
  it("GET drops a family the caller's preferences mute and marks it muted in the family views", async () => {
    setAuthResolverForTest(() => editor);
    // Preferences mute renewal_communications; that resolved muted set must reach the feed builder.
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      uid: "editor-uid",
      muted_families: ["renewal_communications"],
      lane_thresholds: {},
      snoozed_lanes: {},
      digest_lanes: [],
      email_enabled: false,
    });
    vi.mocked(listApprovalQueueNotifications).mockResolvedValue([
      approvalRecord({ id: "a-1", created_at: "2026-07-01T00:00:00.000Z" }),
    ]);
    // The renewal notification is the NEWEST, so only muting (not ordering or a limit) can drop it.
    vi.mocked(listGmailWorkflowNotifications).mockResolvedValueOnce([
      {
        id: "gmail:renewal-1",
        source: "gmail_workflow",
        family: "renewal_communications",
        lane: "decision",
        severity: "medium",
        title: "Owner replied",
        message: "101 Sample Pl",
        href: "/lease-renewal/live/desk/lease/101?step=ask-owner",
        created_at: "2026-07-09T00:00:00.000Z",
      },
    ]);

    const response = await GET(new Request("http://localhost/api/notifications"));
    expect(response.status).toBe(200);
    const body = await response.json();

    // The muted renewal notification is excluded even though it is newest; the approval survives.
    expect(body.notifications.map((n: { id: string }) => n.id)).toEqual(["a-1"]);
    expect(
      body.notifications.some(
        (n: { family: string }) => n.family === "renewal_communications",
      ),
    ).toBe(false);

    // The resolved muted set is reflected in the per-family views handed to the menu.
    const families = body.families as Array<{ key: string; muted: boolean }>;
    expect(families.find((f) => f.key === "renewal_communications")?.muted).toBe(true);
    expect(families.find((f) => f.key === "approval_queue")?.muted).toBe(false);
  });

  // S280 R-S280-5 (changed on purpose): the retired maintenance family is neither read nor served,
  // whatever claim is left; the account's own approvals still are (F-NOTIF-3).
  it("GET returns the OWN approval notifications of an account with a leftover maintenance-only claim, and no maintenance item (F-NOTIF-3, S280)", async () => {
    setAuthResolverForTest(() => maintenanceEditor);
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      uid: "editor-uid",
      muted_families: [],
      lane_thresholds: {},
      snoozed_lanes: {},
      digest_lanes: [],
      email_enabled: false,
    });
    // The account is the recipient of an approval item (recipient-only read).
    vi.mocked(listApprovalQueueNotifications).mockResolvedValue([approvalRecord()]);
    vi.mocked(listMaintenanceTicketNotifications).mockResolvedValue([
      maintenanceRecord(),
    ]);

    const response = await GET(new Request("http://localhost/api/notifications"));
    expect(response.status).toBe(200);
    const body = await response.json();

    // Approval notifications are recipient-only by default (LR-02): the hub reads them as the caller
    // and never opts into the Admin cross-recipient view. S167: the caller carries no Space allowlist.
    expect(listApprovalQueueNotifications).toHaveBeenCalledWith(
      editor,
      expect.not.objectContaining({ adminAll: true }),
    );
    expect(listMaintenanceTicketNotifications).not.toHaveBeenCalled();
    const sources = body.notifications.map((item: { source: string }) => item.source);
    expect(sources).toEqual(["approval_queue"]);
    expect(body.families.map((family: { key: string }) => family.key)).toContain(
      "approval_queue",
    );
    expect(body.families.map((family: { key: string }) => family.key)).not.toContain(
      "maintenance_tickets",
    );
  });

  // S167: a renewals-only claim used to skip the maintenance read and hide its family. S280 R-S280-5
  // (changed on purpose): maintenance is retired, so no claim reads or serves it.
  it("GET reads no maintenance notifications for an account with a leftover renewals-only claim", async () => {
    setAuthResolverForTest(() => renewalsEditor);
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      uid: "editor-uid",
      muted_families: [],
      lane_thresholds: {},
      snoozed_lanes: {},
      digest_lanes: [],
      email_enabled: false,
    });
    vi.mocked(listApprovalQueueNotifications).mockResolvedValue([approvalRecord()]);
    vi.mocked(listMaintenanceTicketNotifications).mockResolvedValue([
      maintenanceRecord(),
    ]);

    const response = await GET(new Request("http://localhost/api/notifications"));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(listApprovalQueueNotifications).toHaveBeenCalledOnce();
    expect(listMaintenanceTicketNotifications).not.toHaveBeenCalled();
    expect(
      body.notifications.map((item: { source: string }) => item.source).sort(),
    ).toEqual(["approval_queue"]);
    const families = body.families.map((family: { key: string }) => family.key);
    expect(families).not.toContain("maintenance_tickets");
    expect(families).not.toContain("maintenance_communications");
    // The role still gates the Admin-only families.
    expect(families).not.toContain("team_review");
    expect(families).not.toContain("connections_setup");
    expect(families).not.toContain("space_coverage");
  });

  // AC-S17-6 (family gating): the team_review family is served ONLY to an Admin; an editor never sees it.
  it("serves the team_review family to an Admin but not an editor", async () => {
    vi.mocked(listApprovalQueueNotifications).mockResolvedValue([]);
    vi.mocked(listMaintenanceTicketNotifications).mockResolvedValue([]);
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      uid: "admin-uid",
      muted_families: [],
      lane_thresholds: {},
      snoozed_lanes: {},
      digest_lanes: [],
      email_enabled: false,
    });

    setAuthResolverForTest(() => admin);
    const adminBody = await (
      await GET(new Request("http://localhost/api/notifications"))
    ).json();
    expect(adminBody.families.map((f: { key: string }) => f.key)).toContain(
      "team_review",
    );

    setAuthResolverForTest(() => editor);
    const editorBody = await (
      await GET(new Request("http://localhost/api/notifications"))
    ).json();
    expect(editorBody.families.map((f: { key: string }) => f.key)).not.toContain(
      "team_review",
    );
  });

  // AC-S17-7: mark-all-read flips every unread EVENT notification for the caller and reports the count.
  // S280 AC-S280-5 (changed on purpose): retired maintenance notifications are not shown, so they are
  // not swept either; their stored records stay exactly as they are.
  it("mark-all-read marks every unread served notification for the caller and leaves stored maintenance records untouched", async () => {
    setAuthResolverForTest(() => editor);
    vi.mocked(listApprovalQueueNotifications).mockResolvedValue([
      approvalRecord({ id: "a-1" }),
      approvalRecord({ id: "a-2", item_id: "item-2" }),
    ]);
    vi.mocked(listMaintenanceTicketNotifications).mockResolvedValue([
      maintenanceRecord({ id: "m-1" }),
    ]);
    vi.mocked(markApprovalQueueNotificationRead).mockResolvedValue(undefined as never);
    vi.mocked(markMaintenanceTicketNotificationRead).mockResolvedValue(
      undefined as never,
    );

    const response = await markAllRead();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, marked: 2 });

    // Each unread notification is flipped via its per-source writer (self-scoped; recipient-only is the
    // reader default, LR-02, so no cross-recipient opt-in is passed).
    expect(listApprovalQueueNotifications).toHaveBeenCalledWith(editor, {
      unreadOnly: true,
    });
    expect(markApprovalQueueNotificationRead).toHaveBeenCalledWith(editor, "a-1");
    expect(markApprovalQueueNotificationRead).toHaveBeenCalledWith(editor, "a-2");
    expect(listMaintenanceTicketNotifications).not.toHaveBeenCalled();
    expect(markMaintenanceTicketNotificationRead).not.toHaveBeenCalled();
    expect(markGmailWorkflowNotificationRead).not.toHaveBeenCalled();
  });

  it("mark-all-read sweeps the caller's own approval notifications whatever scope claim is left, and no retired maintenance record (F-NOTIF-3, S280)", async () => {
    setAuthResolverForTest(() => renewalsEditor);
    vi.mocked(listApprovalQueueNotifications).mockResolvedValue([]);
    vi.mocked(listMaintenanceTicketNotifications).mockResolvedValue([]);

    const response = await markAllRead();
    expect(response.status).toBe(200);
    // Approval notifications are personal (recipient-only by default, LR-02), so they are always swept
    // for the caller without opting into any cross-recipient view. S167: the caller is the claim-free
    // user. S280 R-S280-5 (changed on purpose): the retired maintenance family is never swept.
    expect(listApprovalQueueNotifications).toHaveBeenCalledWith(editor, {
      unreadOnly: true,
    });
    expect(listMaintenanceTicketNotifications).not.toHaveBeenCalled();
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

  it("mark-read lets a recipient act on their own approval and maintenance notifications whatever scope claim is left (F-NOTIF-3)", async () => {
    // An account with a leftover maintenance-only claim is the recipient of an approval
    // notification: it can mark it read (the writer enforces recipient ownership).
    setAuthResolverForTest(() => maintenanceEditor);
    vi.mocked(markApprovalQueueNotificationRead).mockResolvedValue(undefined as never);

    const approvalResponse = await POST(jsonReq({ source: "approval_queue", id: "a-1" }));
    expect(approvalResponse.status).toBe(200);
    expect(markApprovalQueueNotificationRead).toHaveBeenCalledWith(editor, "a-1");

    // S167: a renewals-only claim used to refuse the maintenance mark-read with a 403. The request
    // now reaches the maintenance writer, which keeps its own recipient-ownership check.
    setAuthResolverForTest(() => renewalsEditor);
    vi.mocked(markMaintenanceTicketNotificationRead).mockResolvedValue(
      undefined as never,
    );
    const maintenanceResponse = await POST(
      jsonReq({ source: "maintenance_ticket", id: "m-1" }),
    );
    expect(maintenanceResponse.status).toBe(200);
    expect(markMaintenanceTicketNotificationRead).toHaveBeenCalledOnce();
    expect(markMaintenanceTicketNotificationRead).toHaveBeenCalledWith(editor, "m-1");
  });

  it("mark-read refuses an unauthenticated caller before any writer runs", async () => {
    setAuthResolverForTest(() => null);

    const response = await POST(jsonReq({ source: "maintenance_ticket", id: "m-1" }));

    expect(response.status).toBe(401);
    expect(markMaintenanceTicketNotificationRead).not.toHaveBeenCalled();
    expect(markApprovalQueueNotificationRead).not.toHaveBeenCalled();
  });

  it("preferences GET and PATCH round-trip the self-scoped record", async () => {
    setAuthResolverForTest(() => editor);
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      uid: "editor-uid",
      muted_families: [],
      lane_thresholds: {},
      snoozed_lanes: {},
      digest_lanes: [],
      email_enabled: false,
    });
    const getResponse = await prefsGet();
    expect(getResponse.status).toBe(200);
    expect((await getResponse.json()).preferences.email_enabled).toBe(false);

    vi.mocked(updateNotificationPreferences).mockResolvedValue({
      uid: "editor-uid",
      muted_families: ["maintenance_tickets"],
      lane_thresholds: {},
      snoozed_lanes: {},
      digest_lanes: [],
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
