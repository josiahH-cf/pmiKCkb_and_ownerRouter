// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The Console front door (rendered at both `/` and `/ask`). Mock the Firestore-backed process list
// and the needs-decision gather (the action-deck approvals count) so the async server component
// renders without touching firebase-admin.
vi.mock("@/lib/firestore/workflows", () => ({
  listProcessDefinitions: vi.fn(async () => [
    { id: "lease-renewal", name: "Lease Renewal", status: "Draft" },
  ]),
}));
vi.mock("@/lib/approval/needs-decision-gather", () => ({
  gatherNeedsDecisionInbox: vi.fn(async () => ({
    rows: [
      {
        kind: "renewal_flag",
        key: "renewal_flag:run-1:current_rent",
        label: "Current rent",
        detail: "Run 1",
        severity: "High",
        href: "/lease-renewal/runs/run-1",
      },
      {
        kind: "queue_item",
        key: "queue_item:q1",
        itemId: "q1",
        canApproveInline: true,
        label: "Approve renewal package",
        detail: "Run 1",
        severity: "Medium",
        href: "/approval-queue?item_id=q1",
      },
    ],
    counts: { total: 2, renewalFlags: 1, writebacksAwaiting: 0, queueItems: 1 },
  })),
}));

import { ConsoleView } from "@/components/console/ConsoleView";
import { gatherNeedsDecisionInbox } from "@/lib/approval/needs-decision-gather";
import { listProcessDefinitions } from "@/lib/firestore/workflows";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const adminUser = { uid: "u-admin", role: "Admin", email: "admin@pmikcmetro.com" };
const maintenanceUser = {
  uid: "u-maintenance",
  role: "Editor",
  email: "maintenance@pmikcmetro.com",
  scopes: ["maintenance"],
} as const;

describe("ConsoleView", () => {
  it("renders the Console front door with the grounded-answer form", async () => {
    render(await ConsoleView({ user: adminUser as never }));

    expect(
      screen.getByRole("heading", { name: "Console", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Question")).toBeInTheDocument();
    expect(screen.getByTestId("console-test-data-badge")).toHaveTextContent("Test data");
    // A renewals-visible principal sees the read-only anticipation lane (S18).
    expect(screen.getByRole("heading", { name: "Anticipated work" })).toBeInTheDocument();
  });

  it("surfaces the needs-your-decision area with the top row as a deep link (no click-to-reveal)", async () => {
    render(await ConsoleView({ user: adminUser as never }));

    expect(
      screen.getByRole("heading", { name: "Needs your decision" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Current rent" })).toHaveAttribute(
      "href",
      "/lease-renewal/runs/run-1",
    );
    // The old click-to-reveal command button is gone; the deck is always visible.
    expect(screen.queryByRole("button", { name: /My approvals/ })).toBeNull();
    // A4: an Admin (canApprove) gets an in-place Approve on the queue_item row.
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    // HARD STOP: no control ever executes an external action from the Console.
    expect(screen.queryByRole("button", { name: /send|execute|write/i })).toBeNull();
  });

  it("shows the live processes as a read-only front door", async () => {
    render(await ConsoleView({ user: adminUser as never }));

    expect(screen.getByRole("heading", { name: "Processes" })).toBeInTheDocument();
  });

  it("loads process definitions once for an editor so the process picker is populated", async () => {
    render(await ConsoleView({ user: adminUser as never }));

    expect(listProcessDefinitions).toHaveBeenCalledTimes(1);
    // Editors get the process picker (canStartSimulation), populated from the loaded definitions.
    expect(screen.getByLabelText("Process")).toHaveTextContent("Lease Renewal");
  });

  it("removes renewals rows and process chips for a maintenance-only principal", async () => {
    render(await ConsoleView({ user: maintenanceUser as never }));

    expect(screen.queryByRole("link", { name: "Current rent" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Approve renewal package" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Lease Renewals/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Google Sheets" })).toBeNull();
    expect(screen.getByRole("link", { name: "Google Drive" })).toHaveAttribute(
      "href",
      "/connections#connector-google_drive",
    );
    expect(
      screen
        .getAllByRole("link", { name: /Maintenance Work Order Intake/ })
        .every((link) => link.getAttribute("href") === "/maintenance"),
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(gatherNeedsDecisionInbox).not.toHaveBeenCalled();
    // The renewal anticipation lane is renewals-scoped: a maintenance-only principal never sees it
    // (removing the canSeeRenewals gate in ConsoleView would leak renewal work here and fail this).
    expect(screen.queryByRole("heading", { name: "Anticipated work" })).toBeNull();
  });
});
