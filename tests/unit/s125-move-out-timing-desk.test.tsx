// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { MoveOutTimingBasisAdminPanel } from "@/components/admin/MoveOutTimingBasisAdminPanel";
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
  applyRenewalDeskQueryV2,
  buildActiveFilterChips,
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
} from "@/lib/lease-renewal/desk-query-v2";
import type { MoveOutDisposition } from "@/lib/lease-renewal/move-out-disposition";
import {
  MOVE_OUT_TIMING_CONTROL_LABEL,
  evaluateMoveOutTiming,
  type MoveOutTimingBasisSnapshot,
  type MoveOutTimingResult,
} from "@/lib/lease-renewal/move-out-timing";
import { fixedTermProjection } from "@/tests/helpers/lease-term-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S125 (F04): the desk filters by the timing result keys, each row shows the result beside the
// move-out disposition, the workspace names both dates and the basis with a review path and no
// sanction, and the Admin panel names an unreviewed basis. Rendering issues no request and records
// nothing. Values are synthetic.

afterEach(cleanup);

const SAVED: MoveOutTimingBasisSnapshot = {
  state: "saved",
  basis: {
    targetKind: "expected_move_out",
    countingRule: "calendar_days_target_minus_notice_v1",
    thresholdDays: 30,
  },
  version: 3,
  updatedAtIso: "2026-09-19T00:00:00.000Z",
};

function disposition(
  state: MoveOutDisposition["state"],
  notice: string | null,
  target: string | null,
): MoveOutDisposition {
  return {
    state,
    reason: state === "initiated" ? "notice_status" : "active_without_notice",
    label:
      state === "initiated"
        ? "Move-out initiated in RentVine: Active - Notice Given."
        : "No move-out notice in RentVine (Active).",
    evidence: {
      origin: "rentvine_lease_status",
      leaseId: "L",
      statusId: state === "initiated" ? "3" : "2",
      statusName: state === "initiated" ? "Active - Notice Given" : "Active",
      primaryStatusId: "2",
      pendingMoveOut: state === "initiated",
      completedMoveOut: false,
      noticeDateIso: notice,
      expectedMoveOutIso: target,
      moveOutIso: null,
    },
    freshness: "fresh",
    observedAtIso: "2026-09-20T12:00:00.000Z",
  };
}

function timing(
  state: MoveOutDisposition["state"],
  notice: string | null,
  target: string | null,
  basis: MoveOutTimingBasisSnapshot = SAVED,
): { moveOut: MoveOutDisposition; moveOutTiming: MoveOutTimingResult } {
  const moveOut = disposition(state, notice, target);
  return {
    moveOut,
    moveOutTiming: evaluateMoveOutTiming({
      disposition: moveOut,
      leaseEndIso: "2026-09-30",
      basis,
      observedDateIso: "2026-09-20",
    }),
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
    endDateIso: "2026-09-30",
    disposition: "actionable",
    reason: "actionable",
    reasonLabel: "Ready to work",
    leaseTerm: fixedTermProjection("2026-09-30"),
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

const shortcuts = { available: false, tokenFor: () => null } as const;

const ROWS = [
  row("BELOW", timing("initiated", "2026-08-15", "2026-09-10")),
  row("MEETS", timing("initiated", "2026-08-01", "2026-09-10")),
  row("UNSURE", timing("initiated", null, "2026-09-10")),
  row("NONE", timing("not_initiated", null, null)),
  row("UNEVALUATED"),
];

describe("S125 desk filter and row indicator (AC-S125-5, AC-S125-6)", () => {
  it("filters by the exact result keys, treats an unevaluated row as Cannot determine and keeps sort keys unchanged", () => {
    const noParty = () => false;
    const keys = (filter: (typeof DEFAULT_RENEWAL_DESK_QUERY_V2)["moveOutTiming"]) =>
      applyRenewalDeskQueryV2(
        ROWS,
        { ...DEFAULT_RENEWAL_DESK_QUERY_V2, moveOutTiming: filter },
        noParty,
      ).items.map((item) => item.id);
    expect(keys("all")).toHaveLength(5);
    expect(keys("below")).toEqual(["BELOW"]);
    expect(keys("meets")).toEqual(["MEETS"]);
    expect(keys("cannot_determine").sort()).toEqual(["UNEVALUATED", "UNSURE"]);
    expect(keys("not_applicable")).toEqual(["NONE"]);
    // The timing filter changes membership only; the end-date order of the survivors is the same
    // order those rows have without the filter, so a display-format change cannot move a row.
    const unfiltered = applyRenewalDeskQueryV2(
      ROWS,
      { ...DEFAULT_RENEWAL_DESK_QUERY_V2, sort: "end_date", direction: "asc" },
      noParty,
    ).items.map((item) => item.id);
    const filtered = applyRenewalDeskQueryV2(
      ROWS,
      {
        ...DEFAULT_RENEWAL_DESK_QUERY_V2,
        sort: "end_date",
        direction: "asc",
        moveOutTiming: "cannot_determine",
      },
      noParty,
    ).items.map((item) => item.id);
    expect(filtered).toEqual(unfiltered.filter((id) => filtered.includes(id)));
    // The filter round-trips through the canonical URL and appears as a chip.
    const state = { ...DEFAULT_RENEWAL_DESK_QUERY_V2, moveOutTiming: "below" as const };
    const serialized = serializeRenewalDeskQueryV2(state);
    expect(serialized).toContain("moveOutTiming=below");
    expect(parseRenewalDeskQueryV2(new URLSearchParams(serialized)).moveOutTiming).toBe(
      "below",
    );
    expect(
      parseRenewalDeskQueryV2(new URLSearchParams("v=2&moveOutTiming=late"))
        .moveOutTiming,
    ).toBe("all");
    expect(buildActiveFilterChips(state).map((chip) => chip.label)).toEqual([
      "Notice timing: Below configured timing: staff review",
    ]);
  });

  it("shows the result beside the move-out disposition with a review cue and no sanction, quiet when not applicable", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={ROWS}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2 }}
        totalInScope={5}
        totalLoaded={5}
      />,
    );
    const markers = Array.from(
      document.querySelectorAll('[data-renewal-field="move-out-timing"]'),
    );
    expect(markers.map((marker) => marker.getAttribute("data-move-out-timing"))).toEqual([
      "below",
      "meets",
      "cannot_determine",
    ]);
    expect(markers[0]).toHaveTextContent("Below configured 30-day timing: staff review");
    expect(markers[0]).toHaveTextContent("(26 days)");
    expect(markers[1]).toHaveTextContent("Meets configured 30-day timing");
    expect(markers[1]).toHaveTextContent("(40 days)");
    expect(markers[2]).toHaveTextContent("Cannot determine");
    // Pressing the result filters; nothing is recorded and no sanction is shown.
    const link = within(markers[0] as HTMLElement).getByRole("link");
    expect(link.getAttribute("href")).toContain("moveOutTiming=below");
    const belowRow = markers[0].closest("tr") as HTMLElement;
    expect(within(markers[0] as HTMLElement).queryAllByRole("button")).toHaveLength(0);
    expect(markers[0].textContent).not.toMatch(/[$][0-9]|compliant|violation/i);
    expect(belowRow).toHaveAttribute("data-manual-complete", "none");
    // Explicit absence of notice shows nothing; the S124 disposition indicator still does.
    const noneRow = screen.getByText("NONE Main St").closest("tr") as HTMLElement;
    expect(noneRow.querySelector('[data-renewal-field="move-out-timing"]')).toBeNull();
    expect(noneRow.querySelector('[data-renewal-field="move-out"]')).not.toBeNull();
    // The header filter offers every state by value.
    const select = screen.getByLabelText(
      MOVE_OUT_TIMING_CONTROL_LABEL,
    ) as HTMLSelectElement;
    expect(select.name).toBe("moveOutTiming");
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "all",
      "meets",
      "below",
      "cannot_determine",
      "not_applicable",
    ]);
  });
});

describe("S125 workspace timing panel (AC-S125-1, AC-S125-3, AC-S125-5)", () => {
  function renderWorkspace(fields: Partial<DeskLeaseSummaryBase>, withSource = true) {
    const value = getRenewalLeaseWorkspace("lease-318-cedar-7");
    if (!value) throw new Error("sample workspace missing");
    render(
      <RenewalWorkspace
        role="Editor"
        workspace={{
          ...value,
          summary: {
            ...value.summary,
            ...(withSource
              ? {
                  sourceDestinations: {
                    rentvine: {
                      kind: "external",
                      href: "https://pmikcmetro.rentvine.com/leases/318",
                      label: "Opens the lease in RentVine.",
                    },
                  },
                }
              : {}),
            ...fields,
          },
        }}
        workStatus={{ available: true, record: null, history: [], currentCycleId: null }}
      />,
    );
  }

  it("names both dates, the days given and the basis version for a below-threshold notice, with a source review path", () => {
    renderWorkspace(timing("initiated", "2026-08-15", "2026-09-10"));
    const panel = screen.getByRole("region", { name: "Notice timing" });
    expect(panel).toHaveAttribute("data-renewal-move-out-timing", "below");
    expect(panel).toHaveTextContent("Below configured 30-day timing: staff review");
    expect(panel).toHaveTextContent("2026-08-15");
    expect(panel).toHaveTextContent("2026-09-10");
    expect(panel).toHaveTextContent("Scheduled move-out date");
    expect(panel).toHaveTextContent("26");
    expect(panel).toHaveTextContent("30 calendar days, version 3");
    const review = within(panel).getByRole("link", {
      name: "Review the notice dates in RentVine",
    });
    expect(review.getAttribute("href")).toBe(
      "https://pmikcmetro.rentvine.com/leases/318",
    );
    // A review path only: no control, no amount, no compliance badge.
    expect(within(panel).queryAllByRole("button")).toHaveLength(0);
    expect(within(panel).getAllByRole("link")).toHaveLength(1);
    expect(panel.textContent).not.toMatch(/[$][0-9]|compliant|violation/i);
    expect(panel.textContent).toMatch(/not a legal, fee or compliance determination/);
  });

  it("names the missing basis instead of a yes or no, and renders nothing when no notice exists", () => {
    renderWorkspace(
      timing("initiated", "2026-08-15", "2026-09-10", {
        state: "missing",
        basis: null,
        version: null,
        updatedAtIso: null,
      }),
    );
    const panel = screen.getByRole("region", { name: "Notice timing" });
    expect(panel).toHaveAttribute("data-renewal-move-out-timing", "cannot_determine");
    expect(panel).toHaveTextContent("Cannot determine");
    expect(panel).toHaveTextContent("Not reviewed");
    expect(panel).toHaveTextContent("Target date (basis not reviewed)");
    expect(panel.textContent).not.toMatch(/Meets|Below/);
    cleanup();

    renderWorkspace(timing("not_initiated", null, null));
    expect(screen.queryByRole("region", { name: "Notice timing" })).toBeNull();
  });
});

describe("S125 Admin basis surface (AC-S125-1)", () => {
  it("names an unreviewed basis and shows the saved version once recorded", () => {
    render(<MoveOutTimingBasisAdminPanel initial={{ state: "missing", record: null }} />);
    expect(screen.getByRole("status")).toHaveTextContent("not reviewed");
    expect(screen.getByLabelText("Compare the notice against")).toHaveValue(
      "expected_move_out",
    );
    expect(screen.getByLabelText("Threshold in calendar days")).toHaveValue(30);
    expect(screen.getByRole("button", { name: "Record reviewed basis" })).toBeEnabled();
    cleanup();

    render(
      <MoveOutTimingBasisAdminPanel
        initial={{
          state: "saved",
          record: {
            id: "active",
            target_kind: "lease_end",
            counting_rule: "calendar_days_target_minus_notice_v1",
            threshold_days: 30,
            reviewed_note: "Confirmed by the owner.",
            version: 2,
            created_at: "2026-09-19T00:00:00.000Z",
            updated_at: "2026-09-19T00:00:00.000Z",
            updated_by_uid: "admin-1",
          },
        }}
      />,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/Current saved version: 2/)).toBeInTheDocument();
    expect(screen.getByLabelText("Compare the notice against")).toHaveValue("lease_end");
  });
});
