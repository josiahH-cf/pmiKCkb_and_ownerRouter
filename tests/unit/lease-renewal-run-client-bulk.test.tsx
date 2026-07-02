// @vitest-environment jsdom

// S13 B2 — bulk approve/return lives ONLY on the run page (where values are visible), is Admin-only,
// shares ONE mandatory reason across the selection, and reports per-item results. The value-free
// queue surfaces keep zero approve affordances (their own sentinel tests assert that).

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LeaseRenewalRunClient } from "@/components/lease-renewal/LeaseRenewalRunClient";
import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  refresh.mockClear();
});

function queuedFlag(key: string, fieldLabel: string): RenewalFlagView {
  return {
    sourceTriggerKey: key,
    fieldKey: key,
    fieldLabel,
    severity: "High",
    agreement: "conflict",
    actionNeeded: "Pick the correct value.",
    directLink: `/lease-renewal/runs/run-1`,
    suggestedWinner: null,
    candidates: [],
    resolution: null,
    writeback: null,
    writebackApproval: { queued: true, state: "Awaiting Approval", stale: false },
  };
}

function plainFlag(key: string, fieldLabel: string): RenewalFlagView {
  return { ...queuedFlag(key, fieldLabel), writebackApproval: null };
}

function viewWith(flags: RenewalFlagView[]): RenewalRunView {
  return {
    runId: "run-1",
    label: "Run 1",
    manifest: {
      tabsRecognized: 1,
      tabsUnrecognized: 0,
      credentialTabsExcluded: 0,
      credentialScrubHits: 0,
      dividerRowsDropped: 0,
      totalRecords: 5,
    },
    excludedTabs: [],
    groups: [{ severity: "High", flags }],
    totalFlags: flags.length,
    resolvedCount: 0,
  };
}

const twoQueued = viewWith([
  queuedFlag("k-rent", "Current rent"),
  queuedFlag("k-date", "Renewal date"),
  plainFlag("k-note", "Notes"),
]);

function renderClient(view: RenewalRunView, isAdmin = true) {
  return render(
    <LeaseRenewalRunClient
      canResolve={false}
      isAdmin={isAdmin}
      resolutionsError={false}
      view={view}
    />,
  );
}

describe("run-page bulk write-back decisions", () => {
  it("offers the bulk bar + one checkbox per QUEUED proposal to an Admin", () => {
    renderClient(twoQueued);

    expect(
      screen.getByRole("heading", { name: "Decide several write-backs at once" }),
    ).toBeInTheDocument();
    // Only the two queued flags are selectable; the plain flag gets no checkbox.
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByText(/0 of 2 queued write-backs selected/)).toBeInTheDocument();
  });

  it("stays hidden for non-Admins (no checkbox, no bulk affordance)", () => {
    renderClient(twoQueued, false);

    expect(
      screen.queryByRole("heading", { name: "Decide several write-backs at once" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("stays hidden when fewer than two proposals are queued", () => {
    renderClient(viewWith([queuedFlag("k-rent", "Current rent")]));

    expect(
      screen.queryByRole("heading", { name: "Decide several write-backs at once" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("requires a selection and a shared reason before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderClient(twoQueued);

    fireEvent.click(screen.getByRole("button", { name: "Approve selected" }));
    expect(
      await screen.findByText("Tick at least one queued write-back below."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select all queued" }));
    expect(screen.getByText(/2 of 2 queued write-backs selected/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve selected" }));
    expect(
      await screen.findByText(
        "A plain-English reason is required. It is saved on every selected item.",
      ),
    ).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits the selection with ONE shared reason and reports per-item results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { source_trigger_key: "k-rent", ok: true, state: "Approved" },
          {
            source_trigger_key: "k-date",
            ok: false,
            error: 'Cannot approve a write-back proposal that is "Approved".',
          },
        ],
        decided_count: 1,
        failed_count: 1,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderClient(twoQueued);

    fireEvent.click(screen.getByRole("button", { name: "Select all queued" }));
    fireEvent.change(
      screen.getByLabelText("Reason (required, saved on every selected item)"),
      { target: { value: "Checked both against RentVine." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve selected" }));

    expect(await screen.findByText(/Approved \(nothing written\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/Cannot approve a write-back proposal that is "Approved"\./),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/lease-renewal/writeback-approvals/bulk");
    expect(JSON.parse(String(request.body))).toEqual({
      run_id: "run-1",
      source_trigger_keys: ["k-rent", "k-date"],
      decision: "approve",
      reason: "Checked both against RentVine.",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
