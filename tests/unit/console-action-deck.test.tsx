// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
    count: 0,
    rows: [],
    emptyLabel: "Every connector is set up.",
    seeAllHref: "/connections",
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
