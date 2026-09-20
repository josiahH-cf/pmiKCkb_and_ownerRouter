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
  type RenewalOverallStatus,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  LIFECYCLE_CONTROL_LABEL,
  LIFECYCLE_LABELS,
  type LifecycleProjection,
} from "@/lib/lease-renewal/lifecycle-category";
import { fixedTermProjection } from "@/tests/helpers/lease-term-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S134 (F14): the row shows one small dot beside the visible category label in the renewal-status
// cell, the header sorts by the category, the filter offers every category, readiness and staff
// annotations stay separate, and the workspace shows the same category. Rendering issues no
// request and records nothing. Values are synthetic.

afterEach(cleanup);

function lifecycle(
  category: LifecycleProjection["category"],
  overrides: Partial<LifecycleProjection> = {},
): LifecycleProjection {
  return {
    category,
    label: LIFECYCLE_LABELS[category],
    attribution: null,
    qualifier: null,
    explanation: `Explanation for ${category}.`,
    ...overrides,
  };
}

function guidance(
  overallStatus: RenewalOverallStatus = "ready",
  isBlocked = false,
): DeskLeaseGuidance {
  return {
    currentBaseRent: 1500,
    currentBaseRentSource: "RentVine",
    rentVerification: {
      state: "verified",
      verifiedByResolutionDiffers: false,
      destination: { kind: "workspace_phase", stepId: "verify-renewal" },
    },
    overallStatus,
    urgencyRank: OVERALL_STATUS_URGENCY_RANK[overallStatus],
    isBlocked,
    blockers: isBlocked
      ? [
          {
            id: "b1",
            label: "Resolve the rent conflict.",
            type: "source",
            phaseId: "verify-renewal",
            destination: { kind: "workspace_phase", stepId: "verify-renewal" },
          },
        ]
      : [],
    action: isBlocked
      ? { kind: "blocked" }
      : {
          kind: "act",
          label: "Record the owner decision.",
          destination: { kind: "workspace_phase", stepId: "owner-decision" },
        },
  };
}

function row(
  id: string,
  overrides: Partial<DeskLeaseSummaryBase> = {},
  guidanceValue: DeskLeaseGuidance = guidance(),
): DeskLeaseRow {
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
    guidance: guidanceValue,
  };
}

describe("S134 lifecycle dot, sort header and filter (AC-S134-3, AC-S134-4, AC-S134-5, AC-S134-7)", () => {
  it("renders one labeled dot per row in the renewal-status cell with the category as data, beside an unchanged readiness badge", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row("L1", {
            lifecycle: lifecycle("complete", {
              attribution: "staff_recorded",
              qualifier: "recorded by staff",
            }),
          }),
          row("L2", { lifecycle: lifecycle("upcoming") }, guidance("blocked", true)),
          row("L3", {
            lifecycle: lifecycle("non_renewal", {
              attribution: "provider_notice",
              qualifier: "RentVine notice",
            }),
          }),
          row("L4", { lifecycle: lifecycle("unknown") }),
          row("L5"),
        ]}
        shortcuts={{ available: false, tokenFor: () => null }}
        sourceReadOk
        state={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2, sort: "lifecycle", direction: "asc" }}
        totalBeforeQuery={5}
      />,
    );
    const cells = Array.from(
      document.querySelectorAll('[data-renewal-field="lifecycle"]'),
    );
    expect(cells.map((cell) => cell.getAttribute("data-lifecycle"))).toEqual([
      "complete",
      "upcoming",
      "non_renewal",
      "unknown",
    ]);
    // The dot is decorative; the adjacent text carries the meaning and the attribution.
    for (const cell of cells) {
      const dot = cell.querySelector(".renewal-lifecycle-dot");
      expect(dot).toHaveAttribute("aria-hidden", "true");
      expect(dot).toHaveAttribute("data-lifecycle", cell.getAttribute("data-lifecycle"));
    }
    expect(cells[0]).toHaveTextContent("Complete");
    expect(cells[0]).toHaveTextContent("recorded by staff");
    expect(cells[0]).not.toHaveTextContent(/provider-verified/i);
    expect(cells[1]).toHaveTextContent("Upcoming");
    expect(cells[2]).toHaveTextContent("Non-renewal initiated");
    expect(cells[2]).toHaveTextContent("RentVine notice");
    expect(cells[3]).toHaveTextContent("Unknown: review");
    // Each dot lives inside the renewal-status cell next to the separate readiness badge.
    const statusCell = cells[1].closest('td[data-renewal-field="overall-status"]');
    expect(statusCell).not.toBeNull();
    expect(statusCell).toHaveAttribute("data-status", "blocked");
    expect(within(statusCell as HTMLElement).getByText("Blocked")).toBeInTheDocument();
    // A row without a projection shows no lifecycle claim.
    const bare = screen.getByText("L5 Main St").closest("tr");
    expect(bare?.querySelector('[data-renewal-field="lifecycle"]')).toBeNull();
    // The lifecycle header is a sortable column exposing its state.
    const sorted = document.querySelector('th[aria-sort="ascending"]');
    expect(sorted?.textContent).toContain("Lifecycle");
    expect(document.querySelectorAll("th[aria-sort]")).toHaveLength(1);
    // The filter offers every category plus All, by value.
    const select = screen.getByLabelText(LIFECYCLE_CONTROL_LABEL) as HTMLSelectElement;
    expect(select.name).toBe("lifecycle");
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "all",
      "complete",
      "non_renewal",
      "in_progress",
      "upcoming",
      "later",
      "unknown",
    ]);
    // Pressing a label is a query link, never a mutation.
    const link = within(cells[0] as HTMLElement).getByRole("link");
    expect(link.getAttribute("href")).toContain("lifecycle=complete");
  });
});

describe("S134 workspace category (AC-S134-3, AC-S134-8)", () => {
  it("shows the same category with its attribution in the lease workspace header", () => {
    const value = getRenewalLeaseWorkspace("lease-318-cedar-7");
    if (!value) throw new Error("sample workspace missing");
    render(
      <RenewalWorkspace
        role="Editor"
        workspace={{
          ...value,
          summary: {
            ...value.summary,
            lifecycle: lifecycle("complete", {
              attribution: "staff_recorded",
              qualifier: "recorded by staff",
              explanation:
                "The current cycle is complete as recorded by staff. This does not establish provider-verified signatures or synchronization.",
            }),
          },
        }}
        workStatus={{ available: true, record: null, history: [], currentCycleId: null }}
      />,
    );
    const marker = document.querySelector('[data-renewal-lifecycle="complete"]');
    expect(marker).not.toBeNull();
    expect(marker).toHaveTextContent("Complete");
    expect(marker).toHaveTextContent("recorded by staff");
    expect(marker?.querySelector(".renewal-lifecycle-dot")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
