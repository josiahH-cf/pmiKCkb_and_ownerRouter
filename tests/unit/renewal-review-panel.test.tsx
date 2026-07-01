// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApprovalQueue } from "@/components/approval/ApprovalQueue";
import { RenewalReviewPanel } from "@/components/approval/RenewalReviewPanel";
import type { RenewalReviewBoard } from "@/lib/approval/renewal-review";

afterEach(() => cleanup());

const board: RenewalReviewBoard = {
  runs: [
    {
      runId: "sim-renewal-001",
      label: "Sample renewal run",
      href: "/lease-renewal/runs/sim-renewal-001",
      flags: [
        {
          fieldKey: "current_rent",
          fieldLabel: "Current rent",
          severity: "High",
          agreement: "conflict",
          actionNeeded: "Reconcile current rent across 2 sources.",
          resolved: false,
          proposalReady: true,
          href: "/lease-renewal/runs/sim-renewal-001",
        },
      ],
      totalFlags: 1,
      openFlags: 1,
      highSeverityOpen: 1,
      blockedOpen: 0,
      proposalsAwaitingApproval: 0,
      proposalsApproved: 0,
    },
  ],
  totalRuns: 1,
  totalFlags: 1,
  totalOpenFlags: 1,
};

describe("RenewalReviewPanel", () => {
  it("renders each run with its flags and a deep link to the resolve surface", () => {
    render(<RenewalReviewPanel board={board} />);

    expect(screen.getByText("Sample renewal run")).toBeInTheDocument();
    expect(screen.getByText("Current rent")).toBeInTheDocument();
    // The value-free "Proposal ready" badge surfaces that an append-only proposal has a value.
    expect(screen.getByText("Proposal ready")).toBeInTheDocument();
    const reviewLink = screen.getByRole("link", { name: /Review & resolve/ });
    expect(reviewLink).toHaveAttribute("href", "/lease-renewal/runs/sim-renewal-001");
  });

  it("shows an empty state when there is nothing to review", () => {
    render(<RenewalReviewPanel />);
    expect(screen.getByText(/No renewals are awaiting review/)).toBeInTheDocument();
  });

  it("surfaces value-free write-back approval counts without leaking values", () => {
    const withApprovals: RenewalReviewBoard = {
      ...board,
      runs: [
        {
          ...board.runs[0],
          proposalsAwaitingApproval: 2,
          proposalsApproved: 1,
        },
      ],
    };

    render(<RenewalReviewPanel board={withApprovals} />);

    expect(
      screen.getByText(/2 write-back proposals awaiting your approval/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 approved \(ready to write, not executed\)/),
    ).toBeInTheDocument();
    // Per-run rollup also shows the counts.
    expect(screen.getByText(/2 awaiting approval/)).toBeInTheDocument();
  });
});

describe("ApprovalQueue renewal sub-tab", () => {
  const baseProps = {
    currentUser: { role: "Admin" as const, uid: "u-admin" },
    initialActivity: [],
    initialItems: [],
    renewalBoard: board,
  };

  it("defaults to the All items view and offers a Renewals tab with the open count", () => {
    render(<ApprovalQueue {...baseProps} />);

    expect(screen.getByRole("tab", { name: "All items" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Renewals (1)" })).toBeInTheDocument();
    // The renewal board is not rendered until its tab is selected.
    expect(screen.queryByText("Sample renewal run")).not.toBeInTheDocument();
  });

  it("shows the renewal review board after switching to the Renewals tab", () => {
    render(<ApprovalQueue {...baseProps} />);

    fireEvent.click(screen.getByRole("tab", { name: "Renewals (1)" }));

    expect(screen.getByRole("tab", { name: "Renewals (1)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Sample renewal run")).toBeInTheDocument();
    expect(screen.getByText("Current rent")).toBeInTheDocument();
  });
});
