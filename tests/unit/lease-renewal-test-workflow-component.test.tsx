// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LeaseTestJourney } from "@/components/lease-renewal/LeaseTestJourney";
import { LeaseTestRunsWorkspace } from "@/components/lease-renewal/LeaseTestRunsWorkspace";
import {
  LEASE_TEST_ACTIONS,
  LEASE_TEST_ALIASES,
  LEASE_TEST_BUSINESS_CONFIRMATION,
  LEASE_TEST_CONFIRMATION,
  buildLeaseTestActionEvidence,
  type LeaseTestRunRecord,
} from "@/lib/lease-renewal/test-workflow";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function run(
  status: LeaseTestRunRecord["status"] = "Created",
  businessReady = false,
): LeaseTestRunRecord {
  const record: LeaseTestRunRecord = {
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
  if (status === "Executing" || status === "Done") {
    Object.assign(record, {
      candidate_disposition: "included",
      candidate_cadence: "two_month_window",
      candidate_off_cycle: false,
      candidate_worklog_reason: "canonical_standard_window_test_fixture",
      owner_direction: "renew",
      owner_terms_key: "canonical-test-renewal-terms-v1",
      tenant_offer_timing: "by_fifteenth",
      signature_window_days: 30,
      conditional_facts_key: "canonical-test-conditional-facts-v1",
      ...(businessReady
        ? {
            tenant_response: "accepted",
            signatures_state: "simulated_complete",
            business_test_status: "test_complete",
          }
        : {}),
    });
  }
  return record;
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
        initialRun={run("Executing", true)}
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
        initialRun={run("Done", true)}
      />,
    );
    expect(screen.getAllByText("App Test complete").length).toBeGreaterThan(0);
    expect(screen.getByText(/every internal simulation is recorded/)).toBeVisible();
    expect(screen.getAllByText(/business proof not established/).length).toBe(6);
  });

  it("records the exact candidate milestone before review", async () => {
    const nextRun = {
      ...run("Created"),
      candidate_disposition: "included" as const,
      candidate_cadence: "two_month_window" as const,
      candidate_off_cycle: false as const,
      candidate_worklog_reason: "canonical_standard_window_test_fixture" as const,
    };
    const event = {
      id: "business-event-1",
      run_id: nextRun.id,
      data_mode: "test" as const,
      action: "candidate_included" as const,
      outcome: "included_standard_window" as const,
      actor_uid: "editor-1",
      provider_contacted: false as const,
      live_proof_eligible: false as const,
      created_at: "2026-07-15T12:01:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ run: nextRun, event, duplicate: false }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <LeaseTestJourney
        initialAttempts={[]}
        initialReceipts={[]}
        initialRun={run("Created")}
      />,
    );

    expect(screen.getByText(/2027-07-31 review for 2027-09-30/)).toBeVisible();
    fireEvent.click(
      screen.getByLabelText(
        "I confirm this exact app-only Test milestone and consequence.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Record Test milestone" }));

    expect(
      await screen.findByRole("list", { name: "Lease Test business event history" }),
    ).toHaveTextContent("included_standard_window");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lease-renewal/test-runs/test-renewal-1/business-events",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "candidate_included",
          confirmation: LEASE_TEST_BUSINESS_CONFIRMATION,
        }),
      }),
    );
  });
});
