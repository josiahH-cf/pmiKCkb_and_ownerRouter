import { describe, expect, it } from "vitest";

import { can } from "@/lib/auth/roles";
import { ROLES } from "@/lib/constants";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  hasRenewalRoleAuthority,
  renewalRoleCapability,
} from "@/lib/lease-renewal/role-action-governance";
import {
  projectRenewalActions,
  type RenewalAction,
  type RenewalActionProjection,
} from "@/lib/lease-renewal/renewal-actions";
import {
  MANUAL_ACTIVITIES,
  MANUAL_REQUIRED_RENEWAL,
  emptyRenewalWorkspace,
  manualActivitySatisfied,
  manualRenewalSummary,
  planRenewalWorkspaceAction,
  type ManualActivity,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { FIXTURE_CYCLE_ID, actionFixture } from "@/tests/helpers/renewal-action-fixtures";

// S145 (ARCH-S145-1, AC-S145-1): the Focus projection checked against the owning server rules over
// states the real planner reaches, not over hand-written labels. Seeded walks apply actual planner
// actions (in order, out of order, reversed, revised and declined); after every accepted record the
// projection must agree with the planner's completion and not-applicable checks, the manual lane's
// satisfaction predicate and the workspace route's role guard. A new cycle never revives the old
// one, and independent ready work can be recorded in any order.

const ACTIVITIES = Object.keys(MANUAL_ACTIVITIES) as ManualActivity[];
const WORKSPACE_ROUTE = "/api/lease-renewal/workspace";

function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let event = 0;
function meta() {
  event += 1;
  return {
    actorUid: "fixture-staff",
    recordedAt: "2026-09-30T17:00:00.000Z",
    eventId: `00000000-0000-4000-8000-${String(event).padStart(12, "0")}`,
  };
}

/** The planner's answer: the next state, or the refusal it raises. */
function plan(state: RenewalWorkspaceState, action: RenewalWorkspaceAction) {
  try {
    return {
      accepted: true as const,
      state: planRenewalWorkspaceAction(state, action, meta()),
    };
  } catch (error) {
    expect(error).toBeInstanceOf(EditableLayerError);
    return { accepted: false as const, error: error as EditableLayerError };
  }
}

const snapshotFor = (role: (typeof ROLES)[number]) =>
  actionFixture({ manual: null, role }).snapshot;
const SNAPSHOTS = Object.fromEntries(ROLES.map((role) => [role, snapshotFor(role)]));

function project(
  state: RenewalWorkspaceState | null,
  role: (typeof ROLES)[number] = "Editor",
) {
  return projectRenewalActions(SNAPSHOTS[role]!, { readable: true, state });
}

const byId = (projection: RenewalActionProjection, id: string) =>
  projection.actions.find((action) => action.id === id);

function terms(rent: number) {
  return { rent, effectiveDate: "2027-01-01", endDate: "2027-12-31" };
}

/** Every record the staff lane can submit, including out-of-order and reversing ones. */
function candidates(state: RenewalWorkspaceState): RenewalWorkspaceAction[] {
  const list: RenewalWorkspaceAction[] = [];
  for (const activity of ACTIVITIES) {
    list.push({
      kind: "activity",
      activity,
      outcome: "done",
      source: `Staff ${activity}`,
    });
    if (MANUAL_ACTIVITIES[activity].conditional)
      list.push({
        kind: "activity",
        activity,
        outcome: "not_applicable",
        source: `Staff ${activity}`,
        reason: "The lease carries no such obligation",
        applicabilityPolicy: "Applicability rule v1",
      });
  }
  list.push(
    {
      kind: "activity",
      activity: "tenant_offer",
      outcome: "waiting",
      source: "Staff note",
    },
    {
      kind: "activity",
      activity: "documents",
      outcome: "not_started",
      source: "Staff note",
    },
    {
      kind: "owner_response",
      outcome: "approved_terms",
      terms: terms(state.termsRevision % 2 ? 1425 : 1450),
      source: "Owner email",
    },
    { kind: "owner_response", outcome: "revision_requested", source: "Owner email" },
    { kind: "owner_response", outcome: "declined_non_renewal", source: "Owner email" },
    { kind: "tenant_response", outcome: "accepted", source: "Tenant email" },
    {
      kind: "tenant_response",
      outcome: "counter_change_requested",
      source: "Tenant email",
    },
    { kind: "tenant_response", outcome: "declined_nonrenewing", source: "Tenant email" },
    { kind: "tenant_response", outcome: "needs_verification", source: "Tenant email" },
    { kind: "complete", source: "Staff reviewed the checklist" },
    { kind: "reopen", source: "Staff reopened completion" },
  );
  return list;
}

/**
 * The record the Focus pane's revealed control submits for a manual action. An owner response
 * answers the current state: new exact terms when terms are already on record (a counter is only
 * cleared by a changed response, as the planner and the manual summary already define).
 */
function recordFor(
  action: RenewalAction,
  state: RenewalWorkspaceState,
): RenewalWorkspaceAction | null {
  const key = action.ref.key;
  if (key === "complete")
    return { kind: "complete", source: "Staff reviewed the checklist" };
  if (key === "owner_response")
    return {
      kind: "owner_response",
      outcome: "approved_terms",
      terms: terms(state.ownerResponse?.terms?.rent === 1450 ? 1475 : 1450),
      source: "Owner email",
    };
  if (key === "tenant_response")
    return { kind: "tenant_response", outcome: "accepted", source: "Tenant email" };
  if (key in MANUAL_ACTIVITIES)
    return {
      kind: "activity",
      activity: key as ManualActivity,
      outcome: "done",
      source: "Staff",
    };
  return null;
}

const manualActions = (projection: RenewalActionProjection) =>
  projection.actions.filter((action) => action.id.startsWith("manual."));

/** The invariants every reachable state must hold. */
function checkState(state: RenewalWorkspaceState, trail: string) {
  const projection = project(state);
  const summary = manualRenewalSummary(state);
  const context = `${trail} -> next ${summary.nextActivity}`;

  // Completion: the pane offers it exactly when the planner accepts it, and the lease reads as
  // complete only from the staff completion record for the current terms.
  // (Re-recording an existing completion is accepted and changes nothing the pane reads.)
  const completeAccepted = plan(state, {
    kind: "complete",
    source: "Staff check",
  }).accepted;
  const completeStatus = byId(projection, "manual.complete")?.status ?? "";
  expect(["ready_for_actor", "complete"].includes(completeStatus), context).toBe(
    completeAccepted,
  );
  expect(completeStatus === "complete", context).toBe(summary.complete);
  expect(projection.outcome.state === "complete_recorded_by_staff", context).toBe(
    summary.complete,
  );
  if (summary.complete) expect(projection.primaryActionId, context).toBeNull();

  for (const action of manualActions(projection)) {
    const key = action.ref.key;
    expect(action.ref.cycleId, context).toBe(state.cycleId);
    expect(action.control?.routes, context).toEqual([WORKSPACE_ROUTE]);
    if (key in MANUAL_ACTIVITIES) {
      const activity = key as ManualActivity;
      // A reported completion is the manual lane's own satisfaction predicate.
      if (action.status === "complete")
        expect(manualActivitySatisfied(state, activity), `${context} ${key}`).toBe(true);
      if (manualActivitySatisfied(state, activity))
        expect(["complete", "not_applicable"], `${context} ${key}`).toContain(
          action.status,
        );
      // Not applicable is offered exactly where the planner permits it.
      const waiver = plan(state, {
        kind: "activity",
        activity,
        outcome: "not_applicable",
        source: "Staff",
        reason: "The lease carries no such obligation",
        applicabilityPolicy: "Applicability rule v1",
      });
      expect(waiver.accepted, `${context} ${key}`).toBe(
        MANUAL_ACTIVITIES[activity].conditional,
      );
      expect(action.evidence.includes("Not applicable"), `${context} ${key}`).toBe(
        MANUAL_ACTIVITIES[activity].conditional,
      );
    }
    // Whatever the pane offers as ready, the server accepts, and the readback then shows the
    // owning evidence for that action.
    if (action.status === "ready_for_actor" || action.status === "waiting") {
      const record = recordFor(action, state);
      if (!record) continue;
      const result = plan(state, record);
      expect(result.accepted, `${context} ${action.id}`).toBe(true);
      if (result.accepted && action.status === "ready_for_actor") {
        const after = byId(project(result.state), action.id);
        if (key === "complete")
          expect(project(result.state).outcome.state, context).toBe(
            "complete_recorded_by_staff",
          );
        else expect(after?.status, `${context} ${action.id}`).toBe("complete");
      }
    }
  }

  // The only diagnostic a reachable staff record can raise is the recorded branch conflict.
  for (const diagnostic of projection.diagnostics)
    expect(diagnostic, context).toMatchObject({
      kind: "impossible_condition",
      node: "manual.branch_conflict",
    });
  return projection;
}

function walk(seed: number, steps: number) {
  const random = rng(seed);
  let state = emptyRenewalWorkspace("lease-318-cedar-7", FIXTURE_CYCLE_ID, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
  const seen: string[] = [];
  const trail: string[] = [`seed ${seed}`];
  checkState(state, trail.join(" "));
  for (let step = 0; step < steps; step += 1) {
    const projection = project(state);
    const ready = manualActions(projection).filter(
      (action) => action.status === "ready_for_actor" && recordFor(action, state),
    );
    // Mostly follow the pane, sometimes record anything the server accepts.
    const chosen =
      ready.length > 0 && random() < 0.65
        ? ready[Math.floor(random() * ready.length)]!
        : null;
    const action = chosen
      ? recordFor(chosen, state)!
      : candidates(state)[Math.floor(random() * candidates(state).length)]!;
    const result = plan(state, action);
    if (!result.accepted) continue;
    if (chosen) seen.push(chosen.ref.key);
    state = result.state;
    trail.push(
      `${action.kind}${"activity" in action ? `:${action.activity}` : ""}${"outcome" in action ? `=${action.outcome}` : ""}`,
    );
    checkState(state, trail.join(" "));
  }
  return { state, seen };
}

describe(
  "S145 Focus projection against the owning server rules",
  { timeout: 120_000 },
  () => {
    it("agrees with the planner, the satisfaction predicate and completion over reachable states", () => {
      const reached = new Set<string>();
      let completed = 0;
      let nonRenewal = 0;
      for (let seed = 1; seed <= 60; seed += 1) {
        const { state, seen } = walk(seed, 40);
        for (const next of seen) reached.add(next);
        if (manualRenewalSummary(state).complete) completed += 1;
        if (manualRenewalSummary(state).nonRenewal) nonRenewal += 1;
      }
      // Every action of both branches was offered as ready in the pane and its record accepted.
      for (const next of [
        "owner_response",
        "tenant_response",
        "non_renewal_handoff",
        "complete",
        ...MANUAL_REQUIRED_RENEWAL,
      ])
        expect(reached, next).toContain(next);
      expect(completed).toBeGreaterThan(0);
      expect(nonRenewal).toBeGreaterThan(0);
    });

    it("matches the workspace route role guard for every role", () => {
      const state = planRenewalWorkspaceAction(
        emptyRenewalWorkspace("lease-318-cedar-7", FIXTURE_CYCLE_ID, {
          kind: "lease_end",
          dateIso: "2026-12-31",
          source: "RentVine lease end",
        }),
        {
          kind: "activity",
          activity: "owner_outreach",
          outcome: "done",
          source: "Staff",
        },
        meta(),
      );
      for (const role of ROLES) {
        const projection = project(state, role);
        // The workspace route guard: requireCapabilityInSpace(renewalRoleCapability(...)).
        const routeAllows = can(role, renewalRoleCapability("save_renewal_progress"));
        for (const action of manualActions(projection)) {
          if (!["ready_for_actor", "ready_for_other_actor"].includes(action.status))
            continue;
          expect(action.status === "ready_for_actor", `${role} ${action.id}`).toBe(
            routeAllows,
          );
        }
        for (const action of projection.actions) {
          if (!action.control) continue;
          if (!["ready_for_actor", "ready_for_other_actor"].includes(action.status))
            continue;
          expect(action.status === "ready_for_actor", `${role} ${action.id}`).toBe(
            hasRenewalRoleAuthority(action.control.capability, role),
          );
        }
      }
    });

    it("records independent ready work in any order with the same result", () => {
      let accepted = emptyRenewalWorkspace("lease-318-cedar-7", FIXTURE_CYCLE_ID, {
        kind: "lease_end",
        dateIso: "2026-12-31",
        source: "RentVine lease end",
      });
      for (const action of [
        {
          kind: "activity",
          activity: "owner_outreach",
          outcome: "done",
          source: "Staff",
        },
        {
          kind: "owner_response",
          outcome: "approved_terms",
          terms: terms(1450),
          source: "Owner",
        },
        { kind: "activity", activity: "tenant_offer", outcome: "done", source: "Staff" },
        { kind: "tenant_response", outcome: "accepted", source: "Tenant" },
      ] as RenewalWorkspaceAction[])
        accepted = planRenewalWorkspaceAction(accepted, action, meta());
      const ready = manualActions(project(accepted))
        .filter(
          (action) =>
            action.status === "ready_for_actor" && action.ref.key in MANUAL_ACTIVITIES,
        )
        .map((action) => action.ref.key as ManualActivity);
      expect(ready.length).toBeGreaterThan(1);
      const random = rng(145);
      const outcomes = new Set<string>();
      for (let round = 0; round < 6; round += 1) {
        const order = [...ready].sort(() => random() - 0.5);
        let state = accepted;
        for (const [index, activity] of order.entries()) {
          const before = manualActions(project(state));
          state = planRenewalWorkspaceAction(
            state,
            { kind: "activity", activity, outcome: "done", source: "Staff" },
            meta(),
          );
          const after = manualActions(project(state));
          const changed = before
            .filter((a) => after.find((b) => b.id === a.id)?.status !== a.status)
            .map((a) => a.id);
          expect(changed.filter((id) => id !== "manual.complete")).toEqual([
            `manual.${activity}`,
          ]);
          expect(
            byId(project(state), "manual.complete")?.status === "ready_for_actor",
          ).toBe(index === order.length - 1);
        }
        outcomes.add(
          JSON.stringify(
            manualActions(project(state)).map((action) => [action.id, action.status]),
          ),
        );
      }
      expect(outcomes.size).toBe(1);
    });

    it("keeps a tenant counter standing when the owner response is re-recorded unchanged", () => {
      let state = emptyRenewalWorkspace("lease-318-cedar-7", FIXTURE_CYCLE_ID, {
        kind: "lease_end",
        dateIso: "2026-12-31",
        source: "RentVine lease end",
      });
      const approve = {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: terms(1450),
        source: "Owner email",
      } as const;
      for (const action of [
        {
          kind: "activity",
          activity: "owner_outreach",
          outcome: "done",
          source: "Staff",
        },
        approve,
        { kind: "activity", activity: "tenant_offer", outcome: "done", source: "Staff" },
        {
          kind: "tenant_response",
          outcome: "counter_change_requested",
          source: "Tenant",
        },
      ] as RenewalWorkspaceAction[])
        state = planRenewalWorkspaceAction(state, action, meta());
      expect(project(state).headlineActionId).toBe("manual.owner_response");
      // The planner accepts the identical response but keeps the terms revision, so the counter is
      // still current: the manual summary and the pane both keep the owner response outstanding.
      const unchanged = planRenewalWorkspaceAction(state, approve, meta());
      expect(unchanged.termsRevision).toBe(state.termsRevision);
      expect(manualRenewalSummary(unchanged).nextActivity).toBe("owner_response");
      expect(byId(project(unchanged), "manual.owner_response")?.status).toBe(
        "ready_for_actor",
      );
      expect(byId(project(unchanged), "manual.tenant_response")?.status).toBe(
        "dependency_blocked",
      );
    });

    it("starts a new cycle without reviving the earlier cycle's records", () => {
      const { state: earlier } = walk(7, 30);
      const fresh = emptyRenewalWorkspace(
        "lease-318-cedar-7",
        "1f6b7f43-3f9f-4c2a-9a59-6f0c3c1d2e10",
        {
          kind: "lease_end",
          dateIso: "2027-12-31",
          source: "RentVine lease end",
        },
      );
      const projection = project(fresh);
      expect(projection.cycleId).toBe(fresh.cycleId);
      expect(projection.cycleId).not.toBe(earlier.cycleId);
      expect(
        new Set(manualActions(projection).map((action) => action.ref.cycleId)),
      ).toEqual(new Set([fresh.cycleId]));
      expect(projection.primaryActionId).toBe("manual.owner_outreach");
      // Only the new cycle itself is on record; no earlier completion carries over.
      expect(
        manualActions(projection)
          .filter((action) => action.status === "complete")
          .map((action) => action.id),
      ).toEqual(["manual.cycle"]);
    });
  },
);
