// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardAttentionQueue } from "@/components/console/DashboardAttentionQueue";
import type { AttentionQueue, AttentionQueueRow } from "@/lib/attention/attention-queue";

// S147 BEH-S147-2 / AC-S147-4: the compact queue's states and its refresh after the existing
// inline Approve. The rows are value-free; Approve PATCHes the unchanged item route.

function row(overrides: Partial<AttentionQueueRow> = {}): AttentionQueueRow {
  return {
    key: "queue_item:q1",
    kind: "queue_item",
    label: "Approve renewal package",
    detail: "Run 1",
    severity: "Low",
    href: "/approval-queue?item_id=q1",
    authority: "approve_inline",
    itemId: "q1",
    ...overrides,
  };
}

function queue(overrides: Partial<AttentionQueue> = {}): AttentionQueue {
  return {
    state: "ok",
    rows: [row()],
    unavailableFeeds: [],
    seeAllHref: "/approval-queue",
    checkedAtIso: "2026-10-01T15:00:00.000Z",
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderQueue(initial: AttentionQueue, canApprove = true) {
  await act(async () => {
    render(
      <DashboardAttentionQueue
        canApprove={canApprove}
        initial={Promise.resolve(initial)}
      />,
    );
  });
  return screen.getByRole("region", { name: "Waiting on you" });
}

describe("S147 compact attention queue", () => {
  it("says nothing is waiting only after a complete read", async () => {
    const region = await renderQueue(queue({ rows: [] }));
    expect(
      within(region).getByText("Nothing is waiting on you right now."),
    ).toBeVisible();
    expect(within(region).queryByTestId("attention-count")).toBeNull();
  });

  it("shows an unavailable read without a count or an all-clear", async () => {
    const region = await renderQueue(
      queue({
        state: "unavailable",
        rows: [],
        unavailableFeeds: ["approval_queue", "renewal_reviews"],
      }),
    );
    expect(within(region).getByText(/could not be loaded just now/)).toBeVisible();
    expect(within(region).queryByText(/Nothing is waiting/)).toBeNull();
    expect(within(region).queryByTestId("attention-count")).toBeNull();
    expect(within(region).getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("marks a partial read as possibly incomplete and shows no total", async () => {
    const region = await renderQueue(
      queue({ state: "partial", unavailableFeeds: ["renewal_reviews"] }),
    );
    expect(within(region).getByText(/may be incomplete/)).toBeVisible();
    expect(within(region).queryByTestId("attention-count")).toBeNull();
    expect(
      within(region).getByRole("link", { name: "Approve renewal package" }),
    ).toBeVisible();
  });

  it("refreshes after an inline Approve so the decided item leaves the queue", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/approval-queue/q1" && init?.method === "PATCH") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url === "/api/dashboard/attention") {
        return new Response(JSON.stringify(queue({ rows: [] })), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    const region = await renderQueue(queue());
    expect(within(region).getByTestId("attention-count")).toHaveTextContent("1");

    await user.click(within(region).getByRole("button", { name: "Approve" }));

    expect(
      await within(region).findByText("Nothing is waiting on you right now."),
    ).toBeVisible();
    const calls = fetchMock.mock.calls.map(([url, init]) => [
      String(url),
      (init as RequestInit | undefined)?.method ?? "GET",
    ]);
    expect(calls).toEqual([
      ["/api/approval-queue/q1", "PATCH"],
      ["/api/dashboard/attention", "GET"],
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      action: "approve",
    });
  });

  it("never offers inline Approve for a view-only or review-surface row", async () => {
    const region = await renderQueue(
      queue({
        rows: [
          row({
            key: "queue_item:v",
            itemId: "v",
            authority: "view",
            label: "Submitted item",
          }),
          row({
            key: "queue_item:a",
            itemId: "a",
            authority: "approve",
            label: "High risk",
          }),
          row({
            key: "renewal_flag:run-1:rent",
            kind: "renewal_flag",
            itemId: undefined,
            authority: "review",
            label: "Current rent",
          }),
        ],
      }),
    );
    expect(within(region).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(region).getByText(/Waiting on an approver/)).toBeVisible();
    expect(within(region).getByText(/Review to decide/)).toBeVisible();
  });

  it("offers an access request instead of Approve to someone who cannot approve", async () => {
    const region = await renderQueue(queue(), false);
    expect(within(region).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(region).getByText(/requires Approver access/)).toBeVisible();
  });
});
