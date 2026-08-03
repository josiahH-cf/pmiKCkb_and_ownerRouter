import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  createApprovalQueueItem,
  listApprovalQueue,
  listApprovalQueueActivity,
  transitionApprovalQueueItem,
} from "@/lib/firestore/approval-queue";
import type { CreateApprovalQueueItemInput } from "@/lib/firestore/schemas";
import {
  PRODUCT_RECORD_RETENTION_CLASS,
  PRODUCT_RECORD_RETENTION_POLICY,
  stampProductRecordRetention,
} from "@/lib/operations/product-record-retention";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const admin = user("Admin", "admin-1");
const editor = user("Editor", "editor-1");

describe("ordinary Approval Queue behavior after fixture retirement", () => {
  it("creates one Live item with retention, activity, and notification evidence", async () => {
    const { db, fake } = database();
    const item = await createApprovalQueueItem(editor, input(), db);

    expect(item).toMatchObject({
      data_mode: "live",
      legal_hold: false,
      product_retention_class: PRODUCT_RECORD_RETENTION_CLASS,
      product_retention_policy: PRODUCT_RECORD_RETENTION_POLICY,
      status: "Ready for Approval",
    });
    expect(await listApprovalQueueActivity(admin, item.id, db)).toHaveLength(1);
    expect(collection(fake, "approval_queue_notifications")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "created", item_id: item.id }),
      ]),
    );
  });

  it("idempotently refreshes one open source-trigger identity without duplicating it", async () => {
    const { db } = database();
    const first = await createApprovalQueueItem(editor, input(), db);
    const second = await createApprovalQueueItem(
      editor,
      input({ action_needed: "Review the revised Live decision." }),
      db,
    );

    expect(second.id).toBe(first.id);
    expect(second.action_needed).toBe("Review the revised Live decision.");
    expect(await listApprovalQueue(admin, {}, db)).toHaveLength(1);
    expect(await listApprovalQueueActivity(admin, first.id, db)).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "refreshed" })]),
    );
  });

  it("preserves a legal hold while an ordinary open item is refreshed", async () => {
    const { db, fake } = database();
    const first = await createApprovalQueueItem(editor, input(), db);
    const path = `approval_queue_items/${first.id}`;
    fake.seed(path, { ...fake.store.get(path), legal_hold: true });

    await createApprovalQueueItem(
      editor,
      input({ action_needed: "Review the held Live decision." }),
      db,
    );

    expect(fake.store.get(path)).toMatchObject({
      action_needed: "Review the held Live decision.",
      legal_hold: true,
    });
  });

  it("still refuses an approval from a non-required approver", async () => {
    const { db } = database();
    const item = await createApprovalQueueItem(editor, input(), db);

    await expect(
      transitionApprovalQueueItem(editor, item.id, { action: "approve" }, db),
    ).rejects.toMatchObject({ status: 403 });
    await expect(listApprovalQueueActivity(admin, item.id, db)).resolves.toHaveLength(1);
  });

  it("fails closed instead of rewriting malformed product-retention state", () => {
    expect(() =>
      stampProductRecordRetention(
        "approval_queue_items",
        { id: "ordinary-live-item" },
        { product_retention_policy: PRODUCT_RECORD_RETENTION_POLICY },
      ),
    ).toThrow("Current product retention state is malformed");
  });
});

function database() {
  const fake = new FakeFirestore();
  return { db: fake as unknown as Firestore, fake };
}

function user(role: AuthenticatedUser["role"], uid: string): AuthenticatedUser {
  return {
    email: `${uid}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
    uid,
  };
}

function input(
  overrides: Partial<CreateApprovalQueueItemInput> = {},
): CreateApprovalQueueItemInput {
  return {
    action_needed: "Review the Live decision.",
    assignee_uid: editor.uid,
    data_mode: "live",
    direct_link: "/approval-queue",
    item_type: "ApprovalPackage",
    process_run_ref: { id: "live-run-1", label: "Live workflow" },
    required_approver_uid: admin.uid,
    source_trigger_key: "live-run-1:decision",
    ...overrides,
  };
}

function collection(fake: FakeFirestore, name: string) {
  return [...fake.store.entries()]
    .filter(([path]) => path.startsWith(`${name}/`))
    .map(([, value]) => value);
}
