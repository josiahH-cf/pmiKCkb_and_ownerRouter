// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationMenu } from "@/components/layout/NotificationMenu";
import type {
  NotificationFamilyView,
  UnifiedNotification,
} from "@/lib/notifications/families";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("NotificationMenu", () => {
  it("loads a unified feed and marks one read before opening its link", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/notifications/mark-read") && init?.method === "POST") {
        return jsonResponse({ ok: true });
      }
      if (url.includes("/api/notifications?")) {
        return jsonResponse({
          notifications: [approvalUnified(), maintenanceUnified()],
          families: familyViews(),
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationMenu navigate={navigate} />);

    expect(await screen.findByText("2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Notifications, 2 unread/ }));

    expect(screen.getByText("New queue item: Lease Renewal")).toBeInTheDocument();
    expect(screen.getByText("Maintenance ticket assigned")).toBeInTheDocument();

    await user.click(screen.getByText("New queue item: Lease Renewal"));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/approval-queue?item_id=item-1"),
    );
    const markReadCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/notifications/mark-read"),
    );
    expect(markReadCall).toBeTruthy();
    expect(JSON.parse(String(markReadCall?.[1]?.body))).toEqual({
      source: "approval_queue",
      id: "a-1",
    });
  });

  it("auto-refreshes the feed when the tab regains visibility (NOTIF-1)", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ notifications: [approvalUnified()], families: familyViews() }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationMenu navigate={() => undefined} />);
    await screen.findByText("1");
    // No user interaction in this test, so every fetch is a feed poll.
    const before = fetchMock.mock.calls.length;

    // Tab regains visibility → the bell re-fetches without a manual click.
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });

  it("shows the uncapped unread total, not the capped preview length (LR-01)", async () => {
    document.title = "PMI KC";
    // The server caps the preview list at 8 rows but reports the true unread total separately.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          notifications: Array.from({ length: 8 }, (_, index) =>
            approvalUnified({ id: `a-${index}` }),
          ),
          families: familyViews(),
          unreadTotal: 20,
        }),
      ),
    );

    render(<NotificationMenu navigate={() => undefined} />);

    // The "9+" affordance is reachable only because the count is decoupled from the 8-row preview list.
    expect(await screen.findByText("9+")).toBeInTheDocument();
    // The accessible label and the tab title report the true total, not the preview length of 8.
    expect(
      screen.getByRole("button", { name: /Notifications, 20 unread/ }),
    ).toBeInTheDocument();
    expect(document.title).toBe("(20) PMI KC");
  });

  it("prefixes the tab title with the unread count (NOTIF-4)", async () => {
    document.title = "PMI KC";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          notifications: [approvalUnified(), maintenanceUnified()],
          families: familyViews(),
        }),
      ),
    );

    render(<NotificationMenu navigate={() => undefined} />);
    await screen.findByText("2");
    expect(document.title).toBe("(2) PMI KC");
  });

  it("never stacks the unread-count prefix on the tab title (NOTIF-4)", async () => {
    document.title = "(9) PMI KC"; // a stale prefix from a previous count
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ notifications: [approvalUnified()], families: familyViews() }),
      ),
    );

    render(<NotificationMenu navigate={() => undefined} />);
    await screen.findByText("1");
    expect(document.title).toBe("(1) PMI KC");
  });

  // AC-S17-1 + B6: the popover links to the /notifications hub and offers Mark all read when unread.
  it("links to the notifications hub and marks all read (AC-S17-1, B6)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/notifications/mark-all-read") && init?.method === "POST") {
        return jsonResponse({ ok: true, marked: 2 });
      }
      if (url.includes("/api/notifications?")) {
        return jsonResponse({
          notifications: [approvalUnified(), maintenanceUnified()],
          families: familyViews(),
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationMenu navigate={() => undefined} />);
    await user.click(
      await screen.findByRole("button", { name: /Notifications, 2 unread/ }),
    );

    const hubLink = screen.getByRole("link", { name: "See all notifications" });
    expect(hubLink).toHaveAttribute("href", "/notifications");

    await user.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).includes("/api/notifications/mark-all-read") &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true),
    );
  });

  it("renders workflow-specific Gmail attention as available in-app families", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ notifications: [], families: familyViews() })),
    );

    render(<NotificationMenu navigate={() => undefined} />);
    await user.click(await screen.findByRole("button", { name: "Notifications" }));

    expect(screen.getByText("No unread event notifications.")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Renewal communications" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Maintenance communications" }),
    ).toBeChecked();
  });

  it("mutes an available family through the preferences endpoint", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/notifications/preferences") && init?.method === "PATCH") {
        return jsonResponse({
          preferences: {
            uid: "editor-1",
            muted_families: ["maintenance_tickets"],
            email_enabled: false,
          },
        });
      }
      if (url.includes("/api/notifications?")) {
        return jsonResponse({
          notifications: [maintenanceUnified()],
          families: familyViews(),
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationMenu navigate={() => undefined} />);
    await user.click(await screen.findByRole("button", { name: /Notifications/ }));

    await user.click(screen.getByRole("checkbox", { name: "Maintenance tickets" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes("/api/notifications/preferences") &&
          (init as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patchCall).toBeTruthy();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
        muted_families: ["maintenance_tickets"],
      });
    });
  });

  it("omits the Approval Queue link when the server omits that scoped family", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          notifications: [maintenanceUnified()],
          families: familyViews().filter((family) => family.key !== "approval_queue"),
        }),
      ),
    );

    render(<NotificationMenu navigate={() => undefined} />);
    await user.click(await screen.findByRole("button", { name: /Notifications/ }));

    expect(screen.queryByRole("link", { name: "Open Approval Queue" })).toBeNull();
    expect(screen.getByText("Maintenance ticket assigned")).toBeInTheDocument();
  });

  it("collapses notification types into a dropdown (NOTIF-2)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ notifications: [], families: familyViews() })),
    );
    render(<NotificationMenu navigate={() => undefined} />);
    await user.click(await screen.findByRole("button", { name: "Notifications" }));

    // The "Notification types" controls sit behind a collapsed disclosure, not an always-open list.
    expect(screen.getByText("Notification types").closest("details")).not.toHaveAttribute(
      "open",
    );
  });
});

function approvalUnified(
  overrides: Partial<UnifiedNotification> = {},
): UnifiedNotification {
  return {
    id: "a-1",
    source: "approval_queue",
    family: "approval_queue",
    lane: "decision",
    severity: "medium",
    title: "New queue item: Lease Renewal",
    message: "Review the requested approval action.",
    href: "/approval-queue?item_id=item-1",
    created_at: "2026-07-09T01:00:00.000Z",
    ...overrides,
  };
}

function maintenanceUnified(
  overrides: Partial<UnifiedNotification> = {},
): UnifiedNotification {
  return {
    id: "m-1",
    source: "maintenance_ticket",
    family: "maintenance_tickets",
    lane: "decision",
    severity: "medium",
    title: "Maintenance ticket assigned",
    message: "A maintenance ticket was assigned to you.",
    href: "/maintenance",
    created_at: "2026-07-09T02:00:00.000Z",
    ...overrides,
  };
}

function familyViews(): NotificationFamilyView[] {
  return [
    {
      key: "approval_queue",
      label: "Approvals",
      description: "Queue items assigned to you or waiting on your approval.",
      available: true,
      lane: "decision",
      muted: false,
    },
    {
      key: "maintenance_tickets",
      label: "Maintenance tickets",
      description: "Updates on maintenance tickets assigned to you.",
      available: true,
      lane: "decision",
      muted: false,
    },
    {
      key: "renewal_communications",
      label: "Renewal communications",
      description: "Value-free attention for replies on linked renewal communication.",
      available: true,
      lane: "decision",
      muted: false,
    },
    {
      key: "maintenance_communications",
      label: "Maintenance communications",
      description:
        "Value-free attention for replies on linked maintenance communication.",
      available: true,
      lane: "decision",
      muted: false,
    },
  ];
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
