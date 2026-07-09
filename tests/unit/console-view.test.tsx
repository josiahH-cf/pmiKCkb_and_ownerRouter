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
import { listProcessDefinitions } from "@/lib/firestore/workflows";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const adminUser = { uid: "u-admin", role: "Admin", email: "admin@pmikcmetro.com" };

describe("ConsoleView", () => {
  it("renders the Console front door with the grounded-answer form", async () => {
    render(await ConsoleView({ user: adminUser as never }));

    expect(
      screen.getByRole("heading", { name: "Console", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Question")).toBeInTheDocument();
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
});
