import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as GET_LIST } from "@/app/api/approval-queue/route";
import {
  GET as GET_ITEM,
  PATCH as PATCH_ITEM,
} from "@/app/api/approval-queue/[itemId]/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  getApprovalQueueItem,
  listApprovalQueue,
  listApprovalQueueActivity,
  transitionApprovalQueueItem,
} from "@/lib/firestore/approval-queue";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
} from "@/lib/firestore/types";

vi.mock("@/lib/firestore/approval-queue", () => ({
  getApprovalQueueItem: vi.fn(),
  listApprovalQueue: vi.fn(),
  listApprovalQueueActivity: vi.fn(),
  transitionApprovalQueueItem: vi.fn(),
}));

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(getApprovalQueueItem).mockReset();
  vi.mocked(listApprovalQueue).mockReset();
  vi.mocked(listApprovalQueueActivity).mockReset();
  vi.mocked(transitionApprovalQueueItem).mockReset();
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
    vi.mocked(transitionApprovalQueueItem).mockResolvedValue(
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
      jsonRequest({ action: "approve" }),
      itemContext("item-1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      activity: [{ id: "activity-1" }, { id: "activity-2" }],
      item: { status: "Approved" },
    });
    expect(transitionApprovalQueueItem).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      "item-1",
      { action: "approve" },
    );
  });

  it("rejects invalid transition bodies before the repository runs", async () => {
    setAdmin();

    const response = await PATCH_ITEM(jsonRequest({ action: "approve-now" }), {
      params: Promise.resolve({ itemId: "item-1" }),
    });

    expect(response.status).toBe(400);
    expect(transitionApprovalQueueItem).not.toHaveBeenCalled();
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
