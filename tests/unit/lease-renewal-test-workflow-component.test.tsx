// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LeaseTestJourney } from "@/components/lease-renewal/LeaseTestJourney";
import { LeaseTestRunsWorkspace } from "@/components/lease-renewal/LeaseTestRunsWorkspace";
import {
  LEASE_TEST_ACTIONS,
  LEASE_TEST_ALIASES,
  LEASE_TEST_CONFIRMATION,
  buildLeaseTestActionEvidence,
  type LeaseTestRunRecord,
} from "@/lib/lease-renewal/test-workflow";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function run(status: LeaseTestRunRecord["status"] = "Created"): LeaseTestRunRecord {
  return {
    id: "test-renewal-1",
    data_mode: "test",
    scenario: "standard-renewal",
    status,
    labels: ["TEST DATA"],
    lease_ref: LEASE_TEST_ALIASES.leaseRef,
    property_label: LEASE_TEST_ALIASES.propertyLabel,
    resident_label: LEASE_TEST_ALIASES.residentLabel,
    resident_email: LEASE_TEST_ALIASES.residentEmail,
    action_total: LEASE_TEST_ACTIONS.length,
    created_by_uid: "editor-1",
    updated_by_uid: "editor-1",
    created_at: "2026-07-15T12:00:00.000Z",
    updated_at: "2026-07-15T12:00:00.000Z",
  };
}

describe("Lease production Test UI", () => {
  it("creates a persistent invented Test run from the normal runs page", async () => {
    const created = run();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ run: created }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LeaseTestRunsWorkspace initialRuns={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Create Test renewal" }));

    expect(await screen.findByText(LEASE_TEST_ALIASES.propertyLabel)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith("/api/lease-renewal/test-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario: "standard-renewal" }),
    });
    expect(screen.getByText(/No Live record or provider was touched/)).toBeVisible();
  });

  it("shows an exact Test action/target and records bodyless evidence only after confirmation", async () => {
    const evidence = buildLeaseTestActionEvidence({
      receiptId: "receipt-1",
      attemptId: "attempt-1",
      runId: "test-renewal-1",
      actionKey: LEASE_TEST_ACTIONS[0],
      actorUid: "editor-1",
      createdAt: "2026-07-15T12:05:00.000Z",
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => evidence,
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <LeaseTestJourney
        initialAttempts={[]}
        initialReceipts={[]}
        initialRun={run("Executing")}
      />,
    );

    expect(screen.getByText(LEASE_TEST_ACTIONS[0], { selector: "strong" })).toBeVisible();
    expect(screen.getByText(/TEST unsent draft adapter/)).toBeVisible();
    expect(screen.getByText(/Provider contacted: No/)).toBeVisible();
    const actionButton = screen.getByRole("button", { name: "Run Test action" });
    expect(actionButton).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText("I confirm this exact Test action and target."),
    );
    expect(actionButton).toBeEnabled();
    fireEvent.click(actionButton);

    expect(
      await screen.findByText(/Bodyless Test attempt and receipt recorded/),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lease-renewal/test-runs/test-renewal-1/test-actions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          actionKey: LEASE_TEST_ACTIONS[0],
          confirmation: LEASE_TEST_CONFIRMATION,
        }),
      }),
    );
    expect(screen.queryByText("Linked Gmail communication")).toBeNull();
  });

  it("separates App Test completion from business closeout evidence", () => {
    const allEvidence = LEASE_TEST_ACTIONS.map((actionKey, index) =>
      buildLeaseTestActionEvidence({
        receiptId: `receipt-${index}`,
        attemptId: `attempt-${index}`,
        runId: "test-renewal-1",
        actionKey,
        actorUid: "editor-1",
        createdAt: `2026-07-15T12:${String(index).padStart(2, "0")}:00.000Z`,
      }),
    );
    const rendered = render(
      <LeaseTestJourney
        initialAttempts={[]}
        initialReceipts={[]}
        initialRun={run("Executing")}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Move to App Test complete" }),
    ).toBeDisabled();
    expect(screen.getByText(/App Test completion unlocks after all 11/)).toBeVisible();

    rendered.unmount();
    render(
      <LeaseTestJourney
        initialAttempts={allEvidence.map((entry) => entry.attempt)}
        initialReceipts={allEvidence.map((entry) => entry.receipt)}
        initialRun={run("Executing")}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Move to App Test complete" }),
    ).toBeEnabled();
    expect(screen.getByText(/11 of 11 Test actions complete/)).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Business closeout evidence gates" }),
    ).toHaveTextContent("Business closeout: Not proven");

    cleanup();
    render(
      <LeaseTestJourney
        initialAttempts={allEvidence.map((entry) => entry.attempt)}
        initialReceipts={allEvidence.map((entry) => entry.receipt)}
        initialRun={run("Done")}
      />,
    );
    expect(screen.getAllByText("App Test complete").length).toBeGreaterThan(0);
    expect(screen.getByText(/every internal simulation is recorded/)).toBeVisible();
    expect(screen.getAllByText(/business proof not established/).length).toBe(6);
  });
});
