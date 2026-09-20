import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RentVineLeaseStatus } from "@/lib/integrations/rentvine/client";
import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";
import type { DateWindow } from "@/lib/lease-renewal/cohort";
import { projectCycleSourceDateChange } from "@/lib/lease-renewal/cycle-source-date";
import { withRenewalDeskQueryKeys } from "@/lib/lease-renewal/desk-query";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  RENEWAL_DESK_V2_SORTS,
  applyRenewalDeskQueryV2,
  buildActiveFilterChips,
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
  type RenewalDeskV2Item,
} from "@/lib/lease-renewal/desk-query-v2";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import {
  LIFECYCLE_CATEGORIES,
  LIFECYCLE_LABELS,
  LIFECYCLE_SORT_ORDER,
  lifecycleSortValue,
  matchesLifecycleFilter,
  projectLifecycleCategory,
  type LifecycleCategory,
} from "@/lib/lease-renewal/lifecycle-category";
import { loadLiveRenewalDesk } from "@/lib/lease-renewal/live-desk";
import {
  clearLiveLeaseCache,
  type LiveLeaseSnapshotResult,
} from "@/lib/lease-renewal/live-lease-cache";
import type { MoveOutDisposition } from "@/lib/lease-renewal/move-out-disposition";
import type { RenewalProgress } from "@/lib/lease-renewal/renewal-progress";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import {
  SHEET_WRITEBACK_FLAG,
  isOperatingSheetWritebackPaused,
} from "@/lib/lease-renewal/sheet-writeback-policy";
import {
  emptyRenewalWorkspace,
  manualRenewalSummary,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import {
  applyFakeLeaseDetail,
  withFakeLeaseDetail,
} from "@/tests/helpers/rentvine-detail-fake";

// S134 (F14): one pure, cycle-aware lifecycle category per lease drives the row dot and label, the
// canonical sort and the filter. It is presentation over real evidence (S113 manual cycle, S72
// progress, S123 cycle relation, S124 disposition, eligibility window); a staff label alone never
// completes a cycle and the projection writes nothing. Values are synthetic.

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const READ_TS = "2026-07-19T00:00:00.000Z";
const WINDOWS: DateWindow[] = [{ startIso: "2026-08-01", endIso: "2026-09-30" }];
const CYCLE = "1c0a4d7e-7d3b-4a6e-9f4c-2a5f9e6b8d10";
const meta = (eventId: string) => ({
  actorUid: "operator",
  recordedAt: "2026-07-18T12:00:00.000Z",
  eventId,
});

const inWindow = {
  state: "window" as const,
  label: "Inside the current-month renewal window",
};
const outside = { state: "outside" as const, label: "Outside the active renewal window" };
const tracked = {
  state: "tracked_incomplete" as const,
  label: "Recorded renewal work or source updates retained outside the active window",
};
const needsVerification = {
  state: "needs_verification" as const,
  label: "End date needs verification; retained for review",
};
const periodic = {
  state: "periodic_review" as const,
  label: "Periodic review due 2026-09-15",
};

function moveOut(
  state: MoveOutDisposition["state"],
  reason: MoveOutDisposition["reason"] = state === "initiated"
    ? "notice_status"
    : state === "not_initiated"
      ? "active_without_notice"
      : state === "withdrawn"
        ? "withdrawn_after_prior_notice"
        : "status_table_unavailable",
): MoveOutDisposition {
  return {
    state,
    reason,
    label: `Move-out ${state} (${reason}).`,
    evidence: {
      origin: "rentvine_lease_status",
      leaseId: "1",
      statusId: "3",
      statusName: "Active - Notice Given",
      primaryStatusId: "2",
      pendingMoveOut: state === "initiated",
      completedMoveOut: false,
      noticeDateIso: null,
      expectedMoveOutIso: null,
      moveOutIso: null,
    },
    freshness: "fresh",
    observedAtIso: READ_TS,
  };
}

function cycle(leaseId = "4821"): RenewalWorkspaceState {
  return emptyRenewalWorkspace(leaseId, CYCLE, {
    kind: "lease_end",
    dateIso: "2026-08-31",
    source: "RentVine lease end",
  });
}

function completedCycle(nonRenewal = false): RenewalWorkspaceState {
  let state = cycle();
  if (nonRenewal) {
    state = planRenewalWorkspaceAction(
      state,
      { kind: "owner_response", outcome: "declined_non_renewal", source: "Owner call" },
      meta("e1"),
    );
    state = planRenewalWorkspaceAction(
      state,
      {
        kind: "activity",
        activity: "non_renewal_handoff",
        outcome: "done",
        source: "Handoff",
      },
      meta("e2"),
    );
  } else {
    state = planRenewalWorkspaceAction(
      state,
      { kind: "activity", activity: "owner_outreach", outcome: "done", source: "Call" },
      meta("e1"),
    );
    state = planRenewalWorkspaceAction(
      state,
      {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: { rent: 1250, effectiveDate: "2026-09-01", endDate: "2027-08-31" },
        source: "Owner call",
      },
      meta("e2"),
    );
    state = planRenewalWorkspaceAction(
      state,
      { kind: "activity", activity: "tenant_offer", outcome: "done", source: "Email" },
      meta("e3"),
    );
    state = planRenewalWorkspaceAction(
      state,
      { kind: "tenant_response", outcome: "accepted", source: "Tenant email" },
      meta("e4"),
    );
    for (const activity of ["documents", "document_delivery", "signatures"] as const)
      state = planRenewalWorkspaceAction(
        state,
        { kind: "activity", activity, outcome: "done", source: "Fixture" },
        meta(`d-${activity}`),
      );
    for (const activity of [
      "information_form",
      "form_returned",
      "insurance",
      "rhino",
      "pet",
      "charges",
      "inspection",
      "filter",
      "utilities",
      "assisted_housing",
    ] as const)
      state = planRenewalWorkspaceAction(
        state,
        {
          kind: "activity",
          activity,
          outcome: "not_applicable",
          source: "Fixture",
          reason: "Fixture policy",
          applicabilityPolicy: "Approved policy 1",
        },
        meta(`na-${activity}`),
      );
  }
  return planRenewalWorkspaceAction(
    state,
    { kind: "complete", source: "Staff reviewed the checklist" },
    meta("complete"),
  );
}

const inProgressCycle = () =>
  planRenewalWorkspaceAction(
    cycle(),
    { kind: "activity", activity: "owner_outreach", outcome: "done", source: "Call" },
    meta("e1"),
  );

const base = { disposition: "actionable" as const, progressStateAvailable: true };

beforeEach(() => {
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
});
afterEach(() => vi.unstubAllEnvs());

describe("S134 lifecycle projection (AC-S134-1, AC-S134-2, AC-S134-8)", () => {
  it("partitions every category exactly once and never completes a cycle from acceptance or a staff label", () => {
    const partition: Record<
      LifecycleCategory,
      ReturnType<typeof projectLifecycleCategory>
    > = {
      complete: projectLifecycleCategory({
        ...base,
        retention: inWindow,
        manualProgress: manualRenewalSummary(completedCycle()),
        cycleSourceDate: projectCycleSourceDateChange(cycle().basis, "2026-08-31"),
        moveOut: moveOut("not_initiated"),
      }),
      non_renewal: projectLifecycleCategory({
        ...base,
        retention: inWindow,
        moveOut: moveOut("initiated"),
      }),
      in_progress: projectLifecycleCategory({
        ...base,
        retention: inWindow,
        manualProgress: manualRenewalSummary(inProgressCycle()),
        moveOut: moveOut("not_initiated"),
      }),
      upcoming: projectLifecycleCategory({
        ...base,
        retention: inWindow,
        moveOut: moveOut("not_initiated"),
      }),
      later: projectLifecycleCategory({
        ...base,
        disposition: "out_of_window",
        retention: outside,
        moveOut: moveOut("not_initiated"),
      }),
      unknown: projectLifecycleCategory({
        ...base,
        retention: inWindow,
        moveOut: moveOut("unknown"),
      }),
    };
    for (const category of LIFECYCLE_CATEGORIES) {
      expect(partition[category].category).toBe(category);
      expect(partition[category].label).toBe(LIFECYCLE_LABELS[category]);
      expect(partition[category].explanation.length).toBeGreaterThan(10);
    }
    expect(partition.complete).toMatchObject({
      attribution: "staff_recorded",
      qualifier: "recorded by staff",
    });
    expect(partition.non_renewal.attribution).toBe("provider_notice");
    expect(partition.later.label).toBe("Later / outside current window");
    expect(partition.unknown.label).toBe("Unknown: review");

    // Tenant acceptance with open obligations is In progress, never Complete.
    let accepted = inProgressCycle();
    accepted = planRenewalWorkspaceAction(
      accepted,
      {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: { rent: 1250, effectiveDate: "2026-09-01", endDate: "2027-08-31" },
        source: "Owner call",
      },
      meta("o"),
    );
    accepted = planRenewalWorkspaceAction(
      accepted,
      { kind: "tenant_response", outcome: "accepted", source: "Tenant" },
      meta("t"),
    );
    expect(
      projectLifecycleCategory({
        ...base,
        retention: inWindow,
        manualProgress: manualRenewalSummary(accepted),
      }).category,
    ).toBe("in_progress");
    // A "complete"-sounding staff work status is not an input at all: with no cycle it stays Upcoming.
    expect(projectLifecycleCategory({ ...base, retention: inWindow }).category).toBe(
      "upcoming",
    );
  });

  it("AC-S134-2: old complete plus a newly due cycle is Upcoming; advanced dates keep unfinished work In progress; a closed non-renewal handoff is Complete with its qualifier; conflicts are Unknown", () => {
    const advanced = projectCycleSourceDateChange(cycle().basis, "2027-08-31");
    expect(
      projectLifecycleCategory({
        ...base,
        retention: inWindow,
        manualProgress: manualRenewalSummary(completedCycle()),
        cycleSourceDate: advanced,
      }),
    ).toMatchObject({ category: "upcoming" });
    expect(
      projectLifecycleCategory({
        ...base,
        disposition: "out_of_window",
        retention: outside,
        manualProgress: manualRenewalSummary(completedCycle()),
        cycleSourceDate: advanced,
      }).category,
    ).toBe("later");
    expect(
      projectLifecycleCategory({
        ...base,
        disposition: "out_of_window",
        retention: tracked,
        manualProgress: manualRenewalSummary(inProgressCycle()),
        cycleSourceDate: advanced,
      }),
    ).toMatchObject({ category: "in_progress" });
    // A newer applicable move-out notice outranks an old completion that no longer covers this cycle.
    expect(
      projectLifecycleCategory({
        ...base,
        retention: inWindow,
        manualProgress: manualRenewalSummary(completedCycle()),
        cycleSourceDate: advanced,
        moveOut: moveOut("initiated"),
      }).category,
    ).toBe("non_renewal");
    expect(
      projectLifecycleCategory({
        ...base,
        retention: inWindow,
        manualProgress: manualRenewalSummary(completedCycle(true)),
      }),
    ).toMatchObject({
      category: "complete",
      attribution: "staff_recorded",
      qualifier: "Non-renewal handoff completed (recorded by staff)",
    });
    // An open staff non-renewal decision is Non-renewal initiated by staff decision.
    const declined = planRenewalWorkspaceAction(
      cycle(),
      { kind: "owner_response", outcome: "declined_non_renewal", source: "Owner call" },
      meta("d"),
    );
    expect(
      projectLifecycleCategory({
        ...base,
        retention: inWindow,
        manualProgress: manualRenewalSummary(declined),
      }),
    ).toMatchObject({ category: "non_renewal", attribution: "staff_decision" });
    // Conflicting or unreadable evidence is Unknown, never a guess from dates.
    expect(
      projectLifecycleCategory({
        ...base,
        retention: inWindow,
        moveOut: moveOut("unknown", "notice_evidence_without_status"),
      }).category,
    ).toBe("unknown");
    expect(
      projectLifecycleCategory({ ...base, retention: needsVerification }).category,
    ).toBe("unknown");
    expect(
      projectLifecycleCategory({
        ...base,
        retention: inWindow,
        progressStateAvailable: false,
        manualProgress: manualRenewalSummary(completedCycle()),
      }).category,
    ).toBe("unknown");
    expect(
      projectLifecycleCategory({
        ...base,
        retention: inWindow,
        moveOut: moveOut("withdrawn"),
      }).category,
    ).toBe("unknown");
    // A closed lease's unread move-out evidence does not hide its window relation.
    expect(
      projectLifecycleCategory({
        ...base,
        disposition: "out_of_window",
        retention: outside,
        moveOut: moveOut("unknown", "lease_not_active"),
      }).category,
    ).toBe("later");
    expect(projectLifecycleCategory({ ...base, retention: periodic }).category).toBe(
      "upcoming",
    );
  });

  it("AC-S134-8: app-recorded progress completes or continues without a manual cycle, and stored inputs are untouched", () => {
    const progress: RenewalProgress = {
      leaseId: "4821",
      processVersion: "renewal-v1",
      stageIndex: 2,
      ownerDecision: null,
      ownerDecisionRevision: 0,
      tenantOfferDraftId: null,
      tenantOutcome: null,
      evidence: {},
      complete: false,
    };
    expect(
      projectLifecycleCategory({ ...base, retention: inWindow, appProgress: progress })
        .category,
    ).toBe("in_progress");
    expect(
      projectLifecycleCategory({
        ...base,
        retention: inWindow,
        appProgress: { ...progress, complete: true },
      }),
    ).toMatchObject({ category: "complete", attribution: "app_recorded" });
    const manual = completedCycle();
    const before = JSON.stringify(manual);
    projectLifecycleCategory({
      ...base,
      retention: inWindow,
      manualProgress: manualRenewalSummary(manual),
    });
    expect(JSON.stringify(manual)).toBe(before);
  });
});

describe("S134 sort and filter contract (AC-S134-5, AC-S134-6)", () => {
  function item(
    id: string,
    lifecycle: LifecycleCategory | undefined,
    endDateIso: string | null,
  ) {
    return {
      id,
      queryKeys: {
        normalizedLeaseId: id,
        normalizedSearchText: id,
        endDateIso,
        endMonth: endDateIso?.slice(0, 7) ?? null,
        normalizedOwners: [],
        normalizedTenants: [],
        workflowStepId: null,
        workflowStepIndex: null,
        waitingOn: "not_waiting",
        dueState: "unset",
        dueAtIso: null,
        sourceConflictCount: 0,
        leaseTerm: "fixed_term" as const,
        nextReviewIso: null,
        ...(lifecycle ? { lifecycle } : {}),
      },
      identity: { address: { label: `${id} Main St` }, property: null },
      retention: { state: "window" },
      guidance: {
        currentBaseRent: 1000,
        rentVerification: { state: "verified" as const },
        overallStatus: "ready" as const,
        urgencyRank: 3,
        isBlocked: false,
      },
    } satisfies RenewalDeskV2Item;
  }

  it("sorts by the visible category label alphabetically with deterministic date and id ties, independent of row order", () => {
    expect(RENEWAL_DESK_V2_SORTS).toContain("lifecycle");
    expect(LIFECYCLE_SORT_ORDER).toEqual([
      "complete",
      "in_progress",
      "later",
      "non_renewal",
      "unknown",
      "upcoming",
    ]);
    expect(lifecycleSortValue(undefined)).toBe("Unknown: review");
    const items = [
      item("b-up", "upcoming", "2026-09-30"),
      item("a-up", "upcoming", "2026-08-31"),
      item("c-none", undefined, "2026-08-31"),
      item("d-complete", "complete", "2026-08-31"),
      item("e-non", "non_renewal", null),
      item("f-later", "later", "2027-01-31"),
      item("g-progress", "in_progress", "2026-08-31"),
      item("h-unknown", "unknown", "2026-07-31"),
    ];
    const ascending = applyRenewalDeskQueryV2(
      items,
      { ...DEFAULT_RENEWAL_DESK_QUERY_V2, sort: "lifecycle", direction: "asc" },
      () => false,
    ).items.map((entry) => entry.id);
    expect(ascending).toEqual([
      "d-complete",
      "g-progress",
      "f-later",
      "e-non",
      "h-unknown",
      "c-none",
      "a-up",
      "b-up",
    ]);
    const descending = applyRenewalDeskQueryV2(
      items,
      { ...DEFAULT_RENEWAL_DESK_QUERY_V2, sort: "lifecycle", direction: "desc" },
      () => false,
    ).items.map((entry) => entry.id);
    expect(descending).toEqual([
      "b-up",
      "a-up",
      "c-none",
      "h-unknown",
      "e-non",
      "f-later",
      "g-progress",
      "d-complete",
    ]);
    const shuffled = [...items].reverse();
    expect(
      applyRenewalDeskQueryV2(
        shuffled,
        { ...DEFAULT_RENEWAL_DESK_QUERY_V2, sort: "lifecycle", direction: "asc" },
        () => false,
      ).items.map((entry) => entry.id),
    ).toEqual(ascending);
  });

  it("filters exact categories, keeps Unknown reachable, treats an absent key as unknown, and round-trips through the URL and chips", () => {
    const items = [
      item("complete", "complete", "2026-08-31"),
      item("non", "non_renewal", "2026-08-31"),
      item("none", undefined, "2026-08-31"),
      item("up", "upcoming", "2026-08-31"),
    ];
    const ids = (lifecycle: (typeof DEFAULT_RENEWAL_DESK_QUERY_V2)["lifecycle"]) =>
      applyRenewalDeskQueryV2(
        items,
        { ...DEFAULT_RENEWAL_DESK_QUERY_V2, lifecycle },
        () => false,
      ).items.map((entry) => entry.id);
    expect(ids("all")).toHaveLength(4);
    expect(ids("non_renewal")).toEqual(["non"]);
    expect(ids("unknown")).toEqual(["none"]);
    expect(ids("complete")).toEqual(["complete"]);
    expect(matchesLifecycleFilter("later", undefined)).toBe(false);
    // Completed rows outside the active window stay findable with the all scope.
    const outsideComplete = {
      ...item("old", "complete", "2025-08-31"),
      retention: { state: "outside" },
    };
    expect(
      applyRenewalDeskQueryV2(
        [outsideComplete],
        { ...DEFAULT_RENEWAL_DESK_QUERY_V2, scope: "all", lifecycle: "complete" },
        () => false,
      ).items.map((entry) => entry.id),
    ).toEqual(["old"]);
    const parsed = parseRenewalDeskQueryV2(
      new URLSearchParams("lifecycle=non_renewal&sort=lifecycle&direction=desc"),
    );
    expect(parsed.lifecycle).toBe("non_renewal");
    expect(parsed.sort).toBe("lifecycle");
    expect(
      parseRenewalDeskQueryV2(new URLSearchParams("lifecycle=green")).lifecycle,
    ).toBe("all");
    const serialized = serializeRenewalDeskQueryV2(parsed);
    expect(serialized).toContain("lifecycle=non_renewal");
    expect(serialized).toContain("sort=lifecycle");
    expect(buildActiveFilterChips(parsed).map((chip) => chip.label)).toContain(
      "Lifecycle: Non-renewal initiated",
    );
  });
});

describe("S134 desk integration and preservation (AC-S134-1, AC-S134-4, AC-S134-9)", () => {
  const STATUSES: RentVineLeaseStatus[] = [
    {
      leaseStatusID: "2",
      name: "Active",
      primaryLeaseStatusID: "2",
      isPendingMoveOutStatus: false,
      isCompletedMoveOutStatus: false,
      isPendingMoveInStatus: false,
      isSystemStatus: true,
    },
    {
      leaseStatusID: "3",
      name: "Active - Notice Given",
      primaryLeaseStatusID: "2",
      isPendingMoveOutStatus: true,
      isCompletedMoveOutStatus: false,
      isPendingMoveInStatus: false,
      isSystemStatus: false,
    },
  ];
  const rows = [
    {
      lease: {
        leaseID: 4821,
        endDate: "2026-08-31",
        leaseType: "Fixed Term",
        leaseStatusID: "2",
        tenants: [{ name: "Jordan Maple" }],
      },
      property: { name: "Maple Court", streetNumber: "4821", streetName: "Maple Ct" },
      unit: { rent: "1250.00" },
    },
    {
      lease: {
        leaseID: 5001,
        endDate: "2026-08-31",
        leaseType: "Fixed Term",
        leaseStatusID: "3",
        noticeDate: "2026-07-01",
        tenants: [{ name: "Casey Rivers" }],
      },
      unit: { rent: "1400.00" },
    },
    {
      lease: {
        leaseID: 6002,
        endDate: "2026-09-30",
        leaseType: "Fixed Term",
        leaseStatusID: "2",
        tenants: [{ name: "Nomatch Tenant" }],
      },
      unit: { rent: "1100.00" },
    },
    {
      lease: {
        leaseID: 8004,
        endDate: "2026-12-31",
        leaseType: "Fixed Term",
        leaseStatusID: "2",
        tenants: [{ name: "Future Tenant" }],
      },
      unit: { rent: "1000.00" },
    },
  ] as Record<string, unknown>[];
  const config = {
    ok: true as const,
    rentvineClient: withFakeLeaseDetail({
      listAllLeasesExport: async () => ({ rows, pages: 1, complete: true }),
      listLeaseStatuses: async () => STATUSES,
    }),
    rentvineHost: "pmikcmetro.rentvine.com",
    sheetsReader: {
      listTabTitles: async () => ["Lease Renewal"],
      batchGet: async () => ({
        valueRanges: [{ range: "Lease Renewal", values: SAMPLE_RENEWAL_TABLES[0] }],
      }),
      batchGetFormulas: async () => ({
        valueRanges: [{ range: "Lease Renewal", values: SAMPLE_RENEWAL_TABLES[0] }],
      }),
    },
    spreadsheetId: "sheet-id",
  };
  function snapshotResult(): LiveLeaseSnapshotResult {
    const views = leaseViewsFromExport(rows);
    applyFakeLeaseDetail(views, rows);
    return {
      snapshot: {
        views,
        complete: true,
        readAtMs: Date.parse(READ_TS),
        detailComplete: true,
        detailUnavailableCount: 0,
      },
      currency: {
        state: "fresh",
        ageMs: 0,
        readAtMs: Date.parse(READ_TS),
        refreshing: false,
        lastError: false,
      },
    };
  }
  type DeskConfigArg = Parameters<typeof loadLiveRenewalDesk>[2];

  it("projects one category per row from the same generation and keeps readiness and staff status separate", async () => {
    const manual = new Map([
      ["4821", completedCycle()],
      [
        "6002",
        planRenewalWorkspaceAction(
          cycle("6002"),
          {
            kind: "activity",
            activity: "owner_outreach",
            outcome: "done",
            source: "Call",
          },
          meta("e1"),
        ),
      ],
    ]);
    const result = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      config as unknown as DeskConfigArg,
      undefined,
      undefined,
      [],
      undefined,
      true,
      snapshotResult(),
      undefined,
      manual,
    );
    if (result.status !== "ok") throw new Error(result.status);
    const byId = new Map(result.view.items.map((item) => [item.id, item]));
    expect(byId.get("4821")?.lifecycle).toMatchObject({
      category: "complete",
      attribution: "staff_recorded",
    });
    expect(byId.get("5001")?.lifecycle?.category).toBe("non_renewal");
    expect(byId.get("6002")?.lifecycle?.category).toBe("in_progress");
    expect(byId.get("8004")?.lifecycle?.category).toBe("later");
    expect(byId.get("4821")?.queryKeys.lifecycle).toBe("complete");
    // Readiness (blockers, rent verification) and the staff annotation are untouched by the category.
    expect(byId.get("5001")?.guidance.overallStatus).toBeDefined();
    expect(byId.get("5001")?.workStatus).toBeUndefined();
    expect(byId.get("5001")?.manualProgress).toBeUndefined();
    const ids = applyRenewalDeskQueryV2(
      result.view.items,
      { ...DEFAULT_RENEWAL_DESK_QUERY_V2, scope: "all", lifecycle: "complete" },
      () => false,
    ).items.map((item) => item.id);
    expect(ids).toEqual(["4821"]);
    vi.stubEnv(SHEET_WRITEBACK_FLAG, "false");
    expect(isOperatingSheetWritebackPaused()).toBe(true);
  });

  it("declares the requested dot colors as theme tokens in both light and dark themes (AC-S134-3)", () => {
    const theme = readFileSync(join(root, "styles", "theme.css"), "utf8");
    expect(
      (theme.match(/--lifecycle-upcoming-icon:/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      (theme.match(/--lifecycle-non-renewal-icon:/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
    const globals = readFileSync(join(root, "app", "globals.css"), "utf8");
    expect(globals).toContain('.renewal-lifecycle-dot[data-lifecycle="complete"]');
    expect(globals).toContain("var(--state-verified-icon)");
    expect(globals).toContain('.renewal-lifecycle-dot[data-lifecycle="upcoming"]');
    expect(globals).toContain("var(--lifecycle-upcoming-icon)");
    expect(globals).toContain('.renewal-lifecycle-dot[data-lifecycle="non_renewal"]');
    expect(globals).toContain("var(--lifecycle-non-renewal-icon)");
  });

  it("withRenewalDeskQueryKeys carries the category key only when the summary carries a projection", () => {
    const summary = {
      id: "1",
      addressLabel: "1 Main St",
      propertyNameLabel: null,
      tenantNameLabel: "T",
      tenantNameLabels: ["T"],
      ownerNameLabels: [],
      identity: { address: null, property: null, tenants: [], owners: [] },
      endDateIso: "2026-08-31",
      disposition: "actionable" as const,
      reason: "actionable" as const,
      reasonLabel: "Ready",
      leaseTerm: {
        term: "fixed_term",
        evidence: "provider_detail",
        anchorIso: null,
        nextReviewIso: null,
      } as never,
      currentRent: 1,
      unitListedRent: 1,
      leaseTotalRent: 1,
      retention: inWindow,
      processVersion: null,
      workflowStepId: null,
      stageIndex: -1,
      stageLabel: null,
      nextAction: null,
      openConflicts: 0,
    };
    expect(withRenewalDeskQueryKeys(summary).queryKeys.lifecycle).toBeUndefined();
    expect(
      withRenewalDeskQueryKeys({
        ...summary,
        lifecycle: projectLifecycleCategory({ ...base, retention: inWindow }),
      }).queryKeys.lifecycle,
    ).toBe("upcoming");
  });
});
