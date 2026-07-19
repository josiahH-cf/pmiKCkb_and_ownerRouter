// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NeedsDecisionInboxPanel } from "@/components/approval/NeedsDecisionInboxPanel";
import type {
  NeedsDecisionInbox,
  NeedsDecisionRow,
} from "@/lib/approval/needs-decision-inbox";

afterEach(cleanup);

function inbox(overrides: Partial<NeedsDecisionInbox> = {}): NeedsDecisionInbox {
  return {
    counts: { total: 0, renewalFlags: 0, writebacksAwaiting: 0, queueItems: 0 },
    rows: [],
    ...overrides,
  };
}

const queueRow = (id: string, canApproveInline: boolean): NeedsDecisionRow => ({
  kind: "queue_item",
  key: `queue_item:${id}`,
  label: `Approve ${id}`,
  detail: "Run 1",
  severity: "Medium",
  href: `/approval-queue?item_id=${id}`,
  itemId: id,
  canApproveInline,
});

const flagRow = (runId: string): NeedsDecisionRow => ({
  kind: "renewal_flag",
  key: `renewal_flag:${runId}`,
  label: "Current rent",
  detail: "Run 1",
  severity: "High",
  href: `/lease-renewal/runs/${runId}`,
});

describe("NeedsDecisionInboxPanel — count reconciliation (AQ-9/AQ-10)", () => {
  it("splits the total into approvable-here vs open-elsewhere, dropping the aggregate metadata", () => {
    render(
      <NeedsDecisionInboxPanel
        inbox={inbox({
          counts: { total: 2, renewalFlags: 1, writebacksAwaiting: 0, queueItems: 1 },
          rows: [queueRow("q1", true), flagRow("run-1")],
        })}
      />,
    );

    expect(screen.getByText(/2 things need your decision/)).toBeInTheDocument();
    expect(screen.getByText(/1 can be approved right here/)).toBeInTheDocument();
    expect(screen.getByText(/the rest open on their own pages/)).toBeInTheDocument();
    // The old aggregate flag/write-back metadata line is gone.
    expect(
      screen.queryByText(/Safe queue approvals can be recorded here/),
    ).not.toBeInTheDocument();
  });

  it("says all are approvable here when nothing is deep-link-only", () => {
    render(
      <NeedsDecisionInboxPanel
        inbox={inbox({
          counts: { total: 2, renewalFlags: 0, writebacksAwaiting: 0, queueItems: 2 },
          rows: [queueRow("q1", true), queueRow("q2", true)],
        })}
      />,
    );

    expect(screen.getByText(/You can approve them right here/)).toBeInTheDocument();
  });

  it("tells the user to open each page when none are approvable inline", () => {
    render(
      <NeedsDecisionInboxPanel
        inbox={inbox({
          counts: { total: 2, renewalFlags: 1, writebacksAwaiting: 1, queueItems: 0 },
          rows: [
            flagRow("run-1"),
            {
              kind: "writeback",
              key: "writeback:1",
              label: "Rent write-back",
              detail: "Run 1 · awaiting write-back approval",
              severity: "Medium",
              href: "/lease-renewal/runs/run-1",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText(/Open each on its own page to decide/)).toBeInTheDocument();
  });

  it("renders the empty state when nothing needs a decision", () => {
    render(<NeedsDecisionInboxPanel inbox={inbox()} />);
    expect(
      screen.getByText("Nothing needs your decision right now."),
    ).toBeInTheDocument();
  });
});
