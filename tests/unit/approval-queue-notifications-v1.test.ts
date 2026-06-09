import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import {
  createApprovalQueueItem,
  transitionApprovalQueueItem,
} from "@/lib/firestore/approval-queue";
import {
  listApprovalQueueEmailSettings,
  listApprovalQueueNotifications,
  markApprovalQueueNotificationRead,
  queueNotificationEventForActivity,
  readApprovalQueueNotificationHealth,
  updateApprovalQueueEmailSetting,
} from "@/lib/firestore/approval-queue-notifications";
import type { CreateApprovalQueueItemInput } from "@/lib/firestore/schemas";
import { FakeFirestore } from "../helpers/fake-firestore";

function userWith(role: Role, uid: string): AuthenticatedUser {
  return { uid, email: `${uid}@example.com`, hd: "example.com", role };
}

const admin = userWith("Admin", "admin-1");
const approver = userWith("Approver", "approver-1");
const editor = userWith("Editor", "editor-1");

function baseInput(
  overrides: Partial<CreateApprovalQueueItemInput> = {},
): CreateApprovalQueueItemInput {
  return {
    action_needed: "Approve the owner renewal email.",
    assignee_uid: "editor-1",
    direct_link: "/runs/run-1",
    item_type: "ApprovalPackage",
    process_run_ref: { id: "run-1", label: "Lease Renewal - 123 Main" },
    required_approver_uid: "approver-1",
    source_trigger_key: "run-1:owner-comms",
    ...overrides,
  };
}

let db: Firestore;

beforeEach(() => {
  db = new FakeFirestore() as unknown as Firestore;
});

describe("Approval Queue v1 console notifications", () => {
  it("maps Activity actions to the product notification events", () => {
    expect(queueNotificationEventForActivity("created", "Ready for Approval")).toBe(
      "created",
    );
    expect(queueNotificationEventForActivity("created", "Blocked")).toBe("blocked");
    expect(queueNotificationEventForActivity("returned", "Returned")).toBe(
      "returned_for_revision",
    );
    expect(queueNotificationEventForActivity("approved", "Approved")).toBe("closed");
    expect(queueNotificationEventForActivity("skipped", "Ready for Approval")).toBeNull();
  });

  it("creates console notifications for the assignee and required approver", async () => {
    const item = await createApprovalQueueItem(editor, baseInput(), db);

    const editorNotifications = await listApprovalQueueNotifications(editor, {}, db);
    const approverNotifications = await listApprovalQueueNotifications(approver, {}, db);
    const adminNotifications = await listApprovalQueueNotifications(admin, {}, db);

    expect(editorNotifications).toHaveLength(1);
    expect(editorNotifications[0]).toMatchObject({
      event: "created",
      item_id: item.id,
      recipient_role: "Assignee",
      recipient_uid: "editor-1",
    });
    expect(approverNotifications).toHaveLength(1);
    expect(approverNotifications[0]).toMatchObject({
      event: "created",
      recipient_role: "Required approver",
      recipient_uid: "approver-1",
    });
    expect(adminNotifications).toHaveLength(2);
  });

  it("can list only the current user's notifications even when the actor is Admin", async () => {
    await createApprovalQueueItem(
      admin,
      baseInput({
        assignee_uid: "admin-1",
        required_approver_uid: "approver-1",
        source_trigger_key: "run-1:admin-assigned",
      }),
      db,
    );
    await createApprovalQueueItem(
      editor,
      baseInput({
        assignee_uid: "editor-1",
        required_approver_uid: "approver-1",
        source_trigger_key: "run-1:editor-assigned",
      }),
      db,
    );

    const allAdminVisible = await listApprovalQueueNotifications(admin, {}, db);
    const onlyMine = await listApprovalQueueNotifications(
      admin,
      { recipientOnly: true },
      db,
    );

    expect(allAdminVisible).toHaveLength(4);
    expect(onlyMine).toHaveLength(1);
    expect(onlyMine[0]).toMatchObject({
      recipient_uid: "admin-1",
      recipient_role: "Assignee",
    });
  });

  it("notifies the refreshed required approver, not the stale recipient set", async () => {
    // First submission is missing an approver, so the item is Blocked with no approver.
    const item = await createApprovalQueueItem(
      editor,
      baseInput({
        required_approver_uid: undefined,
        source_trigger_key: "run-1:refresh-approver",
      }),
      db,
    );
    expect(item.status).toBe("Blocked");
    expect(await listApprovalQueueNotifications(approver, {}, db)).toHaveLength(0);

    // A same-trigger resubmission supplies the approver, refreshing the open item. The
    // blocked notification must reach the refreshed approver, not the stale (empty) set.
    await createApprovalQueueItem(
      editor,
      baseInput({
        required_approver_uid: "approver-1",
        source_trigger_key: "run-1:refresh-approver",
      }),
      db,
    );

    const approverNotifications = await listApprovalQueueNotifications(approver, {}, db);
    expect(approverNotifications.length).toBeGreaterThan(0);
    expect(approverNotifications[0]).toMatchObject({
      item_id: item.id,
      recipient_uid: "approver-1",
    });
  });

  it("marks only the recipient's notification read", async () => {
    await createApprovalQueueItem(editor, baseInput(), db);
    const [notification] = await listApprovalQueueNotifications(editor, {}, db);

    const updated = await markApprovalQueueNotificationRead(editor, notification.id, db);

    expect(updated.read_at).toBeTruthy();
    await expect(
      markApprovalQueueNotificationRead(admin, notification.id, db),
    ).rejects.toThrow(/recipient/);
  });

  it("writes blocked and unblocked console notifications from queue ownership changes", async () => {
    const item = await createApprovalQueueItem(
      editor,
      baseInput({
        required_approver_uid: undefined,
        source_trigger_key: "run-1:missing-approver",
      }),
      db,
    );

    expect(item.status).toBe("Blocked");
    expect(await listApprovalQueueNotifications(approver, {}, db)).toHaveLength(0);

    await transitionApprovalQueueItem(
      admin,
      item.id,
      { action: "assign", required_approver_uid: "approver-1" },
      db,
    );

    const approverNotifications = await listApprovalQueueNotifications(
      approver,
      { itemId: item.id },
      db,
    );

    expect(approverNotifications).toHaveLength(1);
    expect(approverNotifications[0]).toMatchObject({
      event: "unblocked",
      recipient_uid: "approver-1",
    });
  });
});

describe("Approval Queue v1 email settings and health", () => {
  it("starts with routine queue email off and blocked/overdue escalation on", async () => {
    const settings = await listApprovalQueueEmailSettings(admin, db);

    expect(settings.find((setting) => setting.id === "created")).toMatchObject({
      email_enabled: false,
      recipient_roles: ["Assignee", "Required approver"],
    });
    expect(
      settings.find((setting) => setting.id === "blocked_overdue_escalation"),
    ).toMatchObject({
      email_enabled: true,
      recipient_roles: ["Assignee", "Required approver", "Admin selected"],
    });

    await expect(listApprovalQueueEmailSettings(editor, db)).rejects.toThrow(/Admins/);
  });

  it("lets Admins update one email setting without changing the console notification model", async () => {
    const updated = await updateApprovalQueueEmailSetting(
      admin,
      "created",
      { email_enabled: true, recipient_roles: ["Assignee"] },
      db,
    );

    expect(updated).toMatchObject({
      email_enabled: true,
      event_type: "created",
      recipient_roles: ["Assignee"],
      updated_by_uid: "admin-1",
    });

    const item = await createApprovalQueueItem(editor, baseInput(), db);
    const approverNotifications = await listApprovalQueueNotifications(
      approver,
      { itemId: item.id },
      db,
    );
    expect(approverNotifications).toHaveLength(1);
  });

  it("reports healthy, disconnected, overdue, blocked, and failed-delivery states", async () => {
    await createApprovalQueueItem(
      editor,
      baseInput({ due_date: "2026-06-10", source_trigger_key: "healthy-item" }),
      db,
    );

    const readyConfig = readServerConfig({
      APP_BASE_URL: "https://kb.example.com",
      KB_APPROVAL_RECIPIENTS: "dan@example.com",
      KB_APPROVAL_SENDER: "kb@example.com",
    });
    const healthy = await readApprovalQueueNotificationHealth({
      actor: admin,
      config: readyConfig,
      db,
      referenceDate: "2026-06-05",
    });

    expect(healthy).toMatchObject({
      queue_email_status: "Ready",
      status: "Healthy",
    });

    await createApprovalQueueItem(
      editor,
      baseInput({
        due_date: "2026-06-01",
        required_approver_uid: undefined,
        source_trigger_key: "blocked-overdue-item",
      }),
      db,
    );
    (db as unknown as FakeFirestore).seed("notification_logs/failed-1", {
      channel: "Gmail",
      created_at: "2026-06-04T00:00:00.000Z",
      entity_id: "item-1",
      entity_type: "sop",
      event: "created",
      recipients: ["dan@example.com"],
      status: "Failed",
      subject: "Failed approval notification",
    });

    const actionRequired = await readApprovalQueueNotificationHealth({
      actor: admin,
      config: readServerConfig({}),
      db,
      referenceDate: "2026-06-05",
    });

    expect(actionRequired).toMatchObject({
      blocked_high_risk_count: 1,
      blocked_item_count: 1,
      failed_delivery_count: 1,
      queue_email_status: "Disconnected",
      stale_overdue_count: 1,
      status: "Action Required",
    });
    expect(actionRequired.action_required_reasons.join(" ")).toContain(
      "Queue email escalation is enabled",
    );
  });
});
