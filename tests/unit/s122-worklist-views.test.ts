import { describe, expect, it } from "vitest";

import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  applyRenewalDeskQueryV2,
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
  type PartyTokenMatcher,
  type RenewalDeskQueryV2State,
  type RenewalDeskV2Item,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  encodeDeskView,
  parseDeskViewState,
  validateDeskView,
} from "@/lib/lease-renewal/desk-view-continuation";
import {
  RENEWAL_DESK_WORKLIST_VIEWS,
  RENEWAL_DESK_WORKLIST_VIEW_LABELS,
  countRenewalDeskWorklistViews,
  currentRenewalDeskWorklistView,
  withRenewalDeskWorklistView,
} from "@/lib/lease-renewal/desk-worklist-views";
import type { LifecycleCategory } from "@/lib/lease-renewal/lifecycle-category";

// S122 (F01): the three worklist views are derived from the canonical query, never a second
// inventory. Values are synthetic; nothing here reads a provider or records anything.

const OWNER_TOKEN = `p1_${"a".repeat(43)}`;

function item(
  id: string,
  overrides: {
    endDateIso?: string | null;
    retention?: string;
    lifecycle?: LifecycleCategory;
    workStatus?: "complete_staff_status";
    address?: string;
    owners?: readonly string[];
  } = {},
): RenewalDeskV2Item {
  const endDateIso =
    overrides.endDateIso === undefined ? "2026-08-31" : overrides.endDateIso;
  const address = overrides.address ?? `${id} Main St`;
  return {
    id,
    queryKeys: {
      normalizedLeaseId: id.toLowerCase(),
      normalizedSearchText: address.toLowerCase(),
      endDateIso,
      endMonth: endDateIso ? endDateIso.slice(0, 7) : null,
      normalizedOwners: overrides.owners ?? ["owner alpha"],
      normalizedTenants: ["tenant alpha"],
      workflowStepId: null,
      workflowStepIndex: null,
      waitingOn: "not_waiting",
      dueState: "not_due",
      dueAtIso: null,
      sourceConflictCount: 0,
      leaseTerm: "fixed_term",
      nextReviewIso: null,
      ...(overrides.workStatus ? { workStatus: overrides.workStatus } : {}),
      ...(overrides.lifecycle ? { lifecycle: overrides.lifecycle } : {}),
    },
    identity: { address: { label: address }, property: null },
    retention: { state: overrides.retention ?? "window" },
    guidance: {
      currentBaseRent: 1500,
      rentVerification: { state: "verified" },
      overallStatus: "ready",
      urgencyRank: 3,
      isBlocked: false,
    },
  };
}

const matchOwner: PartyTokenMatcher = (token, kind, labels) =>
  kind === "owner" && token === OWNER_TOKEN && labels.includes("owner alpha");

describe("S122 explicit views and predictable defaults (AC-S122-2)", () => {
  it("keeps the active default, derives each view from the canonical query and preserves other filters", () => {
    const base: RenewalDeskQueryV2State = {
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
      lease: "Horizon",
      ownerKey: OWNER_TOKEN,
      sort: "end_date",
      direction: "desc",
    };
    expect(RENEWAL_DESK_WORKLIST_VIEWS).toEqual(["active", "all", "completed"]);
    expect(RENEWAL_DESK_WORKLIST_VIEW_LABELS).toEqual({
      active: "Active / upcoming",
      all: "All leases",
      completed: "Completed",
    });
    expect(currentRenewalDeskWorklistView(DEFAULT_RENEWAL_DESK_QUERY_V2)).toBe("active");
    expect(currentRenewalDeskWorklistView(base)).toBe("active");

    const all = withRenewalDeskWorklistView(base, "all");
    expect(all).toMatchObject({
      scope: "all",
      lifecycle: "all",
      lease: "Horizon",
      ownerKey: OWNER_TOKEN,
      sort: "end_date",
      direction: "desc",
    });
    expect(currentRenewalDeskWorklistView(all)).toBe("all");

    const completed = withRenewalDeskWorklistView(base, "completed");
    expect(completed).toMatchObject({
      scope: "all",
      lifecycle: "complete",
      lease: "Horizon",
      ownerKey: OWNER_TOKEN,
    });
    expect(currentRenewalDeskWorklistView(completed)).toBe("completed");

    // Leaving Completed drops only the completion filter it set; every other filter stays.
    expect(withRenewalDeskWorklistView(completed, "active")).toMatchObject({
      scope: "active",
      lifecycle: "all",
      lease: "Horizon",
      ownerKey: OWNER_TOKEN,
    });
    expect(withRenewalDeskWorklistView(completed, "all")).toMatchObject({
      scope: "all",
      lifecycle: "all",
    });
    // A lifecycle filter other than Complete is an ordinary filter and survives the switch.
    expect(
      withRenewalDeskWorklistView({ ...base, lifecycle: "upcoming" }, "all").lifecycle,
    ).toBe("upcoming");

    // Existing tracked and periodic-review bookmarks are neither view; they keep their scope.
    expect(currentRenewalDeskWorklistView({ ...base, scope: "tracked" })).toBeNull();
    expect(
      currentRenewalDeskWorklistView({ ...base, scope: "periodic_review" }),
    ).toBeNull();
    // A Complete lifecycle filter inside the active scope is the active view with a filter.
    expect(currentRenewalDeskWorklistView({ ...base, lifecycle: "complete" })).toBe(
      "active",
    );
  });

  it("selects Completed by the cycle-aware category only, never by a staff label or unfinished acceptance", () => {
    const rows = [
      item("done-outside", {
        endDateIso: "2026-03-31",
        retention: "outside",
        lifecycle: "complete",
      }),
      item("accepted-unsigned", { retention: "window", lifecycle: "in_progress" }),
      item("staff-label-only", {
        retention: "window",
        lifecycle: "upcoming",
        workStatus: "complete_staff_status",
      }),
      item("uncategorized", { retention: "window" }),
    ];
    const completed = applyRenewalDeskQueryV2(
      rows,
      withRenewalDeskWorklistView(DEFAULT_RENEWAL_DESK_QUERY_V2, "completed"),
      matchOwner,
    );
    expect(completed.items.map((row) => row.id)).toEqual(["done-outside"]);
    expect(completed.totalInScope).toBe(4);
    expect(completed.totalLoaded).toBe(4);

    // The active default hides the completed lease outside the window; All leases shows it.
    const active = applyRenewalDeskQueryV2(
      rows,
      DEFAULT_RENEWAL_DESK_QUERY_V2,
      matchOwner,
    );
    expect(active.items.map((row) => row.id)).toEqual([
      "accepted-unsigned",
      "staff-label-only",
      "uncategorized",
    ]);
    const all = applyRenewalDeskQueryV2(
      rows,
      withRenewalDeskWorklistView(DEFAULT_RENEWAL_DESK_QUERY_V2, "all"),
      matchOwner,
    );
    expect(all.items).toHaveLength(4);
  });
});

describe("S122 filters and counts explain exclusions (AC-S122-3)", () => {
  it("yields an explained empty active result for a future-year location query and finds the lease under All leases", () => {
    const rows = [
      item("future-2029", {
        endDateIso: "2029-03-31",
        retention: "outside",
        lifecycle: "later",
        address: "77 Horizon Way",
      }),
      item("window-1", { address: "12 Maple Ct", lifecycle: "upcoming" }),
      item("other-owner", {
        address: "9 Horizon Way",
        owners: ["owner beta"],
        lifecycle: "upcoming",
      }),
    ];
    const query: RenewalDeskQueryV2State = {
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
      lease: "Horizon",
      ownerKey: OWNER_TOKEN,
    };
    const active = applyRenewalDeskQueryV2(rows, query, matchOwner);
    expect(active.totalLoaded).toBe(3);
    expect(active.totalInScope).toBe(2);
    expect(active.totalMatching).toBe(0);

    const widened = withRenewalDeskWorklistView(query, "all");
    const all = applyRenewalDeskQueryV2(rows, widened, matchOwner);
    expect(all.items.map((row) => row.id)).toEqual(["future-2029"]);
    expect(all.totalInScope).toBe(3);

    // Per-view counts use the same query and the same actor-scoped matcher, so they reconcile
    // with the rows each view would show.
    expect(countRenewalDeskWorklistViews(rows, query, matchOwner)).toEqual({
      active: 0,
      all: 1,
      completed: 0,
    });
    const noOwnerMatch: PartyTokenMatcher = () => false;
    expect(countRenewalDeskWorklistViews(rows, query, noOwnerMatch)).toEqual({
      active: 0,
      all: 0,
      completed: 0,
    });
  });
});

describe("S122 navigation and chronological behavior (AC-S122-5)", () => {
  it("round-trips a filtered, reverse-date-sorted All leases view and falls back on malformed values", () => {
    const state = withRenewalDeskWorklistView(
      {
        ...DEFAULT_RENEWAL_DESK_QUERY_V2,
        lease: "Horizon",
        sort: "end_date",
        direction: "desc",
      },
      "all",
    );
    const deskView = encodeDeskView(state);
    if (!deskView) throw new Error("Expected a nondefault deskView.");
    expect(validateDeskView(deskView)).toBe(deskView);
    const restored = parseDeskViewState(deskView);
    expect(serializeRenewalDeskQueryV2(restored)).toBe(
      serializeRenewalDeskQueryV2(state),
    );
    expect(currentRenewalDeskWorklistView(restored)).toBe("all");

    const completed = withRenewalDeskWorklistView(state, "completed");
    const completedView = encodeDeskView(completed);
    if (!completedView) throw new Error("Expected a nondefault deskView.");
    expect(currentRenewalDeskWorklistView(parseDeskViewState(completedView))).toBe(
      "completed",
    );

    // Unknown scope or lifecycle values fall back to the defaults without widening anything.
    const malformed = parseRenewalDeskQueryV2(
      new URLSearchParams(
        "v=2&scope=archive&lifecycle=done&sort=end_date&direction=desc",
      ),
    );
    expect(malformed.scope).toBe("active");
    expect(malformed.lifecycle).toBe("all");
    expect(currentRenewalDeskWorklistView(malformed)).toBe("active");
    expect(validateDeskView("v=2&scope=archive")).toBeNull();

    // Unknown dates stay explicit and sort last in either direction.
    const rows = [
      item("unknown-date", {
        endDateIso: null,
        retention: "outside",
        lifecycle: "unknown",
      }),
      item("far", { endDateIso: "2029-03-31", retention: "outside", lifecycle: "later" }),
      item("near", { endDateIso: "2026-08-31", lifecycle: "upcoming" }),
    ];
    const sorted = applyRenewalDeskQueryV2(
      rows,
      {
        ...withRenewalDeskWorklistView(DEFAULT_RENEWAL_DESK_QUERY_V2, "all"),
        sort: "end_date",
        direction: "desc",
      },
      matchOwner,
    );
    expect(sorted.items.map((row) => row.id)).toEqual(["far", "near", "unknown-date"]);
  });
});
