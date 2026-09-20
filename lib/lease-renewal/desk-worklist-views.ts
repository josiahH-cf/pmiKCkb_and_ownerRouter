import {
  applyRenewalDeskQueryV2,
  type PartyTokenMatcher,
  type RenewalDeskQueryV2State,
  type RenewalDeskV2Item,
} from "@/lib/lease-renewal/desk-query-v2";

/**
 * S122 (F01): the three obvious worklist views are derived from the one canonical desk query and
 * never from a second inventory. Active / upcoming is the existing `scope=active` default (the
 * current window, due periodic reviews and retained work); All leases is `scope=all`; Completed
 * is All leases plus the S134 cycle-aware `lifecycle=complete` category, so a completed cycle
 * outside the window stays reachable and a bare staff-status label never counts as completion.
 * Existing tracked and periodic-review bookmarks are neither view and keep their scope. Selecting
 * a view changes only the scope and the completion filter; every other filter and the sort stay.
 */
export const RENEWAL_DESK_WORKLIST_VIEWS = ["active", "all", "completed"] as const;
export type RenewalDeskWorklistView = (typeof RENEWAL_DESK_WORKLIST_VIEWS)[number];

export const RENEWAL_DESK_WORKLIST_VIEW_LABELS: Record<RenewalDeskWorklistView, string> =
  {
    active: "Active / upcoming",
    all: "All leases",
    completed: "Completed",
  };

export const RENEWAL_DESK_WORKLIST_VIEW_CONTROL_LABEL = "Worklist views";

/** The view a query state expresses, or null for a tracked or periodic-review bookmark. */
export function currentRenewalDeskWorklistView(
  state: RenewalDeskQueryV2State,
): RenewalDeskWorklistView | null {
  if (state.scope === "all") return state.lifecycle === "complete" ? "completed" : "all";
  if (state.scope === "active") return "active";
  return null;
}

/** The same query with only the scope and the completion filter changed for the chosen view. */
export function withRenewalDeskWorklistView(
  state: RenewalDeskQueryV2State,
  view: RenewalDeskWorklistView,
): RenewalDeskQueryV2State {
  const lifecycle =
    view === "completed"
      ? "complete"
      : state.lifecycle === "complete"
        ? "all"
        : state.lifecycle;
  return { ...state, scope: view === "active" ? "active" : "all", lifecycle };
}

export type RenewalDeskWorklistViewCounts = Readonly<
  Record<RenewalDeskWorklistView, number>
>;

/**
 * How many loaded leases each view would show under the current filters, from the same
 * authorized projection and the same actor-scoped party matcher as the table itself.
 */
export function countRenewalDeskWorklistViews(
  items: readonly RenewalDeskV2Item[],
  state: RenewalDeskQueryV2State,
  matchParty: PartyTokenMatcher,
): RenewalDeskWorklistViewCounts {
  const counts = {} as Record<RenewalDeskWorklistView, number>;
  for (const view of RENEWAL_DESK_WORKLIST_VIEWS) {
    counts[view] = applyRenewalDeskQueryV2(
      items,
      withRenewalDeskWorklistView(state, view),
      matchParty,
    ).totalMatching;
  }
  return counts;
}
