// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ loadNotificationHub: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/auth/page-guards", () => ({
  requirePageCapability: async () => ({ uid: "editor", role: "Editor" }),
}));
vi.mock("@/lib/notifications/hub", () => ({
  loadNotificationHub: mocks.loadNotificationHub,
}));
import NotificationsPage from "@/app/notifications/page";
import { buildDecisionAttentionBacklog } from "@/lib/attention/decision-backlog";
import { buildNotificationFeed } from "@/lib/notifications/feed";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([false, true])(
  "S238 A-06 Notifications preserves partial rows (%s) without a false all-clear or complete count",
  async (withRow) => {
    const attention = buildDecisionAttentionBacklog({
      rows: withRow
        ? [
            {
              kind: "queue_item",
              key: "queue_item:current",
              itemId: "current",
              label: "Review current package",
              detail: "Current renewal",
              severity: "Low",
              href: "/approval-queue",
            },
          ]
        : [],
      counts: {
        total: withRow ? 1 : 0,
        renewalFlags: 0,
        writebacksAwaiting: 0,
        queueItems: withRow ? 1 : 0,
      },
      readState: "partial",
      unavailableFeeds: ["renewal_reviews"],
      renewalReviewIssue: {
        code: "source_stale",
        message: "The renewal source is stale.",
        sourceReadAtIso: null,
        overlayUnavailable: false,
      },
    });
    mocks.loadNotificationHub.mockResolvedValue(
      buildNotificationFeed({ approval: [], maintenance: [], decisions: attention }),
    );
    render(await NotificationsPage());
    const section = screen.getByRole("region", { name: "Needs your decision" });
    expect(within(section).getByText(/renewal source is stale/)).toBeVisible();
    expect(
      within(section).queryByText("Nothing needs your decision right now."),
    ).not.toBeInTheDocument();
    expect(section.querySelector(".console-deck-count")).toBeNull();
    if (withRow)
      expect(
        within(section).getByRole("link", { name: "Review current package" }),
      ).toBeVisible();
    expect(mocks.loadNotificationHub).toHaveBeenCalledTimes(1);
  },
);
