// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ATTENTION_LANES } from "@/lib/attention/lanes";
import {
  ConsoleActionDeck,
  type ConsoleDeckCard,
} from "@/components/console/ConsoleActionDeck";
import {
  ConsoleProcessStrip,
  type ConsoleProcessItem,
} from "@/components/console/ConsoleProcessStrip";

afterEach(cleanup);

const cards: ConsoleDeckCard[] = [
  {
    key: "approvals",
    title: "Needs your decision",
    lane: "decision",
    count: 5,
    rows: [
      { label: "Current rent", detail: "Run 1", href: "/lease-renewal/runs/run-1" },
      { label: "Notice date", detail: "Run 2", href: "/lease-renewal/runs/run-2" },
      { label: "Deposit", detail: "Run 3", href: "/lease-renewal/runs/run-3" },
      { label: "Term", detail: "Run 4", href: "/lease-renewal/runs/run-4" },
    ],
    emptyLabel: "Nothing needs your decision right now.",
    seeAllHref: "/approval-queue",
  },
  {
    key: "connections",
    title: "Connections to set up",
    lane: "connection",
    count: 0,
    rows: [],
    emptyLabel: "Every connector is set up.",
    seeAllHref: "/connections",
  },
];

// One approvals card mixing a queue_item row (itemId → in-place Approve) with a plain deep-link row.
const withQueueItem: ConsoleDeckCard[] = [
  {
    key: "approvals",
    title: "Needs your decision",
    lane: "decision",
    count: 2,
    rows: [
      {
        label: "Approve renewal package",
        detail: "Run 1",
        href: "/approval-queue?item_id=q1",
        itemId: "q1",
      },
      { label: "Current rent", detail: "Run 2", href: "/lease-renewal/runs/run-2" },
    ],
    emptyLabel: "Nothing needs your decision right now.",
    seeAllHref: "/approval-queue",
  },
];

const withQueueItemSingle: ConsoleDeckCard[] = [
  {
    key: "approvals",
    title: "Needs your decision",
    lane: "decision",
    count: 1,
    rows: [
      {
        label: "Approve renewal package",
        detail: "Run 1",
        href: "/approval-queue?item_id=q1",
        itemId: "q1",
      },
    ],
    emptyLabel: "Nothing needs your decision right now.",
    seeAllHref: "/approval-queue",
  },
];

describe("ConsoleActionDeck", () => {
  it("renders each area with the top rows as deep links, capped with a See-all link", () => {
    render(<ConsoleActionDeck cards={cards} />);

    expect(
      screen.getByRole("heading", { name: "Needs your decision" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Current rent" })).toHaveAttribute(
      "href",
      "/lease-renewal/runs/run-1",
    );
    // The preview caps at three rows; the fourth is reachable via "See all".
    expect(screen.queryByRole("link", { name: "Term" })).toBeNull();
    expect(screen.getByRole("link", { name: "See all 5" })).toHaveAttribute(
      "href",
      "/approval-queue",
    );
  });

  it("shows the empty label (an all-clear, not an empty list) when a count is zero", () => {
    render(<ConsoleActionDeck cards={cards} />);

    expect(screen.getByText("Every connector is set up.")).toBeInTheDocument();
  });

  // AC-S17-9: every deck row speaks the shared attention vocabulary — each rendered row carries a lane
  // from the closed ATTENTION_LANES enum (stamped from its card), so the deck matches the hub + desk.
  it("stamps every rendered row with a lane from the closed ATTENTION_LANES enum", () => {
    const { container } = render(<ConsoleActionDeck cards={cards} />);
    const rows = container.querySelectorAll(".console-deck-list li");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(ATTENTION_LANES).toContain(row.getAttribute("data-lane"));
    }
    // The approvals card + all its rows carry the "decision" lane.
    const approvalsCard = container.querySelector(
      '.console-deck-card[data-lane="decision"]',
    );
    expect(approvalsCard).not.toBeNull();
  });

  it("renders an in-place Approve ONLY for a queue_item row (itemId) when the user can approve", () => {
    render(<ConsoleActionDeck canApprove cards={withQueueItem} />);

    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Current rent" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send|execute|write/i })).toBeNull();
  });

  it("shows NO Approve control when the user cannot approve, even for a queue_item row", () => {
    render(<ConsoleActionDeck canApprove={false} cards={withQueueItemSingle} />);

    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

describe("ConsoleProcessStrip", () => {
  const items: ConsoleProcessItem[] = [
    {
      id: "lease-renewals",
      name: "Lease Renewals",
      category: "Renewals",
      stateLabel: "Process ready",
      status: "connected",
      href: "/lease-renewal",
    },
  ];

  it("renders each process with its state and a deep link", () => {
    render(<ConsoleProcessStrip items={items} />);

    expect(screen.getByRole("link", { name: /Lease Renewals/ })).toHaveAttribute(
      "href",
      "/lease-renewal",
    );
    expect(screen.getByText("Process ready")).toBeInTheDocument();
  });

  it("renders nothing when there are no processes", () => {
    const { container } = render(<ConsoleProcessStrip items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
