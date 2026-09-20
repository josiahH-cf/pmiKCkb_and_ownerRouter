// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import {
  FILTERED_EMPTY_COPY,
  RenewalDeskTable,
} from "@/components/lease-renewal/RenewalDeskTable";
import type {
  DeskLeaseGuidance,
  DeskLeaseRow,
  DeskLeaseSummaryBase,
} from "@/lib/lease-renewal/desk-model";
import { withRenewalDeskQueryKeys } from "@/lib/lease-renewal/desk-query";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  OVERALL_STATUS_URGENCY_RANK,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  RENEWAL_DESK_WORKLIST_VIEW_CONTROL_LABEL,
  withRenewalDeskWorklistView,
} from "@/lib/lease-renewal/desk-worklist-views";
import {
  LIFECYCLE_LABELS,
  type LifecycleCategory,
  type LifecycleProjection,
} from "@/lib/lease-renewal/lifecycle-category";
import { fixedTermProjection } from "@/tests/helpers/lease-term-fixtures";
import { getRenewalDeskView } from "@/tests/helpers/sample-desk";

// S122 (F01): the table owns three obvious views over the one loaded projection, counts reconcile
// with the rows, and a zero-match result offers a wider view or fewer filters without claiming the
// lease does not exist. Rendering issues no request and records nothing. Values are synthetic.

afterEach(cleanup);

function lifecycle(category: LifecycleCategory): LifecycleProjection {
  return {
    category,
    label: LIFECYCLE_LABELS[category],
    attribution: null,
    qualifier: null,
    explanation: `Explanation for ${category}.`,
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

const shortcuts = { available: false, tokenFor: () => null } as const;

function viewLinks() {
  const nav = screen.getByRole("navigation", {
    name: RENEWAL_DESK_WORKLIST_VIEW_CONTROL_LABEL,
  });
  return {
    nav,
    active: within(nav).getByRole("link", { name: /Active \/ upcoming/ }),
    all: within(nav).getByRole("link", { name: /All leases/ }),
    completed: within(nav).getByRole("link", { name: /Completed/ }),
  };
}

describe("S122 table-owned worklist views (AC-S122-2, AC-S122-3)", () => {
  it("shows the three views with the active default current, carrying every other filter into each link", () => {
    const state: RenewalDeskQueryV2State = {
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
      lease: "Horizon",
      sort: "end_date",
      direction: "desc",
    };
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={state}
        totalInScope={2}
        totalLoaded={3}
        viewCounts={{ active: 1, all: 2, completed: 1 }}
      />,
    );
    const links = viewLinks();
    expect(links.active).toHaveAttribute("aria-current", "page");
    expect(links.all).not.toHaveAttribute("aria-current");
    expect(links.completed).not.toHaveAttribute("aria-current");
    for (const link of [links.active, links.all, links.completed]) {
      const href = link.getAttribute("href") ?? "";
      expect(href.startsWith("/lease-renewal/live/desk")).toBe(true);
      expect(href).toContain("lease=Horizon");
      expect(href).toContain("sort=end_date");
      expect(href).toContain("direction=desc");
    }
    expect(links.all.getAttribute("href")).toContain("scope=all");
    expect(links.all.getAttribute("href")).not.toContain("lifecycle=");
    expect(links.completed.getAttribute("href")).toContain("scope=all");
    expect(links.completed.getAttribute("href")).toContain("lifecycle=complete");
    expect(links.active.getAttribute("href")).not.toContain("scope=");
    // Counts ride on each view as data and visible text.
    expect(links.active).toHaveAttribute("data-count", "1");
    expect(links.all).toHaveAttribute("data-count", "2");
    expect(links.completed).toHaveAttribute("data-count", "1");
    expect(links.all).toHaveTextContent("2");
    // The existing truthful count line and persistent scope indicator remain.
    expect(
      screen.getByText(/Matching: 1 · Selected scope: 2 · Total loaded: 3/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Worklist scope:/)).toBeInTheDocument();
  });

  it("marks Completed current for scope all plus the Complete lifecycle filter and no view for a tracked bookmark", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[]}
        shortcuts={shortcuts}
        sourceReadOk
        state={withRenewalDeskWorklistView(DEFAULT_RENEWAL_DESK_QUERY_V2, "completed")}
        totalInScope={2}
        totalLoaded={2}
      />,
    );
    expect(viewLinks().completed).toHaveAttribute("aria-current", "page");
    expect(viewLinks().nav).toHaveAttribute("data-current-view", "completed");
    cleanup();

    render(
      <RenewalDeskTable
        role="Editor"
        rows={[]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2, scope: "tracked" }}
        totalInScope={0}
        totalLoaded={2}
      />,
    );
    const links = viewLinks();
    expect(links.nav).toHaveAttribute("data-current-view", "other");
    expect(links.active).not.toHaveAttribute("aria-current");
    expect(links.all).not.toHaveAttribute("aria-current");
    expect(links.completed).not.toHaveAttribute("aria-current");
  });

  it("explains a zero-match filtered view with a wider view and fewer filters, never a missing lease", () => {
    const state: RenewalDeskQueryV2State = {
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
      lease: "Horizon",
    };
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[]}
        shortcuts={shortcuts}
        sourceReadOk
        state={state}
        totalInScope={2}
        totalLoaded={3}
        viewCounts={{ active: 0, all: 1, completed: 0 }}
      />,
    );
    expect(screen.getByText(FILTERED_EMPTY_COPY)).toBeInTheDocument();
    const cell = screen.getByText(FILTERED_EMPTY_COPY).closest("td");
    expect(cell).not.toBeNull();
    const actions = within(cell as HTMLElement);
    expect(cell?.textContent).not.toMatch(/does not exist|not found|deleted/i);
    const wider = actions.getByRole("link", { name: /Show all leases/ });
    expect(wider.getAttribute("href")).toContain("scope=all");
    expect(wider.getAttribute("href")).toContain("lease=Horizon");
    expect(wider).toHaveTextContent("1");
    const fewer = actions.getByRole("link", { name: "Remove these filters" });
    expect(fewer.getAttribute("href")).toBe("/lease-renewal/live/desk");
    // The toolbar's own clear control is unchanged and still unique.
    expect(screen.getByRole("link", { name: "Clear filters" })).toBeInTheDocument();
    cleanup();

    // Under All leases the wider-view offer is gone; only the filters can be narrowed.
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[]}
        shortcuts={shortcuts}
        sourceReadOk
        state={withRenewalDeskWorklistView(state, "all")}
        totalInScope={3}
        totalLoaded={3}
      />,
    );
    expect(screen.queryByRole("link", { name: /Show all leases/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Remove these filters" }),
    ).toBeInTheDocument();
    cleanup();

    // A partial or failed read offers neither: it cannot claim the view is empty.
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[]}
        shortcuts={shortcuts}
        sourceReadOk={false}
        state={state}
        totalInScope={2}
        totalLoaded={3}
      />,
    );
    expect(screen.getByText(/cannot claim an empty worklist/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Show all leases/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Remove these filters" })).toBeNull();
    expect(viewLinks().nav).toHaveAttribute("data-source-read-complete", "false");
  });
});

describe("S122 desk container counts (AC-S122-3)", () => {
  it("derives every view count from the one loaded projection with the current filters", () => {
    const sample = getRenewalDeskView();
    const items = [
      row("W1", { lifecycle: lifecycle("upcoming") }),
      row("W2", { lifecycle: lifecycle("in_progress") }),
      row("C1", {
        endDateIso: "2026-03-31",
        disposition: "out_of_window",
        reason: "out_of_window",
        reasonLabel: "Outside the active renewal window",
        retention: { state: "outside", label: "Outside the active renewal window" },
        lifecycle: lifecycle("complete"),
      }),
      row("F1", {
        endDateIso: "2029-03-31",
        disposition: "out_of_window",
        reason: "out_of_window",
        reasonLabel: "Outside the active renewal window",
        retention: { state: "outside", label: "Outside the active renewal window" },
        lifecycle: lifecycle("later"),
      }),
    ];
    render(
      <RenewalDesk
        query={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2 }}
        role="Editor"
        view={{ ...sample, items, readComplete: true }}
      />,
    );
    const links = viewLinks();
    expect(links.active).toHaveAttribute("data-count", "2");
    expect(links.all).toHaveAttribute("data-count", "4");
    expect(links.completed).toHaveAttribute("data-count", "1");
    expect(document.querySelectorAll("tbody tr")).toHaveLength(2);
    cleanup();

    render(
      <RenewalDesk
        query={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2, lease: "F1" }}
        role="Editor"
        view={{ ...sample, items, readComplete: false }}
      />,
    );
    const filtered = viewLinks();
    expect(filtered.active).toHaveAttribute("data-count", "0");
    expect(filtered.all).toHaveAttribute("data-count", "1");
    expect(filtered.completed).toHaveAttribute("data-count", "0");
    expect(filtered.nav).toHaveAttribute("data-source-read-complete", "false");
    expect(within(filtered.nav).getByText(/partial source read/)).toBeInTheDocument();
  });
});
