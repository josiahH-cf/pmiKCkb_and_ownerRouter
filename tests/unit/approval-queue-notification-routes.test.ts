import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as GET_SETTINGS } from "@/app/api/approval-queue/email-settings/route";
import { PATCH as PATCH_SETTING } from "@/app/api/approval-queue/email-settings/[settingId]/route";
import { GET as GET_HEALTH } from "@/app/api/approval-queue/health/route";
import { GET as GET_NOTIFICATIONS } from "@/app/api/approval-queue/notifications/route";
import { PATCH as PATCH_NOTIFICATION } from "@/app/api/approval-queue/notifications/[notificationId]/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  listApprovalQueueEmailSettings,
  listApprovalQueueNotifications,
  markApprovalQueueNotificationRead,
  readApprovalQueueNotificationHealth,
  updateApprovalQueueEmailSetting,
} from "@/lib/firestore/approval-queue-notifications";
import type {
  ApprovalQueueEmailSettingRecord,
  ApprovalQueueNotificationHealth,
  ApprovalQueueNotificationRecord,
} from "@/lib/firestore/types";

vi.mock("@/lib/firestore/approval-queue-notifications", () => ({
  listApprovalQueueEmailSettings: vi.fn(),
  listApprovalQueueNotifications: vi.fn(),
  markApprovalQueueNotificationRead: vi.fn(),
  readApprovalQueueNotificationHealth: vi.fn(),
  updateApprovalQueueEmailSetting: vi.fn(),
}));

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(listApprovalQueueEmailSettings).mockReset();
  vi.mocked(listApprovalQueueNotifications).mockReset();
  vi.mocked(markApprovalQueueNotificationRead).mockReset();
  vi.mocked(readApprovalQueueNotificationHealth).mockReset();
  vi.mocked(updateApprovalQueueEmailSetting).mockReset();
});

describe("Approval Queue notification API routes", () => {
  it("returns 401 before listing notifications when unauthenticated", async () => {
    setAuthResolverForTest(() => null);

    const response = await GET_NOTIFICATIONS(
      new Request("http://localhost/api/approval-queue/notifications"),
    );

    expect(response.status).toBe(401);
    expect(listApprovalQueueNotifications).not.toHaveBeenCalled();
  });

  it("lists notifications with safe filters", async () => {
    setEditor();
    vi.mocked(listApprovalQueueNotifications).mockResolvedValue([notification()]);

    const response = await GET_NOTIFICATIONS(
      new Request(
        "http://localhost/api/approval-queue/notifications?item_id=item-1&mine_only=true&unread_only=true&limit=10",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      notifications: [{ id: "notification-1" }],
    });
    expect(listApprovalQueueNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      { itemId: "item-1", limit: 10, recipientOnly: true, unreadOnly: true },
    );
  });

  it("marks one recipient notification read", async () => {
    setEditor();
    vi.mocked(markApprovalQueueNotificationRead).mockResolvedValue(
      notification({ read_at: "2026-06-06T00:00:00.000Z" }),
    );

    const response = await PATCH_NOTIFICATION(
      jsonRequest({ action: "mark_read" }),
      notificationContext("notification-1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      notification: { id: "notification-1", read_at: "2026-06-06T00:00:00.000Z" },
    });
    expect(markApprovalQueueNotificationRead).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      "notification-1",
    );
  });

  it("rejects invalid notification update payloads before the repository runs", async () => {
    setEditor();

    const response = await PATCH_NOTIFICATION(
      jsonRequest({ action: "delete" }),
      notificationContext("notification-1"),
    );

    expect(response.status).toBe(400);
    expect(markApprovalQueueNotificationRead).not.toHaveBeenCalled();
  });

  it("rejects invalid notification limits", async () => {
    setEditor();

    const response = await GET_NOTIFICATIONS(
      new Request("http://localhost/api/approval-queue/notifications?limit=500"),
    );

    expect(response.status).toBe(400);
    expect(listApprovalQueueNotifications).not.toHaveBeenCalled();
  });

  it("returns Admin-only health", async () => {
    setAdmin();
    vi.mocked(readApprovalQueueNotificationHealth).mockResolvedValue(health());

    const response = await GET_HEALTH();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      health: { status: "Healthy" },
    });
    expect(readApprovalQueueNotificationHealth).toHaveBeenCalledWith({
      actor: expect.objectContaining({ uid: "admin-1" }),
    });
  });

  it("blocks non-Admins from health and settings routes", async () => {
    setEditor();

    const healthResponse = await GET_HEALTH();
    const settingsResponse = await GET_SETTINGS();
    const patchResponse = await PATCH_SETTING(
      jsonRequest({ email_enabled: true }),
      settingContext("created"),
    );

    expect(healthResponse.status).toBe(403);
    expect(settingsResponse.status).toBe(403);
    expect(patchResponse.status).toBe(403);
    expect(readApprovalQueueNotificationHealth).not.toHaveBeenCalled();
    expect(listApprovalQueueEmailSettings).not.toHaveBeenCalled();
    expect(updateApprovalQueueEmailSetting).not.toHaveBeenCalled();
  });

  it("lists and updates Admin email settings", async () => {
    setAdmin();
    vi.mocked(listApprovalQueueEmailSettings).mockResolvedValue([setting()]);
    vi.mocked(updateApprovalQueueEmailSetting).mockResolvedValue(
      setting({ email_enabled: true, recipient_roles: ["Assignee"] }),
    );

    const listResponse = await GET_SETTINGS();
    const patchResponse = await PATCH_SETTING(
      jsonRequest({ email_enabled: true, recipient_roles: ["Assignee"] }),
      settingContext("created"),
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      settings: [{ id: "created" }],
    });
    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      setting: { email_enabled: true, recipient_roles: ["Assignee"] },
    });
    expect(updateApprovalQueueEmailSetting).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      "created",
      { email_enabled: true, recipient_roles: ["Assignee"] },
    );
  });

  it("rejects invalid email setting payloads before the repository runs", async () => {
    setAdmin();

    const response = await PATCH_SETTING(
      jsonRequest({ recipient_roles: [] }),
      settingContext("created"),
    );

    expect(response.status).toBe(400);
    expect(updateApprovalQueueEmailSetting).not.toHaveBeenCalled();
  });
});

function setAdmin() {
  setAuthResolverForTest(() => ({
    email: "admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin",
    uid: "admin-1",
  }));
}

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

function notification(
  overrides: Partial<ApprovalQueueNotificationRecord> = {},
): ApprovalQueueNotificationRecord {
  return {
    created_at: "2026-06-05T00:00:00.000Z",
    direct_link: "/runs/run-1",
    event: "created",
    id: "notification-1",
    item_id: "item-1",
    message: "Review the requested approval action.",
    process_run_ref: { id: "run-1", label: "Lease Renewal" },
    recipient_role: "Assignee",
    recipient_uid: "editor-1",
    risk: "High",
    status: "Ready for Approval",
    title: "New queue item: Lease Renewal",
    ...overrides,
  };
}

function setting(
  overrides: Partial<ApprovalQueueEmailSettingRecord> = {},
): ApprovalQueueEmailSettingRecord {
  return {
    cooldown_hours: 0,
    email_enabled: false,
    event_type: "created",
    id: "created",
    recipient_roles: ["Assignee", "Required approver"],
    subject_preview: "[Approval Queue] New item needs review",
    trigger_condition: "A queue item is created for review.",
    updated_at: "default",
    ...overrides,
  };
}

function health(
  overrides: Partial<ApprovalQueueNotificationHealth> = {},
): ApprovalQueueNotificationHealth {
  return {
    action_required_reasons: [],
    blocked_high_risk_count: 0,
    blocked_item_count: 0,
    disabled_event_types: [],
    failed_delivery_count: 0,
    needs_attention_reasons: [],
    queue_email_status: "Ready",
    stale_overdue_count: 0,
    status: "Healthy",
    ...overrides,
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/approval-queue/email-settings/created", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}

function settingContext(settingId: string) {
  return { params: Promise.resolve({ settingId }) };
}

function notificationContext(notificationId: string) {
  return { params: Promise.resolve({ notificationId }) };
}
