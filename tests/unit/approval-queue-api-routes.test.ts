import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as GET_LIST } from "@/app/api/approval-queue/route";
import {
  GET as GET_ITEM,
  PATCH as PATCH_ITEM,
} from "@/app/api/approval-queue/[itemId]/route";
import { POST as POST_BULK } from "@/app/api/approval-queue/bulk/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  getApprovalQueueItem,
  listApprovalQueue,
  listApprovalQueueActivity,
} from "@/lib/firestore/approval-queue";
import {
  bulkTransitionApprovalQueueItemsWithWorkflowSync,
  transitionApprovalQueueItemWithWorkflowSync,
} from "@/lib/firestore/workflow-approval-queue-sync";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
} from "@/lib/firestore/types";

vi.mock("@/lib/firestore/approval-queue", () => ({
  getApprovalQueueItem: vi.fn(),
  listApprovalQueue: vi.fn(),
  listApprovalQueueActivity: vi.fn(),
}));

vi.mock("@/lib/firestore/workflow-approval-queue-sync", () => ({
  bulkTransitionApprovalQueueItemsWithWorkflowSync: vi.fn(),
  transitionApprovalQueueItemWithWorkflowSync: vi.fn(),
}));

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(bulkTransitionApprovalQueueItemsWithWorkflowSync).mockReset();
  vi.mocked(getApprovalQueueItem).mockReset();
  vi.mocked(listApprovalQueue).mockReset();
  vi.mocked(listApprovalQueueActivity).mockReset();
  vi.mocked(transitionApprovalQueueItemWithWorkflowSync).mockReset();
});

describe("Approval Queue API routes", () => {
  it("returns 401 before listing queue items when unauthenticated", async () => {
    setAuthResolverForTest(() => null);

    const response = await GET_LIST(new Request("http://localhost/api/approval-queue"));

    expect(response.status).toBe(401);
    expect(listApprovalQueue).not.toHaveBeenCalled();
  });

  it("lists queue items with supported filters", async () => {
    setAdmin();
    vi.mocked(listApprovalQueue).mockResolvedValue([queueItem()]);

    const response = await GET_LIST(
      new Request(
        "http://localhost/api/approval-queue?status=Ready+for+Approval&risk=High&audience_group=Dan%2FAdmin+decisions&process_run_id=run-1&assignee_uid=editor-1&required_approver_uid=admin-1&due_date=2026-06-15",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [{ id: "item-1" }],
    });
    expect(listApprovalQueue).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      {
        filters: {
          assignee_uid: "editor-1",
          audience_group: "Dan/Admin decisions",
          due_date: "2026-06-15",
          process_run_id: "run-1",
          required_approver_uid: "admin-1",
          risk: "High",
          status: "Ready for Approval",
        },
      },
    );
  });

  it("rejects invalid list filters", async () => {
    setAdmin();

    const response = await GET_LIST(
      new Request("http://localhost/api/approval-queue?status=In+Review"),
    );

    expect(response.status).toBe(400);
    expect(listApprovalQueue).not.toHaveBeenCalled();
  });

  it("returns one item with Activity", async () => {
    setAdmin();
    vi.mocked(getApprovalQueueItem).mockResolvedValue(queueItem());
    vi.mocked(listApprovalQueueActivity).mockResolvedValue([activityEntry()]);

    const response = await GET_ITEM(
      new Request("http://localhost/api/approval-queue/item-1"),
      itemContext("item-1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      activity: [{ id: "activity-1" }],
      item: { id: "item-1" },
    });
    expect(getApprovalQueueItem).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      "item-1",
    );
  });

  it("applies a queue transition and returns refreshed Activity", async () => {
    setAdmin();
    vi.mocked(transitionApprovalQueueItemWithWorkflowSync).mockResolvedValue(
      queueItem({ status: "Approved" }),
    );
    vi.mocked(listApprovalQueueActivity).mockResolvedValue([
      activityEntry(),
      activityEntry({
        action: "approved",
        id: "activity-2",
        new_state: "Approved",
        previous_state: "Ready for Approval",
      }),
    ]);

    const response = await PATCH_ITEM(
      jsonRequest({ action: "approve", confirm_high_risk: true }),
      itemContext("item-1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      activity: [{ id: "activity-1" }, { id: "activity-2" }],
      item: { status: "Approved" },
    });
    expect(transitionApprovalQueueItemWithWorkflowSync).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      "item-1",
      { action: "approve", confirm_high_risk: true },
    );
  });

  it("rejects invalid transition bodies before the repository runs", async () => {
    setAdmin();

    const response = await PATCH_ITEM(jsonRequest({ action: "approve-now" }), {
      params: Promise.resolve({ itemId: "item-1" }),
    });

    expect(response.status).toBe(400);
    expect(transitionApprovalQueueItemWithWorkflowSync).not.toHaveBeenCalled();
  });

  it("returns 401 before bulk actions when unauthenticated", async () => {
    setAuthResolverForTest(() => null);

    const response = await POST_BULK(
      jsonRequest({ action: "approve", item_ids: ["item-1"] }),
    );

    expect(response.status).toBe(401);
    expect(bulkTransitionApprovalQueueItemsWithWorkflowSync).not.toHaveBeenCalled();
  });

  it("applies bulk actions and returns per-item results", async () => {
    setAdmin();
    vi.mocked(bulkTransitionApprovalQueueItemsWithWorkflowSync).mockResolvedValue({
      results: [
        {
          item: queueItem({ status: "Approved" }),
          item_id: "item-1",
          message: "Queue item approved.",
          outcome: "updated",
        },
        {
          item_id: "item-2",
          message: "Only Ready for Approval items can be approved.",
          outcome: "skipped",
        },
      ],
      summary: { failed: 0, requested: 2, skipped: 1, updated: 1 },
    });

    const response = await POST_BULK(
      jsonRequest({
        action: "approve",
        confirm_high_risk: true,
        item_ids: ["item-1", "item-2"],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      results: [
        { item_id: "item-1", outcome: "updated" },
        { item_id: "item-2", outcome: "skipped" },
      ],
      summary: { requested: 2, skipped: 1, updated: 1 },
    });
    expect(bulkTransitionApprovalQueueItemsWithWorkflowSync).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      { action: "approve", confirm_high_risk: true, item_ids: ["item-1", "item-2"] },
    );
  });

  it("rejects invalid bulk payloads before the repository runs", async () => {
    setAdmin();

    const response = await POST_BULK(jsonRequest({ action: "execute", item_ids: [] }));

    expect(response.status).toBe(400);
    expect(bulkTransitionApprovalQueueItemsWithWorkflowSync).not.toHaveBeenCalled();
  });

  it("rejects bulk payloads over the 50 item limit", async () => {
    setAdmin();

    const response = await POST_BULK(
      jsonRequest({
        action: "approve",
        item_ids: Array.from({ length: 51 }, (_, index) => `item-${index}`),
      }),
    );

    expect(response.status).toBe(400);
    expect(bulkTransitionApprovalQueueItemsWithWorkflowSync).not.toHaveBeenCalled();
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

function queueItem(
  overrides: Partial<ApprovalQueueItemRecord> = {},
): ApprovalQueueItemRecord {
  return {
    action_needed: "Approve the owner renewal email.",
    assignee_uid: "editor-1",
    audience_group: "Dan/Admin decisions",
    created_at: "2026-06-05T00:00:00.000Z",
    direct_link: "/runs/run-1",
    due_date: "2026-06-15",
    id: "item-1",
    item_type: "ApprovalPackage",
    process_run_ref: { id: "run-1", label: "Demo/Test - Lease Renewal" },
    required_approver_uid: "admin-1",
    risk: "High",
    source_trigger_key: "run-1:owner-comms",
    status: "Ready for Approval",
    updated_at: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}

function activityEntry(
  overrides: Partial<ApprovalQueueActivityRecord> = {},
): ApprovalQueueActivityRecord {
  return {
    action: "created",
    actor_uid: "editor-1",
    created_at: "2026-06-05T00:00:00.000Z",
    id: "activity-1",
    item_id: "item-1",
    new_state: "Ready for Approval",
    source_trigger: "ApprovalPackage",
    ...overrides,
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/approval-queue/item-1", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}

function itemContext(itemId: string) {
  return { params: Promise.resolve({ itemId }) };
}
