// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalQueue } from "@/components/approval/ApprovalQueue";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
} from "@/lib/firestore/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ApprovalQueue bulk UI", () => {
  it("caps Select visible at the 50-item bulk limit and keeps execute visibly guarded", async () => {
    const user = userEvent.setup();
    renderQueue({
      items: Array.from({ length: 52 }, (_, index) =>
        queueItem({
          id: `item-${index + 1}`,
          source_trigger_key: `trigger-${index + 1}`,
        }),
      ),
    });

    await user.click(screen.getByLabelText("Select visible"));

    expect(
      screen.getByText("Selected the first 50 visible queue items."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/50 selected\. 50 ready by visible checks, 0 likely skipped\./),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Select Approve item-50")).toBeChecked();
    expect(screen.getByLabelText("Select Approve item-51")).not.toBeChecked();

    await user.selectOptions(screen.getByRole("combobox", { name: "Action" }), "execute");

    expect(
      screen.getByText(
        "Execute is visible for v1, but current items will be skipped until approved executable action runtime exists.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/50 selected\. 0 ready by visible checks, 50 likely skipped\./),
    ).toBeInTheDocument();
  });

  it("sends bulk High-risk confirmation only after the user confirms", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      const url = String(input);

      if (url === "/api/approval-queue/bulk") {
        return jsonResponse({
          results: [
            {
              item: queueItem({ id: "item-1", status: "Approved" }),
              item_id: "item-1",
              message: "Queue item approved.",
              outcome: "updated",
            },
            {
              item_id: "item-2",
              message: "Only Ready for Approval queue items can be approved.",
              outcome: "skipped",
            },
          ],
          summary: { failed: 0, requested: 2, skipped: 1, updated: 1 },
        });
      }

      if (url === "/api/approval-queue/item-1") {
        return jsonResponse({
          activity: [activityEntry({ item_id: "item-1" })],
          item: queueItem({ id: "item-1", status: "Approved" }),
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderQueue({
      items: [
        queueItem({ id: "item-1", risk: "High" }),
        queueItem({
          id: "item-2",
          risk: "Medium",
          status: "Returned",
          source_trigger_key: "trigger-2",
        }),
      ],
    });

    await user.click(screen.getByLabelText("Select visible"));
    await user.click(screen.getByRole("button", { name: "Apply Bulk" }));

    await waitFor(() =>
      expect(screen.getAllByText(/1 updated, 1 skipped, 0 failed/)).toHaveLength(2),
    );
    expect(window.confirm).toHaveBeenCalledWith(
      "This bulk approval includes 1 High-risk item(s). Approve them?",
    );

    const bulkCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === "/api/approval-queue/bulk",
    );
    expect(bulkCall).toBeTruthy();
    expect(JSON.parse(String(bulkCall?.[1]?.body))).toMatchObject({
      action: "approve",
      confirm_high_risk: true,
      item_ids: ["item-1", "item-2"],
    });
  });

  it("does not submit bulk High-risk approval when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderQueue({ items: [queueItem({ risk: "High" })] });

    await user.click(screen.getByLabelText("Select visible"));
    await user.click(screen.getByRole("button", { name: "Apply Bulk" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "This bulk approval includes 1 High-risk item(s). Approve them?",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function renderQueue({
  activity = [activityEntry()],
  items,
}: {
  activity?: ApprovalQueueActivityRecord[];
  items: ApprovalQueueItemRecord[];
}) {
  return render(
    <ApprovalQueue
      currentUser={{ role: "Admin", uid: "admin-1" }}
      initialActivity={activity}
      initialItems={items}
    />,
  );
}

function queueItem(
  overrides: Partial<ApprovalQueueItemRecord> = {},
): ApprovalQueueItemRecord {
  const id = overrides.id ?? "item-1";

  return {
    action_needed: `Approve ${id}`,
    assignee_uid: "editor-1",
    audience_group: "Dan/Admin decisions",
    created_at: "2026-06-05T00:00:00.000Z",
    direct_link: "/runs/run-1",
    due_date: "2026-06-15",
    id,
    item_type: "ApprovalPackage",
    process_run_ref: { id: "run-1", label: "Lease Renewal - 123 Main" },
    required_approver_uid: "admin-1",
    risk: "High",
    source_trigger_key: `trigger-${id}`,
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
    actor_uid: "demo-reset",
    created_at: "2026-06-05T00:00:00.000Z",
    id: "activity-1",
    item_id: "item-1",
    new_state: "Ready for Approval",
    source_trigger: "ApprovalPackage",
    ...overrides,
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
