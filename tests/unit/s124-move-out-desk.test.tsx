// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { RenewalDeskTable } from "@/components/lease-renewal/RenewalDeskTable";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
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
  MOVE_OUT_CONTROL_LABEL,
  type MoveOutDisposition,
} from "@/lib/lease-renewal/move-out-disposition";
import { fixedTermProjection } from "@/tests/helpers/lease-term-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S124 (F03): the desk offers the move-out filter and shows each row's attributed disposition; the
// lease workspace shows a confirmed notice before owner outreach and an unknown state as a review
// cue. Rendering issues no request and records nothing. Values are synthetic.

afterEach(cleanup);

function disposition(
  state: MoveOutDisposition["state"],
  statusName: string,
  label: string,
): MoveOutDisposition {
  return {
    state,
    reason:
      state === "initiated"
        ? "notice_status"
        : state === "not_initiated"
          ? "active_without_notice"
          : "status_table_unavailable",
    label,
    evidence: {
      origin: "rentvine_lease_status",
      leaseId: "1",
      statusId: "3",
      statusName,
      primaryStatusId: "2",
      pendingMoveOut: state === "initiated",
      completedMoveOut: false,
      noticeDateIso: state === "initiated" ? "2026-07-01" : null,
      expectedMoveOutIso: null,
      moveOutIso: null,
    },
    freshness: "fresh",
    observedAtIso: "2026-07-19T00:00:00.000Z",
  };
}

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
    propertyNameLabel: null,
    tenantNameLabel: "Tenant Alpha",
    tenantNameLabels: ["Tenant Alpha"],
    ownerNameLabels: ["Owner Alpha"],
    identity: {
      address: { label: `${id} Main St`, sourceRef: `rentvine:lease:${id}:property` },
      property: null,
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
    endDateIso: "2026-08-31",
    disposition: "actionable",
    reason: "actionable",
    reasonLabel: "Ready to work",
    leaseTerm: fixedTermProjection("2026-08-31"),
    currentRent: 1500,
    unitListedRent: 1500,
    retention: { state: "window", label: "Inside the current-month renewal window" },
    processVersion: "renewal-v1",
    workflowStepId: "owner-decision",
    stageIndex: 1,
    stageLabel: "Owner decision",
    nextAction: "Record the owner decision.",
    openConflicts: 0,
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

describe("S124 desk move-out filter and indicators (AC-S124-3, AC-S124-4)", () => {
  it("offers the move-out filter with every documented option and marks each row's disposition", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row("L1", {
            moveOut: disposition(
              "initiated",
              "Active - Notice Given",
              "Move-out initiated in RentVine: Active - Notice Given (notice 2026-07-01). Ordinary renewal outreach is unavailable; use the non-renewal handoff.",
            ),
          }),
          row("L2", {
            moveOut: disposition(
              "not_initiated",
              "Active",
              "No move-out notice in RentVine (Active).",
            ),
          }),
          row("L3", {
            moveOut: disposition(
              "unknown",
              "Active",
              "Move-out evidence unknown: the RentVine lease status list could not be read. Review the lease in RentVine before outreach.",
            ),
          }),
          row("L4"),
        ]}
        shortcuts={{ available: false, tokenFor: () => null }}
        sourceReadOk
        state={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2 }}
        totalBeforeQuery={4}
      />,
    );
    const select = screen.getByLabelText(MOVE_OUT_CONTROL_LABEL) as HTMLSelectElement;
    expect(select.name).toBe("moveOut");
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "all",
      "initiated",
      "exclude_initiated",
      "unknown",
      "not_initiated",
      "non_renewal",
    ]);
    const markers = Array.from(
      document.querySelectorAll('[data-renewal-field="move-out"]'),
    );
    expect(markers.map((marker) => marker.getAttribute("data-move-out"))).toEqual([
      "initiated",
      "not_initiated",
      "unknown",
    ]);
    expect(markers[0]).toHaveTextContent("Move-out initiated (Active - Notice Given)");
    expect(markers[0]).toHaveAttribute(
      "title",
      expect.stringContaining("Ordinary renewal outreach is unavailable"),
    );
    expect(markers[2]).toHaveTextContent("Move-out evidence unknown");
    // A row whose disposition was never read shows no claim either way.
    const rowWithout = screen.getByText("L4 Main St").closest("tr");
    expect(rowWithout).not.toBeNull();
    expect(within(rowWithout!).queryByText(/move-out/i)).toBeNull();
  });
});

describe("S124 workspace notice (AC-S124-3)", () => {
  const workspace = (moveOut: MoveOutDisposition | undefined) => {
    const value = getRenewalLeaseWorkspace("lease-318-cedar-7");
    if (!value) throw new Error("sample workspace missing");
    return {
      ...value,
      summary: moveOut ? { ...value.summary, moveOut } : value.summary,
    };
  };

  it("shows a confirmed notice as a status before the workflow guidance and an unknown state as a review cue", () => {
    const initiated = render(
      <RenewalWorkspace
        role="Editor"
        workspace={workspace(
          disposition(
            "initiated",
            "Active - Notice Given",
            "Move-out initiated in RentVine: Active - Notice Given (notice 2026-07-01). Ordinary renewal outreach is unavailable; use the non-renewal handoff.",
          ),
        )}
        workStatus={{ available: true, record: null, history: [], currentCycleId: null }}
      />,
    );
    const notice = document.querySelector('[data-renewal-move-out="initiated"]');
    expect(notice).not.toBeNull();
    expect(notice).toHaveTextContent(
      "Move-out initiated in RentVine: Active - Notice Given",
    );
    expect(notice).toHaveTextContent("non-renewal handoff");
    expect(notice).toHaveAttribute("role", "status");
    initiated.unmount();

    render(
      <RenewalWorkspace
        role="Editor"
        workspace={workspace(
          disposition(
            "unknown",
            "Active",
            "Move-out evidence unknown: the RentVine lease status list could not be read. Review the lease in RentVine before outreach.",
          ),
        )}
        workStatus={{ available: true, record: null, history: [], currentCycleId: null }}
      />,
    );
    expect(document.querySelector('[data-renewal-move-out="unknown"]')).toHaveTextContent(
      "Review the lease in RentVine before outreach",
    );
    cleanup();

    render(
      <RenewalWorkspace
        role="Editor"
        workspace={workspace(
          disposition(
            "not_initiated",
            "Active",
            "No move-out notice in RentVine (Active).",
          ),
        )}
        workStatus={{ available: true, record: null, history: [], currentCycleId: null }}
      />,
    );
    expect(document.querySelector("[data-renewal-move-out]")).toBeNull();
  });
});
