// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QueueBulkPanel } from "@/components/approval/ApprovalQueueBulkPanel";
import {
  CONNECTORS,
  allowsAppManagedConnection,
} from "@/lib/connections/connector-catalog";
import {
  buildConnectionView,
  connectionNextStep,
} from "@/lib/connections/connection-status";

// S283 R-S283-6, ARCH-S283-6, BEH-S283-7 and AC-S283-7: Connections shows QuickBooks with the
// state "Not connected. This app has no QuickBooks sign-in." and no Connect action, and the
// Approval Queue's bulk actions no longer offer Execute. Neither control is hidden by style: it is
// not in the catalog or the option list. Every other connector action and bulk action stays.

afterEach(cleanup);

describe("ARCH-S283-6 the QuickBooks card carries no connect action in the catalog", () => {
  it("ARCH-S283-6 QuickBooks has no Connect action, its state says why, and the others keep theirs", () => {
    const quickbooks = CONNECTORS.find((connector) => connector.id === "quickbooks")!;
    expect(quickbooks.connectAction).toBe("none");
    expect(allowsAppManagedConnection(quickbooks)).toBe(false);
    for (const connector of CONNECTORS.filter((entry) => entry.id !== "quickbooks"))
      expect(connector.connectAction, connector.id).toBeUndefined();

    const view = buildConnectionView({});
    const status = view.items.find((item) => item.def.id === "quickbooks")!.status;
    expect(`${status.label}. ${status.detail}`).toBe(
      "Not connected. This app has no QuickBooks sign-in.",
    );
    expect(connectionNextStep(status, true)).toBe(
      "No connection step is available in this app.",
    );
    expect(connectionNextStep(status, true)).not.toMatch(
      /Complete the server-side setup/,
    );
  });
});

describe("ARCH-S283-6 the bulk action list has no Execute option", () => {
  it("BEH-S283-7 the bulk action list offers Approve, Return for Revision, Assign, Snooze and Disable Action only", () => {
    const noop = vi.fn();
    render(
      <QueueBulkPanel
        allVisibleSelected={false}
        bulkAction="approve"
        bulkAssigneeUid=""
        bulkPreview={{
          highRiskApprovals: 0,
          linkedHighRiskApprovals: 0,
          knownSkipped: 0,
          ready: 0,
        }}
        bulkReason=""
        bulkRequiredApproverUid=""
        bulkResult={null}
        bulkSnoozeUntil=""
        busyAction={null}
        onClearSelection={noop}
        onSubmitBulkAction={noop}
        onToggleAllVisible={noop}
        selectedBulkItems={[]}
        setBulkAction={noop}
        setBulkAssigneeUid={noop}
        setBulkReason={noop}
        setBulkRequiredApproverUid={noop}
        setBulkSnoozeUntil={noop}
      />,
    );
    const action = screen.getByRole("combobox", { name: "Action" }) as HTMLSelectElement;
    expect([...action.options].map((option) => option.value)).toEqual([
      "approve",
      "return",
      "assign",
      "snooze",
      "disable",
    ]);
    expect(screen.queryByText(/Execute/)).toBeNull();
  });

  it("ARCH-S283-6 the bulk mode type and panel source name no execute option", () => {
    for (const file of [
      "components/approval/ApprovalQueueBulkPanel.tsx",
      "components/approval/ApprovalQueueModel.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/value="execute"|"execute"/);
    }
  });
});
