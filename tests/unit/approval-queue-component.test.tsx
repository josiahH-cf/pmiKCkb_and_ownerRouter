// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalQueue } from "@/components/approval/ApprovalQueue";
import { formatDateTime } from "@/components/approval/ApprovalQueueModel";
import { NeedsDecisionInboxPanel } from "@/components/approval/NeedsDecisionInboxPanel";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
} from "@/lib/firestore/types";
import type { Role } from "@/lib/auth/roles";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Approval Queue hydration-safe timestamps", () => {
  it("formats activity in the explicit Kansas City time zone", () => {
    expect(formatDateTime("2026-07-15T15:00:00.000Z")).toBe("Jul 15, 2026, 10:00 AM CDT");
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});

describe("ApprovalQueue default inbox (B1)", () => {
  it("lands on the value-free 'Needs your decision' inbox by default", () => {
    renderQueue({
      items: [
        queueItem({
          id: "item-1",
          action_needed: "Approve the renewal package",
          direct_link: "/runs/run-9",
          risk: "High",
        }),
      ],
    });

    // The unified inbox is the always-visible landing surface; the other views hide behind a disclosure.
    expect(screen.getByText("Other views")).toBeInTheDocument();
    // The open queue item shows as a value-free deep-link row, not the bulk detail panel.
    expect(
      screen.getByRole("link", { name: /Approve the renewal package/ }),
    ).toHaveAttribute("href", "/runs/run-9");
    // High-risk rows stay deep-link-only on this triage surface.
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByLabelText("Select visible")).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply Bulk" })).toBeNull();
  });

  it("approves a safe queue row inline through the existing item PATCH", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ message: "Queue item approved." }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderQueue({
      currentUser: { role: "Approver", uid: "approver-1" },
      items: [
        queueItem({
          id: "safe-item",
          assignee_uid: "editor-1",
          required_approver_uid: "approver-1",
          risk: "Medium",
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(screen.getByText("Approved.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/approval-queue/safe-item", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
  });

  it("keeps self-assigned safe-risk queue rows deep-link-only", () => {
    renderQueue({
      currentUser: { role: "Approver", uid: "approver-1" },
      items: [
        queueItem({
          id: "own-item",
          assignee_uid: "approver-1",
          required_approver_uid: "approver-1",
          risk: "Low",
        }),
      ],
    });

    expect(screen.getByRole("link", { name: /Approve own-item/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("keeps renewal-flag and write-back rows deep-link-only", () => {
    render(
      <NeedsDecisionInboxPanel
        inbox={{
          counts: {
            total: 2,
            queueItems: 0,
            renewalFlags: 1,
            writebacksAwaiting: 1,
          },
          rows: [
            {
              kind: "renewal_flag",
              key: "renewal_flag:run-1:rent",
              label: "Current rent",
              detail: "Run 1",
              severity: "Medium",
              href: "/lease-renewal/runs/run-1",
            },
            {
              kind: "writeback",
              key: "writeback:run-1:rent",
              label: "Current rent write-back",
              detail: "Run 1 · awaiting write-back approval",
              severity: "Low",
              href: "/lease-renewal/runs/run-1?field=rent",
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("hides queue items that no longer need a decision", () => {
    renderQueue({
      items: [
        queueItem({ id: "done", action_needed: "Already approved", status: "Approved" }),
      ],
    });

    expect(
      screen.getByText("Nothing needs your decision right now."),
    ).toBeInTheDocument();
  });

  it("keeps the inbox stable when the All items list is filtered to a subset", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/approval-queue")) {
        return jsonResponse({ items: [] }); // a filter that matches nothing
      }
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderQueue({
      items: [
        queueItem({ id: "a", status: "Ready for Approval" }),
        queueItem({ id: "b", status: "Blocked", source_trigger_key: "trigger-b" }),
      ],
    });

    // The always-visible inbox reflects the full open backlog on landing (2 queue items).
    expect(screen.getByText(/2 things need your decision/)).toBeInTheDocument();

    // Filtering the All items list to an empty subset must NOT shrink the inbox: the triage inbox is
    // built from the immutable full set, not the filtered list (B1 regression fix). Open "Other views"
    // to reach the All items filter.
    await user.click(screen.getByText("Other views"));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText(/2 things need your decision/)).toBeInTheDocument();
  });
});

describe("ApprovalQueue bulk UI", () => {
  it("opens a deep-linked item on the All items view with it selected", () => {
    renderQueue({
      initialSelectedItemId: "item-2",
      items: [
        queueItem({ id: "item-1" }),
        queueItem({ id: "item-2", action_needed: "Approve selected item" }),
      ],
    });

    // A notification deep-link (?item_id=) lands on All items so the item's detail/approve panel
    // renders in place, not on the value-free triage inbox (B1 regression fix).
    expect(screen.getByRole("tab", { name: /All items/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("heading", { name: "Approve selected item" }),
    ).toBeInTheDocument();
  });

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

    await user.click(screen.getByText("Other views"));
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

    await user.click(screen.getByText("Other views"));
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

    await user.click(screen.getByText("Other views"));
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
  currentUser = { role: "Admin", uid: "admin-1" },
  initialSelectedItemId,
  items,
}: {
  activity?: ApprovalQueueActivityRecord[];
  currentUser?: { role: Role; uid: string };
  initialSelectedItemId?: string;
  items: ApprovalQueueItemRecord[];
}) {
  return render(
    <ApprovalQueue
      currentUser={currentUser}
      initialActivity={activity}
      initialItems={items}
      initialSelectedItemId={initialSelectedItemId}
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
