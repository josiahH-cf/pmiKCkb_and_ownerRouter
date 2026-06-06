// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationMenu } from "@/components/layout/NotificationMenu";
import type { ApprovalQueueNotificationRecord } from "@/lib/firestore/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("NotificationMenu", () => {
  it("loads unread queue notifications and marks one read before opening the queue item", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/approval-queue/notifications?")) {
        return jsonResponse({ notifications: [notification()] });
      }

      if (
        url === "/api/approval-queue/notifications/notification-1" &&
        init?.method === "PATCH"
      ) {
        return jsonResponse({
          notification: notification({ read_at: "2026-06-06T00:00:00.000Z" }),
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationMenu navigate={navigate} />);

    expect(await screen.findByText("1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Notifications, 1 unread/ }));

    expect(screen.getByText("New queue item: Lease Renewal")).toBeInTheDocument();
    await user.click(screen.getByText("New queue item: Lease Renewal"));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/approval-queue?item_id=item-1"),
    );
    const patchCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === "/api/approval-queue/notifications/notification-1",
    );
    expect(patchCall).toBeTruthy();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      action: "mark_read",
    });
  });

  it("shows a quiet empty state when no queue notifications need attention", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ notifications: [] })),
    );

    render(<NotificationMenu navigate={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "Notifications" }));

    expect(
      screen.getByText("No queue notifications need your attention."),
    ).toBeInTheDocument();
  });
});

function notification(
  overrides: Partial<ApprovalQueueNotificationRecord> = {},
): ApprovalQueueNotificationRecord {
  return {
    created_at: "2026-06-06T00:00:00.000Z",
    direct_link: "/runs/run-1",
    due_date: "2026-06-15",
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

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
