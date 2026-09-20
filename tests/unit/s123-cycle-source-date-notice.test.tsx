// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { RenewalDeskTable } from "@/components/lease-renewal/RenewalDeskTable";
import { RenewalManualProvider } from "@/components/lease-renewal/RenewalManualWorkspace";
import { projectCycleSourceDateChange } from "@/lib/lease-renewal/cycle-source-date";
import type {
  DeskLeaseGuidance,
  DeskLeaseRow,
  DeskLeaseSummaryBase,
} from "@/lib/lease-renewal/desk-model";
import { withRenewalDeskQueryKeys } from "@/lib/lease-renewal/desk-query";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  OVERALL_STATUS_URGENCY_RANK,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  emptyRenewalWorkspace,
  manualRenewalSummary,
  planRenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";
import { fixedTermProjection } from "@/tests/helpers/lease-term-fixtures";

// S123 (F02, AC-S123-4): the workspace and the desk say when RentVine reports a different lease
// end than the recorded cycle, keep the recorded basis and terms visible as history, and stay
// silent when nothing changed. Rendering issues no request and records nothing.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CYCLE = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const recordedBasis = {
  kind: "lease_end" as const,
  dateIso: "2026-08-31",
  source: "RentVine lease end",
};
const initial = () => emptyRenewalWorkspace("701", CYCLE, recordedBasis);
const withTerms = () =>
  planRenewalWorkspaceAction(
    initial(),
    {
      kind: "owner_response",
      outcome: "approved_terms",
      terms: { rent: 1250, effectiveDate: "2026-09-01", endDate: "2027-08-31" },
      source: "Owner call",
    },
    { actorUid: "operator", recordedAt: "2026-09-10T12:00:00.000Z", eventId: "approval" },
  );

function guidance(): DeskLeaseGuidance {
  return {
    currentBaseRent: 1500,
    currentBaseRentSource: "RentVine",
    rentVerification: {
      state: "verified",
      verifiedByResolutionDiffers: false,
      destination: { kind: "workspace_phase", stepId: "verify-renewal" },
    },
    overallStatus: "ready",
    urgencyRank: OVERALL_STATUS_URGENCY_RANK.ready,
    isBlocked: false,
    blockers: [],
    action: {
      kind: "act",
      label: "Record the owner decision.",
      destination: { kind: "workspace_phase", stepId: "owner-decision" },
    },
  };
}

function row(id: string, overrides: Partial<DeskLeaseSummaryBase> = {}): DeskLeaseRow {
  const base: DeskLeaseSummaryBase = {
    id,
    addressLabel: `${id} Main St`,
    propertyNameLabel: "Maple Portfolio",
    tenantNameLabel: "Tenant Alpha",
    tenantNameLabels: ["Tenant Alpha"],
    ownerNameLabels: ["Owner Alpha"],
    identity: {
      address: { label: `${id} Main St`, sourceRef: `rentvine:lease:${id}:property` },
      property: {
        label: "Maple Portfolio",
        sourceRef: `rentvine:lease:${id}:property.name`,
      },
      tenants: [
        { label: "Tenant Alpha", sourceRef: `rentvine:lease:${id}:tenants[0].name` },
      ],
      owners: [
        {
          label: "Owner Alpha",
          sourceRef: `rentvine:lease:${id}:portfolio.owners[0].name`,
        },
      ],
    },
    endDateIso: "2027-08-31",
    disposition: "out_of_window",
    reason: "out_of_window",
    reasonLabel: "Outside the window",
    leaseTerm: fixedTermProjection("2027-08-31"),
    currentRent: 1500,
    unitListedRent: 1500,
    retention: {
      state: "tracked_incomplete",
      label: "Recorded renewal work or source updates retained outside the active window",
    },
    processVersion: "renewal-v1",
    workflowStepId: "owner-decision",
    stageIndex: 1,
    stageLabel: "Owner decision",
    nextAction: "Record the owner decision.",
    openConflicts: 0,
    manualProgress: manualRenewalSummary(withTerms()),
    ...overrides,
  };
  return {
    ...withRenewalDeskQueryKeys(base),
    processState: {
      status: "active",
      currentStepId: "owner-decision",
      currentStepState: "ready",
    },
    guidance: guidance(),
  };
}

describe("S123 workspace source-date notice (AC-S123-4)", () => {
  it("flags a changed provider date beside the immutable recorded basis and the recorded terms", () => {
    render(
      <RenewalManualProvider
        leaseId="701"
        initialState={withTerms()}
        cycleBasis={{
          kind: "lease_end",
          dateIso: "2027-08-31",
          source: "RentVine lease end",
        }}
      >
        <span />
      </RenewalManualProvider>,
    );
    const note = document.querySelector('[data-renewal-cycle-source-date="changed"]');
    expect(note).not.toBeNull();
    expect(note).toHaveTextContent("recorded lease end 2026-08-31");
    expect(note).toHaveTextContent("RentVine now reports 2027-08-31");
    expect(note).toHaveTextContent("kept as history");
    expect(note).toHaveTextContent(
      "Owner-approved terms recorded on this cycle: $1,250.00 from 2026-09-01 to 2027-08-31",
    );
    // The recorded basis line is history and still shows the recorded date, never the new one.
    expect(screen.getByText(/Cycle based on lease end 2026-08-31/)).toBeInTheDocument();
    // The start control still offers the current verified lease end for a deliberate new cycle.
    expect(screen.getByLabelText("Verified lease end for this cycle")).toHaveValue(
      "2027-08-31",
    );
  });

  it("says previous terms were not recorded when the changed cycle carries no owner terms", () => {
    render(
      <RenewalManualProvider
        leaseId="701"
        initialState={initial()}
        cycleBasis={{
          kind: "lease_end",
          dateIso: "2027-08-31",
          source: "RentVine lease end",
        }}
      >
        <span />
      </RenewalManualProvider>,
    );
    const note = document.querySelector('[data-renewal-cycle-source-date="changed"]');
    expect(note).toHaveTextContent("Previous terms were not recorded for this cycle.");
    expect(note).not.toHaveTextContent("Owner-approved terms");
  });

  it("stays silent when the provider still reports the recorded date, and reports an unavailable current date", () => {
    const unchanged = render(
      <RenewalManualProvider
        leaseId="701"
        initialState={withTerms()}
        cycleBasis={{
          kind: "lease_end",
          dateIso: "2026-08-31",
          source: "RentVine lease end",
        }}
      >
        <span />
      </RenewalManualProvider>,
    );
    expect(document.querySelector("[data-renewal-cycle-source-date]")).toBeNull();
    unchanged.unmount();

    render(
      <RenewalManualProvider leaseId="701" initialState={withTerms()} cycleBasis={null}>
        <span />
      </RenewalManualProvider>,
    );
    const note = document.querySelector(
      '[data-renewal-cycle-source-date="current_unavailable"]',
    );
    expect(note).toHaveTextContent("recorded lease end 2026-08-31");
    expect(note).toHaveTextContent("the recorded date is kept");
  });

  it("shows nothing about a source change when no cycle is recorded", () => {
    render(
      <RenewalManualProvider
        leaseId="701"
        initialState={null}
        cycleBasis={{
          kind: "lease_end",
          dateIso: "2027-08-31",
          source: "RentVine lease end",
        }}
      >
        <span />
      </RenewalManualProvider>,
    );
    expect(document.querySelector("[data-renewal-cycle-source-date]")).toBeNull();
    expect(
      screen.getByText(
        "Confirm the reviewed cycle below to record work against this lease.",
      ),
    ).toBeInTheDocument();
  });
});

describe("S123 desk source-date marker (AC-S123-1, AC-S123-4)", () => {
  it("marks a retained row whose provider date changed and leaves unchanged rows unmarked", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row("L1", {
            cycleSourceDate: projectCycleSourceDateChange(recordedBasis, "2027-08-31"),
          }),
          row("L2", {
            endDateIso: "2026-08-31",
            cycleSourceDate: projectCycleSourceDateChange(recordedBasis, "2026-08-31"),
          }),
          row("L3", { manualProgress: undefined }),
        ]}
        shortcuts={{ available: false, tokenFor: () => null }}
        sourceReadOk
        state={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2 }}
        totalBeforeQuery={3}
      />,
    );
    const markers = Array.from(
      document.querySelectorAll('[data-renewal-field="cycle-source-date"]'),
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveAttribute("data-cycle-source-date", "changed");
    expect(markers[0]).toHaveTextContent("cycle recorded 2026-08-31");
    expect(markers[0]).toHaveTextContent("RentVine now 2027-08-31");
    expect(markers[0].closest("tr")).toHaveTextContent("L1 Main St");
  });
});
