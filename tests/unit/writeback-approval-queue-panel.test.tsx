// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("collapses decided groups to counts-only by default, keeping awaiting-approval open (B4)", () => {
    const { container } = render(<WritebackQueuePanel queue={queue} />);

    // The Approved group renders as a closed <details>: the count is the summary; the rows wait
    // behind it. Awaiting approval is NOT collapsible — it is the work.
    const collapsed = container.querySelectorAll("details.ui-collapse");
    expect(collapsed).toHaveLength(1); // Approved has rows; Returned is empty (plain "None.").
    expect(collapsed[0]).not.toHaveAttribute("open");
    expect(collapsed[0]).toHaveTextContent(
      "Approved — ready to write (not executed) (1)",
    );
    expect(collapsed[0]).toHaveTextContent("Already decided. Open to view.");
    expect(collapsed[0]).toHaveTextContent("Renewal date");

    // The awaiting-approval rows stay outside any <details>.
    const awaitingLink = screen.getByRole("link", { name: /Current rent/ });
    expect(awaitingLink.closest("details")).toBeNull();
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

  it("offers a Write-back proposals tab with the awaiting-approval count behind Other views", async () => {
    const user = userEvent.setup();
    render(<ApprovalQueue {...baseProps} />);

    await user.click(screen.getByText("Other views"));
    const tab = screen.getByRole("tab", { name: "Write-back proposals (2)" });
    expect(tab).toHaveAttribute("aria-selected", "false");
    // Not rendered until its tab is selected.
    expect(
      screen.queryByRole("heading", { name: /Awaiting approval \(2\)/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the queue after switching to the Write-back proposals tab", async () => {
    const user = userEvent.setup();
    render(<ApprovalQueue {...baseProps} />);

    await user.click(screen.getByText("Other views"));
    await user.click(screen.getByRole("tab", { name: "Write-back proposals (2)" }));

    expect(screen.getByRole("tab", { name: "Write-back proposals (2)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Unique to the write-back panel; the inbox surfaces rows but not these state headings.
    expect(
      screen.getByRole("heading", { name: /Awaiting approval \(2\)/ }),
    ).toBeInTheDocument();
  });
});
