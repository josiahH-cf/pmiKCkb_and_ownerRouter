import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  APPROVAL_TEST_FIXTURE_DEFINITIONS,
  inspectApprovalTestFixtures,
  restoreApprovalTestFixtures,
} from "@/lib/firestore/approval-test-fixtures";
import { transitionApprovalQueueItem } from "@/lib/firestore/approval-queue";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const admin: AuthenticatedUser = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin-1",
};
const editor: AuthenticatedUser = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-1",
};
const NOW = Date.parse("2026-07-18T12:00:00.000Z");

describe("Approval Queue Test fixtures", () => {
  it("creates the complete isolated suite and an Admin notification projection", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    const result = await restoreApprovalTestFixtures(admin, editor.uid, db, NOW);

    expect(result).toMatchObject({
      fixture_count: APPROVAL_TEST_FIXTURE_DEFINITIONS.length,
      ready_count: APPROVAL_TEST_FIXTURE_DEFINITIONS.length,
      restored_count: APPROVAL_TEST_FIXTURE_DEFINITIONS.length,
      state: "ready",
    });
    for (const definition of APPROVAL_TEST_FIXTURE_DEFINITIONS) {
      expect(fake.store.get(`approval_queue_items/${definition.id}`)).toMatchObject({
        data_mode: "test",
        test_fixture_key: definition.key,
        assignee_uid: editor.uid,
        required_approver_uid: admin.uid,
        status: "Ready for Approval",
      });
    }
    const adminNotifications = collection(fake, "approval_queue_notifications").filter(
      (record) => record.recipient_uid === admin.uid,
    );
    expect(adminNotifications).toHaveLength(APPROVAL_TEST_FIXTURE_DEFINITIONS.length);
    expect(adminNotifications[0]).toMatchObject({
      event: "created",
      recipient_role: "Required approver",
    });
  });

  it("is idempotent at baseline and restores a mutated item without touching Live state", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    await restoreApprovalTestFixtures(admin, editor.uid, db, NOW);
    const activityBefore = collection(fake, "approval_queue_activity").length;
    const notificationsBefore = collection(fake, "approval_queue_notifications").length;

    const unchanged = await restoreApprovalTestFixtures(admin, editor.uid, db, NOW + 1);
    expect(unchanged.restored_count).toBe(0);
    expect(collection(fake, "approval_queue_activity")).toHaveLength(activityBefore);
    expect(collection(fake, "approval_queue_notifications")).toHaveLength(
      notificationsBefore,
    );

    const itemId = APPROVAL_TEST_FIXTURE_DEFINITIONS[0].id;
    await transitionApprovalQueueItem(admin, itemId, { action: "approve" }, db);
    expect(fake.store.get(`approval_queue_items/${itemId}`)).toMatchObject({
      status: "Approved",
    });

    const restored = await restoreApprovalTestFixtures(admin, editor.uid, db, NOW + 2);
    expect(restored.restored_count).toBe(1);
    expect(fake.store.get(`approval_queue_items/${itemId}`)).toMatchObject({
      data_mode: "test",
      status: "Ready for Approval",
    });
    expect([...fake.store.keys()].some((path) => path.includes("live"))).toBe(false);
  });

  it("reports missing/drifted/ready and requires a distinct Admin/restricted actor pair", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    await expect(
      inspectApprovalTestFixtures(admin, editor.uid, db),
    ).resolves.toMatchObject({ state: "missing", ready_count: 0 });
    fake.seed(`approval_queue_items/${APPROVAL_TEST_FIXTURE_DEFINITIONS[0].id}`, {
      id: APPROVAL_TEST_FIXTURE_DEFINITIONS[0].id,
      status: "Returned",
    });
    await expect(
      inspectApprovalTestFixtures(admin, editor.uid, db),
    ).resolves.toMatchObject({ state: "drifted", ready_count: 0 });
    await expect(
      restoreApprovalTestFixtures(editor, "other-uid", db, NOW),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      restoreApprovalTestFixtures(admin, admin.uid, db, NOW),
    ).rejects.toMatchObject({ status: 409 });
  });
});

function collection(fake: FakeFirestore, name: string) {
  return [...fake.store.entries()]
    .filter(([path]) => path.startsWith(`${name}/`))
    .map(([, record]) => record);
}
