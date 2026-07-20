import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/roles";
import {
  bulkTransitionApprovalQueueItems,
  classifyQueueRisk,
  createApprovalQueueItem,
  defaultAudienceGroup,
  getApprovalQueueItem,
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

  it("requires server-owned fixture authority for Test items", async () => {
    await expect(
      createApprovalQueueItem(editor, baseInput({ data_mode: "test" }), db),
    ).rejects.toThrow(/server-owned audit fixture key/i);

    await expect(
      createApprovalQueueItem(
        editor,
        baseInput({
          data_mode: "test",
          test_fixture_key: "user-supplied:test",
        }),
        db,
      ),
    ).rejects.toThrow(/server-owned audit fixture key/i);

    await expect(
      createApprovalQueueItem(
        editor,
        baseInput({ test_fixture_key: "audit:fixture:v1" }),
        db,
      ),
    ).rejects.toThrow(/only in Test mode/i);
  });

  it("keeps Test fixtures detached from the Live execution ledger", async () => {
    await expect(
      createApprovalQueueItem(
        editor,
        baseInput({
          action_execution_id: "action-execution-live-1",
          data_mode: "test",
          test_fixture_key: "audit:fixture:v1",
        }),
        db,
      ),
    ).rejects.toThrow(/cannot attach to a Live execution ledger/i);
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

  it("refreshes a returned same-trigger duplicate back to Ready for Approval", async () => {
    const first = await createApprovalQueueItem(editor, baseInput(), db);
    const returned = await transitionApprovalQueueItem(
      editor,
      first.id,
      { action: "return", reason: "Needs a clearer source link." },
      db,
    );
    expect(returned.status).toBe("Returned");

    const refreshed = await createApprovalQueueItem(
      editor,
      baseInput({ action_needed: "Updated: approve the revised owner email." }),
      db,
    );

    expect(refreshed.id).toBe(first.id);
    expect(refreshed.status).toBe("Ready for Approval");
    expect(refreshed.action_needed).toBe("Updated: approve the revised owner email.");
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

  it("requires explicit confirmation before approving a High-risk item", async () => {
    const item = await createApprovalQueueItem(
      editor,
      baseInput({
        risk_signals: { owner_or_tenant_facing: true },
        source_trigger_key: "high-risk-confirmation",
      }),
      db,
    );
    expect(item.risk).toBe("High");

    await expect(
      transitionApprovalQueueItem(approver, item.id, { action: "approve" }, db),
    ).rejects.toThrow(/High-risk approval requires explicit confirmation/);

    const approved = await transitionApprovalQueueItem(
      approver,
      item.id,
      { action: "approve", confirm_high_risk: true },
      db,
    );
    expect(approved.status).toBe("Approved");
  });

  it("blocks a non-Admin from approving their own item", async () => {
    const item = await createApprovalQueueItem(
      admin,
      baseInput({ assignee_uid: "approver-1" }),
      db,
    );

    await expect(
      transitionApprovalQueueItem(approver, item.id, { action: "approve" }, db),
    ).rejects.toThrow(EditableLayerError);
  });

  it("blocks unrelated non-Admins before approval", async () => {
    const item = await createApprovalQueueItem(
      admin,
      baseInput({ required_approver_uid: "someone-else" }),
      db,
    );

    await expect(
      transitionApprovalQueueItem(approver, item.id, { action: "approve" }, db),
    ).rejects.toThrow(/assignee/);
  });

  it("lets an Admin approve any item, including one they are assigned", async () => {
    const item = await createApprovalQueueItem(
      admin,
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

  it("rejects approve unless the item is Ready for Approval", async () => {
    const item = await createApprovalQueueItem(editor, baseInput(), db);
    const returned = await transitionApprovalQueueItem(
      editor,
      item.id,
      { action: "return", reason: "Owner name is misspelled." },
      db,
    );

    await expect(
      transitionApprovalQueueItem(approver, returned.id, { action: "approve" }, db),
    ).rejects.toThrow(/Ready for Approval/);
  });

  it("lets the required approver Deny with a reason, closing the item as Denied (F-APPR-1)", async () => {
    const item = await createApprovalQueueItem(editor, baseInput(), db);
    const denied = await transitionApprovalQueueItem(
      approver,
      item.id,
      { action: "deny", reason: "Owner declined the renewal terms." },
      db,
    );

    expect(denied.status).toBe("Denied");
    expect(denied.closed_at).toBeTruthy();

    const activity = await listApprovalQueueActivity(admin, item.id, db);
    expect(activity.at(-1)).toMatchObject({
      action: "denied",
      previous_state: "Ready for Approval",
      new_state: "Denied",
      reason: "Owner declined the renewal terms.",
    });
  });

  it("requires a reason to Deny (distinct from Return)", async () => {
    const item = await createApprovalQueueItem(editor, baseInput(), db);
    await expect(
      transitionApprovalQueueItem(approver, item.id, { action: "deny" }, db),
    ).rejects.toThrow(/reason/);
  });

  it("blocks a non-Admin from denying their own item (same gate as approve)", async () => {
    const item = await createApprovalQueueItem(
      admin,
      baseInput({ assignee_uid: "approver-1" }),
      db,
    );
    await expect(
      transitionApprovalQueueItem(
        approver,
        item.id,
        { action: "deny", reason: "Not acceptable." },
        db,
      ),
    ).rejects.toThrow(EditableLayerError);
  });

  it("refuses to Deny a linked execution and points to Disable Action", async () => {
    const item = await createApprovalQueueItem(
      editor,
      baseInput({ action_execution_id: "exec-linked-1" }),
      db,
    );
    await expect(
      transitionApprovalQueueItem(
        admin,
        item.id,
        { action: "deny", reason: "Reject this execution." },
        db,
      ),
    ).rejects.toThrow(/Disable Action/);
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

  it("only allows Admins to assign or reassign queue items", async () => {
    const item = await createApprovalQueueItem(editor, baseInput(), db);

    await expect(
      transitionApprovalQueueItem(
        editor,
        item.id,
        { action: "assign", assignee_uid: "someone-else" },
        db,
      ),
    ).rejects.toThrow(/Admins/);

    const assigned = await transitionApprovalQueueItem(
      admin,
      item.id,
      { action: "assign", assignee_uid: "someone-else" },
      db,
    );
    expect(assigned.assignee_uid).toBe("someone-else");
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

describe("bulkTransitionApprovalQueueItems", () => {
  it("updates eligible items and skips visible ineligible items with Activity", async () => {
    const ready = await createApprovalQueueItem(
      editor,
      baseInput({ source_trigger_key: "bulk-ready" }),
      db,
    );
    const highRisk = await createApprovalQueueItem(
      editor,
      baseInput({
        risk_signals: { owner_or_tenant_facing: true },
        source_trigger_key: "bulk-high",
      }),
      db,
    );
    const returned = await createApprovalQueueItem(
      editor,
      baseInput({ source_trigger_key: "bulk-returned" }),
      db,
    );
    await transitionApprovalQueueItem(
      editor,
      returned.id,
      { action: "return", reason: "Needs a better source." },
      db,
    );
    const terminal = await createApprovalQueueItem(
      editor,
      baseInput({ source_trigger_key: "bulk-terminal" }),
      db,
    );
    await transitionApprovalQueueItem(approver, terminal.id, { action: "approve" }, db);
    const hidden = await createApprovalQueueItem(
      admin,
      baseInput({
        assignee_uid: "someone-else",
        required_approver_uid: "someone-else",
        source_trigger_key: "bulk-hidden",
      }),
      db,
    );

    const result = await bulkTransitionApprovalQueueItems(
      approver,
      {
        action: "approve",
        item_ids: [ready.id, highRisk.id, returned.id, terminal.id, hidden.id],
      },
      db,
    );

    expect(result.summary).toEqual({
      failed: 0,
      requested: 5,
      skipped: 4,
      updated: 1,
    });
    expect(result.results.find((entry) => entry.item_id === ready.id)).toMatchObject({
      outcome: "updated",
    });
    expect(
      result.results.find((entry) => entry.item_id === highRisk.id)?.message,
    ).toMatch(/High-risk approval/);
    expect(result.results.find((entry) => entry.item_id === hidden.id)).toMatchObject({
      message: "Queue item is not available for this bulk action.",
      outcome: "skipped",
    });

    const highRiskActivity = await listApprovalQueueActivity(admin, highRisk.id, db);
    expect(highRiskActivity.at(-1)).toMatchObject({
      action: "skipped",
      reason: "High-risk approval requires explicit confirmation.",
    });
    const hiddenActivity = await listApprovalQueueActivity(admin, hidden.id, db);
    expect(hiddenActivity.some((entry) => entry.action === "skipped")).toBe(false);
  });

  it("approves High-risk items only when bulk confirmation is explicit", async () => {
    const item = await createApprovalQueueItem(
      editor,
      baseInput({
        risk_signals: { legal_financial_timing: true },
        source_trigger_key: "bulk-high-confirmed",
      }),
      db,
    );

    const result = await bulkTransitionApprovalQueueItems(
      approver,
      { action: "approve", confirm_high_risk: true, item_ids: [item.id] },
      db,
    );

    expect(result.summary.updated).toBe(1);
    expect(result.results[0].item?.status).toBe("Approved");
  });

  it("enforces bulk action-level field requirements before records are touched", async () => {
    const item = await createApprovalQueueItem(
      editor,
      baseInput({ source_trigger_key: "bulk-requirements" }),
      db,
    );

    await expect(
      bulkTransitionApprovalQueueItems(
        admin,
        { action: "return", item_ids: [item.id] },
        db,
      ),
    ).rejects.toThrow(/reason/);
    await expect(
      bulkTransitionApprovalQueueItems(
        admin,
        { action: "snooze", item_ids: [item.id], reason: "Waiting." },
        db,
      ),
    ).rejects.toThrow(/date/);
    await expect(
      bulkTransitionApprovalQueueItems(
        admin,
        { action: "assign", item_ids: [item.id] },
        db,
      ),
    ).rejects.toThrow(/assignee or required approver/);

    const activity = await listApprovalQueueActivity(admin, item.id, db);
    expect(activity).toHaveLength(1);
  });

  it("skips Admin-only bulk assign and disable when a non-Admin requests them", async () => {
    const item = await createApprovalQueueItem(
      editor,
      baseInput({ source_trigger_key: "bulk-admin-only" }),
      db,
    );

    const assignResult = await bulkTransitionApprovalQueueItems(
      editor,
      { action: "assign", assignee_uid: "someone-else", item_ids: [item.id] },
      db,
    );
    const disableResult = await bulkTransitionApprovalQueueItems(
      approver,
      {
        action: "disable",
        item_ids: [item.id],
        reason: "Action type is not approved.",
      },
      db,
    );

    expect(assignResult.summary).toMatchObject({ skipped: 1, updated: 0 });
    expect(assignResult.results[0].message).toMatch(/Admins/);
    expect(disableResult.summary).toMatchObject({ skipped: 1, updated: 0 });
    expect(disableResult.results[0].message).toMatch(/Admin/);
  });

  it("unblocks Blocked items when bulk assignment fills missing ownership", async () => {
    const item = await createApprovalQueueItem(
      editor,
      baseInput({
        required_approver_uid: undefined,
        source_trigger_key: "bulk-unblock",
      }),
      db,
    );
    expect(item.status).toBe("Blocked");

    const result = await bulkTransitionApprovalQueueItems(
      admin,
      {
        action: "assign",
        item_ids: [item.id],
        required_approver_uid: "approver-1",
      },
      db,
    );

    expect(result.summary.updated).toBe(1);
    expect(result.results[0].item?.status).toBe("Ready for Approval");
    const activity = await listApprovalQueueActivity(admin, item.id, db);
    expect(activity.at(-1)?.action).toBe("unblocked");
  });

  it("keeps bulk execute visible but guarded until executable runtime exists", async () => {
    const item = await createApprovalQueueItem(
      editor,
      baseInput({ source_trigger_key: "bulk-execute" }),
      db,
    );

    const result = await bulkTransitionApprovalQueueItems(
      admin,
      { action: "execute", item_ids: [item.id] },
      db,
    );

    expect(result.summary).toMatchObject({ skipped: 1, updated: 0 });
    expect(result.results[0].message).toMatch(/No external write was attempted/);
    const activity = await listApprovalQueueActivity(admin, item.id, db);
    expect(activity.at(-1)).toMatchObject({
      action: "skipped",
      reason: expect.stringContaining("No external write was attempted"),
    });
  });
});

describe("listApprovalQueue", () => {
  it("shows Admins every item and non-Admins only assigned or approver-relevant items", async () => {
    const assigned = await createApprovalQueueItem(
      admin,
      baseInput({
        source_trigger_key: "visible-assigned",
        assignee_uid: "editor-1",
        required_approver_uid: "approver-1",
      }),
      db,
    );
    const hidden = await createApprovalQueueItem(
      admin,
      baseInput({
        source_trigger_key: "hidden-from-editor",
        assignee_uid: "someone-else",
        required_approver_uid: "approver-1",
      }),
      db,
    );
    await createApprovalQueueItem(
      admin,
      baseInput({
        source_trigger_key: "admin-only",
        assignee_uid: "someone-else",
        required_approver_uid: "admin-1",
      }),
      db,
    );

    await expect(getApprovalQueueItem(editor, hidden.id, db)).rejects.toThrow(/assignee/);
    await expect(listApprovalQueueActivity(editor, hidden.id, db)).rejects.toThrow(
      /assignee/,
    );

    const adminItems = await listApprovalQueue(admin, {}, db);
    expect(adminItems).toHaveLength(3);

    const editorItems = await listApprovalQueue(editor, {}, db);
    expect(editorItems.map((item) => item.id)).toEqual([assigned.id]);

    const approverItems = await listApprovalQueue(approver, {}, db);
    expect(approverItems.map((item) => item.id)).toEqual([assigned.id, hidden.id]);
  });

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
