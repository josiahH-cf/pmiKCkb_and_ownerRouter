// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  QueueListPanel,
  RETIRED_QUEUE_NOTE,
} from "@/components/approval/ApprovalQueueListPanel";
import type { ApprovalQueueItemRecord } from "@/lib/firestore/types";

function queueItem(
  overrides: Partial<ApprovalQueueItemRecord> = {},
): ApprovalQueueItemRecord {
  const id = overrides.id ?? "item-current";
  return {
    action_needed: `Approve ${id}`,
    assignee_uid: "editor-1",
    audience_group: "Dan/Admin decisions",
    created_at: "2026-06-05T00:00:00.000Z",
    direct_link: "/runs/run-1",
    id,
    item_type: "ApprovalPackage",
    process_run_ref: { id: "run-1", label: "Lease Renewal - 123 Main" },
    required_approver_uid: "admin-1",
    risk: "High",
    source_trigger_key: `trigger-${id}`,
    status: "Ready for Approval",
    updated_at: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("S227 Approval Queue rows for retired work", () => {
  afterEach(cleanup);

  it("marks a retained maintenance item as retired history and leaves current items untouched", () => {
    render(
      <QueueListPanel
        items={[
          queueItem(),
          queueItem({
            id: "item-retired",
            action_needed: "Approve rentvine.work_order.create",
            process_run_ref: {
              id: "maintenance:01a0-retired",
              label: "S99 proof create",
            },
          }),
        ]}
        onSelectItem={vi.fn()}
        onToggleBulkItem={vi.fn()}
        selectedBulkIds={new Set()}
        selectedItemId={null}
      />,
    );
    const rows = screen.getAllByRole("button", { name: /Approve/ });
    expect(rows).toHaveLength(2);
    const [current, retired] = rows;
    expect(within(current).queryByText(RETIRED_QUEUE_NOTE)).not.toBeInTheDocument();
    expect(within(current).getByText("Ready for Approval")).toBeInTheDocument();
    expect(within(retired).getByText(RETIRED_QUEUE_NOTE)).toBeInTheDocument();
    expect(within(retired).getByText("Retired")).toBeInTheDocument();
    expect(within(retired).queryByText("Ready for Approval")).not.toBeInTheDocument();
  });

  it("keeps the recorded status of ordinarily closed or superseded decisions", () => {
    render(
      <QueueListPanel
        items={[
          queueItem({
            id: "item-approved",
            status: "Approved",
            closed_at: "2026-06-06T00:00:00.000Z",
          }),
          queueItem({
            id: "item-superseded",
            status: "Denied",
            superseded_by_item_id: "item-later",
          }),
        ]}
        onSelectItem={vi.fn()}
        onToggleBulkItem={vi.fn()}
        selectedBulkIds={new Set()}
        selectedItemId={null}
      />,
    );
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Denied")).toBeInTheDocument();
    expect(screen.queryByText("Retired")).not.toBeInTheDocument();
    expect(screen.queryByText(RETIRED_QUEUE_NOTE)).not.toBeInTheDocument();
  });
});
