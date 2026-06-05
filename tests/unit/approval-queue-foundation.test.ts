import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/roles";
import {
  classifyQueueRisk,
  createApprovalQueueItem,
  defaultAudienceGroup,
  listApprovalQueue,
  listApprovalQueueActivity,
  transitionApprovalQueueItem,
} from "@/lib/firestore/approval-queue";
import { EditableLayerError } from "@/lib/firestore/errors";
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
    process_run_ref: { id: "run-1", label: "Lease Renewal — 123 Main" },
    item_type: "ApprovalPackage",
    source_trigger_key: "run-1:owner-comms",
    action_needed: "Approve the owner renewal email.",
    direct_link: "/runs/run-1",
    assignee_uid: "editor-1",
    required_approver_uid: "approver-1",
    ...overrides,
  };
}

let db: Firestore;

beforeEach(() => {
  db = new FakeFirestore() as unknown as Firestore;
});

describe("classifyQueueRisk", () => {
  const ownership = { hasAssignee: true, hasApprover: true };

  it("returns Blocked when a blocking issue or missing ownership is present", () => {
    expect(classifyQueueRisk({ blocking_issue: true }, ownership)).toBe("Blocked");
    expect(classifyQueueRisk(undefined, { hasAssignee: false, hasApprover: true })).toBe(
      "Blocked",
    );
    expect(classifyQueueRisk(undefined, { hasAssignee: true, hasApprover: false })).toBe(
      "Blocked",
    );
  });

  it("returns High for external writes or owner/tenant/legal impact", () => {
    expect(classifyQueueRisk({ external_write: true }, ownership)).toBe("High");
    expect(classifyQueueRisk({ owner_or_tenant_facing: true }, ownership)).toBe("High");
    expect(classifyQueueRisk({ legal_financial_timing: true }, ownership)).toBe("High");
  });

  it("returns Medium for internal workflow updates and Low otherwise", () => {
    expect(classifyQueueRisk({ internal_workflow_update: true }, ownership)).toBe(
      "Medium",
    );
    expect(classifyQueueRisk(undefined, ownership)).toBe("Low");
  });
});

describe("defaultAudienceGroup", () => {
  it("routes automation failures to the failed/blocked group and others to Dan/Admin", () => {
    expect(defaultAudienceGroup("AutomationFailure")).toBe("Failed/Blocked automation");
    expect(defaultAudienceGroup("ApprovalPackage")).toBe("Dan/Admin decisions");
    expect(defaultAudienceGroup("SourceFactConflict")).toBe("Dan/Admin decisions");
  });
});

describe("createApprovalQueueItem", () => {
  it("creates a Ready for Approval item with a created Activity entry", async () => {
    const item = await createApprovalQueueItem(editor, baseInput(), db);

    expect(item.status).toBe("Ready for Approval");
    expect(item.risk).toBe("Low");
    expect(item.audience_group).toBe("Dan/Admin decisions");
    expect(item.created_at).toBeTruthy();

    const activity = await listApprovalQueueActivity(admin, item.id, db);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      action: "created",
      new_state: "Ready for Approval",
      actor_uid: "editor-1",
    });
  });

  it("routes a missing required approver to Blocked", async () => {
    const item = await createApprovalQueueItem(
      editor,
      baseInput({ required_approver_uid: undefined }),
      db,
    );

    expect(item.status).toBe("Blocked");
    expect(item.risk).toBe("Blocked");
  });

  it("merges a same-trigger duplicate into the open item with a refreshed Activity entry", async () => {
    const first = await createApprovalQueueItem(editor, baseInput(), db);
    const second = await createApprovalQueueItem(
      editor,
      baseInput({ action_needed: "Updated: approve the revised owner email." }),
      db,
    );

    expect(second.id).toBe(first.id);
    expect(second.action_needed).toBe("Updated: approve the revised owner email.");

    const all = await listApprovalQueue(admin, {}, db);
    expect(all).toHaveLength(1);

    const activity = await listApprovalQueueActivity(admin, first.id, db);
    const refreshed = activity.find((entry) => entry.action === "refreshed");
    expect(refreshed).toBeTruthy();
    expect(refreshed?.prior_version_snapshot).toContain(
      "Approve the owner renewal email.",
    );
  });

  it("relinks a new item to a closed same-trigger item instead of reopening it", async () => {
    const first = await createApprovalQueueItem(editor, baseInput(), db);
    await transitionApprovalQueueItem(approver, first.id, { action: "approve" }, db);

    const second = await createApprovalQueueItem(editor, baseInput(), db);

    expect(second.id).not.toBe(first.id);
    expect(second.supersedes_item_id).toBe(first.id);

    const reloadedFirst = (await listApprovalQueue(admin, {}, db)).find(
      (item) => item.id === first.id,
    );
    expect(reloadedFirst?.status).toBe("Approved");
    expect(reloadedFirst?.superseded_by_item_id).toBe(second.id);
  });
});

describe("transitionApprovalQueueItem", () => {
  it("lets the required approver approve and closes the item", async () => {
    const item = await createApprovalQueueItem(editor, baseInput(), db);
    const approved = await transitionApprovalQueueItem(
      approver,
      item.id,
      { action: "approve" },
      db,
    );

    expect(approved.status).toBe("Approved");
    expect(approved.closed_at).toBeTruthy();

    const activity = await listApprovalQueueActivity(admin, item.id, db);
    expect(activity.at(-1)).toMatchObject({
      action: "approved",
      previous_state: "Ready for Approval",
      new_state: "Approved",
    });
  });

  it("blocks a non-Admin from approving their own item", async () => {
    const item = await createApprovalQueueItem(
      editor,
      baseInput({ assignee_uid: "approver-1" }),
      db,
    );

    await expect(
      transitionApprovalQueueItem(approver, item.id, { action: "approve" }, db),
    ).rejects.toThrow(EditableLayerError);
  });

  it("blocks anyone but the required approver or an Admin from approving", async () => {
    const item = await createApprovalQueueItem(
      editor,
      baseInput({ required_approver_uid: "someone-else" }),
      db,
    );

    await expect(
      transitionApprovalQueueItem(approver, item.id, { action: "approve" }, db),
    ).rejects.toThrow(/required approver or an Admin/);
  });

  it("lets an Admin approve any item, including one they are assigned", async () => {
    const item = await createApprovalQueueItem(
      editor,
      baseInput({ assignee_uid: "admin-1", required_approver_uid: "admin-1" }),
      db,
    );

    const approved = await transitionApprovalQueueItem(
      admin,
      item.id,
      { action: "approve" },
      db,
    );
    expect(approved.status).toBe("Approved");
  });

  it("requires a reason for Return for Revision", async () => {
    const item = await createApprovalQueueItem(editor, baseInput(), db);

    await expect(
      transitionApprovalQueueItem(editor, item.id, { action: "return" }, db),
    ).rejects.toThrow(/reason/);

    const returned = await transitionApprovalQueueItem(
      editor,
      item.id,
      { action: "return", reason: "Owner name is misspelled." },
      db,
    );
    expect(returned.status).toBe("Returned");
  });

  it("requires a date and reason for Snooze", async () => {
    const item = await createApprovalQueueItem(editor, baseInput(), db);

    await expect(
      transitionApprovalQueueItem(
        editor,
        item.id,
        { action: "snooze", reason: "Waiting on owner." },
        db,
      ),
    ).rejects.toThrow(/date/);

    const snoozed = await transitionApprovalQueueItem(
      editor,
      item.id,
      { action: "snooze", reason: "Waiting on owner.", snooze_until: "2026-07-01" },
      db,
    );
    expect(snoozed.status).toBe("Snoozed");
    expect(snoozed.snooze_until).toBe("2026-07-01");
  });

  it("only allows Admins to disable an action", async () => {
    const item = await createApprovalQueueItem(editor, baseInput(), db);

    await expect(
      transitionApprovalQueueItem(
        approver,
        item.id,
        { action: "disable", reason: "Integration not approved." },
        db,
      ),
    ).rejects.toThrow(/Admin/);

    const disabled = await transitionApprovalQueueItem(
      admin,
      item.id,
      { action: "disable", reason: "Integration not approved." },
      db,
    );
    expect(disabled.status).toBe("Disabled");
  });

  it("unblocks an item when a missing approver is assigned", async () => {
    const item = await createApprovalQueueItem(
      editor,
      baseInput({ required_approver_uid: undefined }),
      db,
    );
    expect(item.status).toBe("Blocked");

    const assigned = await transitionApprovalQueueItem(
      admin,
      item.id,
      { action: "assign", required_approver_uid: "approver-1" },
      db,
    );

    expect(assigned.status).toBe("Ready for Approval");
    const activity = await listApprovalQueueActivity(admin, item.id, db);
    expect(activity.at(-1)?.action).toBe("unblocked");
  });

  it("refuses to transition a closed item", async () => {
    const item = await createApprovalQueueItem(editor, baseInput(), db);
    await transitionApprovalQueueItem(approver, item.id, { action: "approve" }, db);

    await expect(
      transitionApprovalQueueItem(
        editor,
        item.id,
        { action: "return", reason: "Too late." },
        db,
      ),
    ).rejects.toThrow(/already closed/);
  });
});

describe("listApprovalQueue", () => {
  it("orders Ready for Approval, then Blocked, then overdue first, with filters", async () => {
    await createApprovalQueueItem(
      editor,
      baseInput({ source_trigger_key: "k-blocked", required_approver_uid: undefined }),
      db,
    );
    await createApprovalQueueItem(
      editor,
      baseInput({ source_trigger_key: "k-future", due_date: "2026-12-01" }),
      db,
    );
    await createApprovalQueueItem(
      editor,
      baseInput({ source_trigger_key: "k-overdue", due_date: "2026-06-01" }),
      db,
    );

    const ordered = await listApprovalQueue(admin, { referenceDate: "2026-06-05" }, db);

    expect(ordered.map((item) => item.source_trigger_key)).toEqual([
      "k-overdue",
      "k-future",
      "k-blocked",
    ]);

    const onlyBlocked = await listApprovalQueue(
      admin,
      { filters: { status: "Blocked" } },
      db,
    );
    expect(onlyBlocked).toHaveLength(1);
    expect(onlyBlocked[0].source_trigger_key).toBe("k-blocked");
  });
});
