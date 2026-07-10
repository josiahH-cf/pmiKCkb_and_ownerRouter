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

  it("renders the stubbed Gmail-dependent families as waiting on access", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ notifications: [], families: familyViews() })),
    );

    render(<NotificationMenu navigate={() => undefined} />);
    await user.click(await screen.findByRole("button", { name: "Notifications" }));

    expect(
      screen.getByText("RentVine replies: Waiting on Gmail access"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Owner replies: Waiting on Gmail access"),
    ).toBeInTheDocument();
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
      key: "rentvine_replies",
      label: "RentVine replies",
      description: "Replies on RentVine conversations you are working.",
      available: false,
      lane: "decision",
      unavailableReason: "Waiting on Gmail access",
      muted: false,
    },
    {
      key: "owner_process_replies",
      label: "Owner replies",
      description: "Owner replies to process emails you sent.",
      available: false,
      lane: "decision",
      unavailableReason: "Waiting on Gmail access",
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
