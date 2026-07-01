// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ApprovalQueue } from "@/components/approval/ApprovalQueue";
import { WritebackQueuePanel } from "@/components/approval/WritebackQueuePanel";
import type { WritebackApprovalQueue } from "@/lib/approval/writeback-approval-queue";

afterEach(() => cleanup());

const queue: WritebackApprovalQueue = {
  counts: { awaitingApproval: 2, approved: 1, returned: 0, total: 3 },
  groups: [
    {
      state: "Awaiting Approval",
      rows: [
        {
          fieldKey: "current_rent",
          fieldLabel: "Current rent",
          severity: "High",
          runId: "run-a",
          runLabel: "Run A",
          state: "Awaiting Approval",
          href: "/lease-renewal/runs/run-a",
        },
        {
          fieldKey: "lease_start",
          fieldLabel: "Lease start",
          severity: "Medium",
          runId: "run-b",
          runLabel: "Run B",
          state: "Awaiting Approval",
          href: "/lease-renewal/runs/run-b",
        },
      ],
    },
    {
      state: "Approved",
      rows: [
        {
          fieldKey: "renewal_date",
          fieldLabel: "Renewal date",
          severity: "High",
          runId: "run-a",
          runLabel: "Run A",
          state: "Approved",
          href: "/lease-renewal/runs/run-a",
        },
      ],
    },
    { state: "Returned for Revision", rows: [] },
  ],
};

describe("WritebackQueuePanel", () => {
  it("groups queued proposals by state, with counts and run-page deep links", () => {
    render(<WritebackQueuePanel queue={queue} />);

    expect(
      screen.getByText(/3 queued write-back proposals across all runs/),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 awaiting approval/)).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: /Awaiting approval \(2\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Approved — ready to write \(not executed\) \(1\)/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Returned \(0\)/ })).toBeInTheDocument();

    // A row deep-links to its run page (where the value + approve/return control live).
    const link = screen.getByRole("link", { name: /Current rent/ });
    expect(link).toHaveAttribute("href", "/lease-renewal/runs/run-a");
    expect(screen.getByText("Lease start")).toBeInTheDocument();
    expect(screen.getByText("Renewal date")).toBeInTheDocument();

    // Read/triage only — no approve/return affordance on this surface.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing is queued", () => {
    render(<WritebackQueuePanel />);
    expect(
      screen.getByText(/No write-back proposals are queued right now/),
    ).toBeInTheDocument();
  });
});

describe("ApprovalQueue write-back queue tab", () => {
  const baseProps = {
    currentUser: { role: "Admin" as const, uid: "u-admin" },
    initialActivity: [],
    initialItems: [],
    writebackQueue: queue,
  };

  it("offers a Write-back queue tab with the awaiting-approval count", () => {
    render(<ApprovalQueue {...baseProps} />);

    const tab = screen.getByRole("tab", { name: "Write-back queue (2)" });
    expect(tab).toHaveAttribute("aria-selected", "false");
    // Not rendered until its tab is selected.
    expect(
      screen.queryByRole("heading", { name: /Awaiting approval \(2\)/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the queue after switching to the Write-back queue tab", () => {
    render(<ApprovalQueue {...baseProps} />);

    fireEvent.click(screen.getByRole("tab", { name: "Write-back queue (2)" }));

    expect(screen.getByRole("tab", { name: "Write-back queue (2)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Current rent")).toBeInTheDocument();
    expect(screen.getByText("Renewal date")).toBeInTheDocument();
  });
});
