import { describe, expect, it } from "vitest";

import {
  projectRenewalActions,
  renewalGuidanceActionId,
  selectRenewalAction,
  type RenewalActionProjection,
} from "@/lib/lease-renewal/renewal-actions";
import {
  planRenewalWorkspaceAction,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import type { RentChargeOutcomeRow } from "@/lib/lease-renewal/rent-charge-outcomes";
import {
  AFTER_ACCEPTANCE,
  actionFixture,
  manualFixture,
} from "@/tests/helpers/renewal-action-fixtures";

// S142 (ARCH-S142-1, BEH-S142-1, BEH-S142-2, AC-S142-1..3): the renewal action projection over
// the real staff-recorded lane, S72 verification substeps, S127 guidance and S117 outcomes.

function project(options: Parameters<typeof actionFixture>[0] = {}) {
  return projectRenewalActions(actionFixture(options).snapshot);
}

function status(projection: RenewalActionProjection, id: string) {
  return projection.actions.find((action) => action.id === id)?.status;
}

function action(projection: RenewalActionProjection, id: string) {
  const found = projection.actions.find((entry) => entry.id === id);
  expect(found, id).toBeDefined();
  return found!;
}

function ready(projection: RenewalActionProjection) {
  return projection.actions
    .filter((entry) => entry.status === "ready_for_actor")
    .map((entry) => entry.id);
}

function save(state: RenewalWorkspaceState, raw: RenewalWorkspaceAction) {
  return planRenewalWorkspaceAction(state, raw, {
    actorUid: "fixture-staff",
    recordedAt: "2026-09-30T12:00:00.000Z",
    eventId: "00000000-0000-4000-8000-000000000009",
  });
}

describe("S142 renewal action projection", () => {
  it("follows the guidance without a cycle and blocks staff work behind the reviewed cycle", () => {
    const { snapshot } = actionFixture({ manual: null });
    const projection = projectRenewalActions(snapshot);
    expect(projection.lane).toBe("process");
    // The sample lease still has an open recipient check; the guidance names it first.
    expect(projection.headlineActionId).toBe(renewalGuidanceActionId(snapshot));
    expect(projection.headlineActionId).toBe("evidence.confirm-renewal-recipients");
    expect(
      action(projection, "evidence.confirm-renewal-recipients").control?.handoff,
    ).toBe("external");
    expect(status(projection, "manual.cycle")).toBe("ready_for_actor");
    const recipientsVerified = projectRenewalActions({
      ...snapshot,
      process: {
        ...snapshot.process!,
        verify: snapshot.process!.verify.map((substep) => ({
          ...substep,
          state: "complete" as const,
        })),
      },
      // Verified facts move the process guidance to the owner phase, which this dashboard records
      // only through the staff lane.
      guidance: {
        ...snapshot.guidance,
        kind: "act",
        stepId: "owner-decision",
        substepId: "retrieve-market-evidence",
        label: "Run the governed reference-comp lookup for this exact lease.",
      },
    });
    expect(recipientsVerified.headlineActionId).toBe("process.guidance");
    expect(action(recipientsVerified, "process.guidance")).toMatchObject({
      status: "unresolved",
      reason: "no_control",
    });
    expect(recipientsVerified.primaryActionId).toBe("manual.cycle");
    expect(action(projection, "manual.owner_outreach")).toMatchObject({
      status: "dependency_blocked",
      blockedBy: ["manual.cycle"],
      resolvableVia: ["manual.cycle"],
    });
    expect(projection.outcome).toEqual({
      state: "in_progress",
      label: "Manual work not recorded",
    });
  });

  it("starts a fresh cycle at owner outreach with comp preparation as optional work", () => {
    const projection = project({ manual: manualFixture() });
    expect(projection.lane).toBe("manual");
    expect(projection.headlineActionId).toBe("manual.owner_outreach");
    expect(projection.primaryActionId).toBe("manual.owner_outreach");
    expect(action(projection, "manual.preparation")).toMatchObject({
      requirement: "optional",
      status: "ready_for_actor",
    });
    expect(status(projection, "manual.owner_response")).toBe("dependency_blocked");
    expect(action(projection, "manual.owner_outreach").ref).toEqual({
      leaseId: "lease-318-cedar-7",
      cycleId: "b4bc3b81-c402-4f62-a2e2-c605c67867fb",
      key: "owner_outreach",
    });
  });

  it("waits on the owner after outreach and returns the response to staff on a revision", () => {
    const waiting = project({ manual: manualFixture({ done: ["owner_outreach"] }) });
    expect(action(waiting, "manual.owner_response")).toMatchObject({
      status: "waiting",
      waitingOn: "the owner",
    });
    expect(waiting.primaryActionId).toBeNull();
    expect(waiting.headlineActionId).toBe("manual.owner_response");
    expect(selectRenewalAction(waiting, null)).toBe("manual.owner_response");
    const revision = project({
      manual: manualFixture({ owner: "revision_requested", done: ["owner_outreach"] }),
    });
    expect(action(revision, "manual.owner_response")).toMatchObject({
      status: "ready_for_actor",
      detail: "The owner requested a revision.",
    });
  });

  it("offers the approved terms to the tenant, then waits on the tenant", () => {
    const approved = project({
      manual: manualFixture({ owner: "approved_terms", done: ["owner_outreach"] }),
    });
    expect(approved.primaryActionId).toBe("manual.tenant_offer");
    const offered = project({
      manual: manualFixture({
        owner: "approved_terms",
        done: ["owner_outreach", "tenant_offer"],
        tenant: "awaiting_response",
      }),
    });
    expect(action(offered, "manual.tenant_response")).toMatchObject({
      status: "waiting",
      waitingOn: "the tenant",
    });
  });

  it("readies every independent post-acceptance activity at once", () => {
    const projection = project({
      manual: manualFixture({
        owner: "approved_terms",
        tenant: "accepted",
        done: ["owner_outreach", "tenant_offer"],
      }),
    });
    for (const key of AFTER_ACCEPTANCE)
      expect(status(projection, `manual.${key}`), key).toBe("ready_for_actor");
    expect(projection.primaryActionId).toBe("manual.information_form");
    expect(status(projection, "manual.complete")).toBe("dependency_blocked");
  });

  it("keeps two joins blocked after the first shared prerequisite save and readies them after the second", () => {
    // Owner approval and the tenant acceptance are on record, but both the outreach and the offer
    // records are missing: every post-acceptance activity needs both.
    let state = manualFixture({ owner: "approved_terms", tenant: "accepted" });
    let projection = project({ manual: state });
    expect(action(projection, "manual.documents").blockedBy).toEqual([
      "manual.owner_outreach",
      "manual.tenant_offer",
    ]);
    state = save(state, {
      kind: "activity",
      activity: "owner_outreach",
      outcome: "done",
      source: "Owner call",
    });
    projection = project({ manual: state });
    expect(action(projection, "manual.documents")).toMatchObject({
      status: "dependency_blocked",
      blockedBy: ["manual.tenant_offer"],
    });
    expect(status(projection, "manual.signatures")).toBe("dependency_blocked");
    state = save(state, {
      kind: "activity",
      activity: "tenant_offer",
      outcome: "done",
      source: "Offer email",
    });
    projection = project({ manual: state });
    expect(status(projection, "manual.documents")).toBe("ready_for_actor");
    expect(status(projection, "manual.signatures")).toBe("ready_for_actor");
  });

  it("counts a permitted Not applicable and refuses an unsupported one", () => {
    const permitted = project({
      manual: manualFixture({
        owner: "approved_terms",
        tenant: "accepted",
        done: ["owner_outreach", "tenant_offer"],
        notApplicable: ["rhino"],
      }),
    });
    expect(status(permitted, "manual.rhino")).toBe("complete");
    const state = manualFixture({
      owner: "approved_terms",
      tenant: "accepted",
      done: ["owner_outreach", "tenant_offer"],
    });
    state.activities.rhino = {
      eventId: "00000000-0000-4000-8000-000000000002",
      actorUid: "fixture-staff",
      recordedAt: "2026-09-30T12:00:00.000Z",
      source: "Fixture",
      termsRevision: 1,
      reason: "No Rhino policy",
      outcome: "not_applicable",
    };
    expect(status(project({ manual: state }), "manual.rhino")).toBe("ready_for_actor");
  });

  it("uses the staff completion record, never an empty list, for completion", () => {
    const all = ["owner_outreach", "tenant_offer", ...AFTER_ACCEPTANCE] as const;
    const ready = project({
      manual: manualFixture({ owner: "approved_terms", tenant: "accepted", done: all }),
    });
    expect(ready.headlineActionId).toBe("manual.complete");
    expect(ready.primaryActionId).toBe("manual.complete");
    expect(ready.outcome.state).toBe("in_progress");
    const complete = project({
      manual: manualFixture({
        owner: "approved_terms",
        tenant: "accepted",
        done: all,
        completion: true,
      }),
    });
    expect(complete.outcome).toEqual({
      state: "complete_recorded_by_staff",
      label: "Completed: recorded by staff",
    });
    expect(complete.headlineActionId).toBeNull();
    expect(complete.primaryActionId).toBeNull();
  });

  it("reopens the owner response for a tenant counter and blocks the tenant answer behind it", () => {
    const projection = project({
      manual: manualFixture({
        owner: "approved_terms",
        tenant: "counter_change_requested",
        done: ["owner_outreach", "tenant_offer"],
      }),
    });
    expect(projection.headlineActionId).toBe("manual.owner_response");
    expect(action(projection, "manual.owner_response")).toMatchObject({
      status: "ready_for_actor",
      detail: "The tenant requested a change to the current terms.",
    });
    expect(action(projection, "manual.tenant_response")).toMatchObject({
      status: "dependency_blocked",
      blockedBy: ["manual.owner_response"],
    });
  });

  it("takes either party's decline to the non-renewal handoff without phantom renewal work", () => {
    for (const fixture of [
      manualFixture({ owner: "declined_non_renewal", done: ["owner_outreach"] }),
      manualFixture({
        owner: "approved_terms",
        tenant: "declined_nonrenewing",
        done: ["owner_outreach", "tenant_offer"],
      }),
    ]) {
      const projection = project({ manual: fixture });
      expect(projection.headlineActionId).toBe("manual.non_renewal_handoff");
      for (const key of AFTER_ACCEPTANCE)
        expect(status(projection, `manual.${key}`), key).toBe("not_applicable");
      expect(status(projection, "manual.complete")).toBe("dependency_blocked");
      const handedOff = project({
        manual: {
          ...fixture,
          activities: {
            ...fixture.activities,
            non_renewal_handoff: {
              eventId: "00000000-0000-4000-8000-000000000003",
              actorUid: "fixture-staff",
              recordedAt: "2026-09-30T12:00:00.000Z",
              source: "Handoff note",
              termsRevision: fixture.termsRevision,
              outcome: "done",
            },
          },
        },
      });
      expect(handedOff.primaryActionId).toBe("manual.complete");
    }
  });

  it("diagnoses an owner decline recorded beside a tenant acceptance", () => {
    const projection = project({
      manual: manualFixture({
        owner: "declined_non_renewal",
        tenant: "accepted",
        done: ["owner_outreach"],
        termsRevision: 1,
      }),
    });
    expect(action(projection, "manual.branch_conflict")).toMatchObject({
      status: "unresolved",
      reason: "impossible_condition",
    });
    expect(projection.diagnostics).toContainEqual({
      kind: "impossible_condition",
      node: "manual.branch_conflict",
      conditions: ["One consistent owner and tenant outcome"],
    });
    // The summary's existing precedence still holds: a decline leads to the handoff.
    expect(projection.headlineActionId).toBe("manual.non_renewal_handoff");
  });

  it("reopens only the terms-dependent work when the approved terms change", () => {
    const projection = project({
      manual: manualFixture({
        owner: "approved_terms",
        tenant: "accepted",
        termsRevision: 2,
        done: ["owner_outreach", "information_form", "form_returned"],
        stale: ["tenant_offer", "documents"],
      }),
    });
    expect(status(projection, "manual.tenant_offer")).toBe("ready_for_actor");
    expect(status(projection, "manual.information_form")).toBe("complete");
    expect(status(projection, "manual.form_returned")).toBe("complete");
    expect(status(projection, "manual.documents")).toBe("dependency_blocked");
  });

  it("separates this actor, another authorized actor and a waiting provider effect", () => {
    const rows: RentChargeOutcomeRow[] = [
      {
        id: "rentvine:prepared",
        destination: "rentvine",
        intent: "future",
        label: "RentVine lease renewal dates",
        state: "prepared",
        stateLabel: "Prepared, awaiting Admin confirmation",
        detail: "Renewal dates from the approved terms.",
        anchor: "#rentvine-updates-title",
        attention: true,
      },
      {
        id: "rentvine:running",
        destination: "rentvine",
        intent: "current",
        label: "RentVine recurring charge update",
        state: "running",
        stateLabel: "Awaiting a durable outcome",
        detail: "Charge update in flight.",
        anchor: "#rentvine-updates-title",
        attention: true,
      },
      {
        id: "rentvine:ambiguous",
        destination: "rentvine",
        intent: "current",
        label: "RentVine recurring charge create",
        state: "ambiguous",
        stateLabel: "Needs reconciliation",
        detail: "Outcome unknown.",
        anchor: "#rentvine-updates-title",
        attention: true,
      },
    ];
    const editor = project({ manual: manualFixture(), rentChargeStatus: rows });
    const admin = project({
      manual: manualFixture(),
      rentChargeStatus: rows,
      role: "Admin",
    });
    expect(status(editor, "support.rentvine:prepared")).toBe("ready_for_other_actor");
    expect(action(editor, "support.rentvine:prepared").responsible).toBe("an Admin");
    expect(status(admin, "support.rentvine:prepared")).toBe("ready_for_actor");
    expect(status(editor, "support.rentvine:running")).toBe("waiting");
    expect(action(admin, "support.rentvine:ambiguous")).toMatchObject({
      status: "unknown",
      reason: "completion_unknown",
    });
  });

  it("puts missing rent verification first while independent staff work stays ready", () => {
    const projection = project({
      manual: manualFixture(),
      rentAgreement: "single_source",
    });
    expect(projection.headlineActionId).toBe("evidence.verify-base-rent");
    expect(projection.primaryActionId).toBe("evidence.verify-base-rent");
    const order = projection.actions.map((entry) => entry.id);
    expect(order.indexOf("evidence.verify-base-rent")).toBeLessThan(
      order.indexOf("manual.owner_outreach"),
    );
    expect(status(projection, "manual.owner_outreach")).toBe("ready_for_actor");
  });

  it("leads with the refresh for expired data without blocking recorded work", () => {
    const projection = project({ manual: manualFixture(), currency: "expired" });
    expect(projection.headlineActionId).toBe("source.refresh");
    expect(action(projection, "source.refresh").control?.refresh).toBe(true);
    expect(status(projection, "manual.owner_outreach")).toBe("ready_for_actor");
  });

  it("keeps an unreadable staff record local to staff-recorded work", () => {
    const projection = project({ manual: "unreadable" });
    expect(projection.outcome.state).toBe("unknown");
    expect(status(projection, "source.staff_records")).toBe("ready_for_actor");
    expect(status(projection, "manual.cycle")).toBe("unknown");
    expect(status(projection, "manual.owner_outreach")).toBe("unknown");
    expect(action(projection, "evidence.verify-base-rent").status).not.toBe("unknown");
  });

  it("leads with a refresh when saved process progress is unreadable and no cycle exists", () => {
    const projection = project({ manual: null, progressUnavailable: true });
    expect(projection.headlineActionId).toBe("source.refresh");
    // Open process work cannot be relied on; evidence already verified from sources stays so.
    expect(action(projection, "evidence.confirm-renewal-recipients")).toMatchObject({
      status: "unknown",
      reason: "source_unavailable",
    });
    expect(status(projection, "evidence.verify-end-date")).toBe("complete");
    expect(status(projection, "manual.cycle")).toBe("ready_for_actor");
  });

  it("redirects ordinary outreach to the non-renewal handoff for a confirmed move-out", () => {
    const projection = project({ manual: manualFixture(), moveOutInitiated: true });
    expect(projection.headlineActionId).toBe("issue.move_out_redirect");
    expect(action(projection, "issue.move_out_redirect").control?.targets).toEqual([
      "renewal-manual-cycle",
    ]);
  });

  it("offers only source inspection on an inspection-only lease", () => {
    const projection = project({ workflowAvailable: false, termNeedsReview: true });
    expect(projection.lane).toBe("inspection_only");
    expect(projection.outcome.state).toBe("inspection_only");
    expect(projection.actions.map((entry) => entry.id)).toEqual(["source.term_review"]);
    expect(selectRenewalAction(projection, null)).toBe("source.term_review");
  });

  it("changes only the affected actions after an unrelated save and keeps stable references", () => {
    const before = manualFixture({
      owner: "approved_terms",
      tenant: "accepted",
      done: ["owner_outreach", "tenant_offer"],
    });
    const after = save(before, {
      kind: "activity",
      activity: "rhino",
      outcome: "done",
      source: "Rhino portal",
    });
    const first = project({ manual: before });
    const second = project({ manual: after });
    const changed = first.actions
      .filter((entry) => status(second, entry.id) !== entry.status)
      .map((entry) => entry.id);
    expect(changed).toEqual(["manual.rhino"]);
    expect(second.actions.map((entry) => entry.ref)).toEqual(
      first.actions.map((entry) => entry.ref),
    );
    expect(project({ manual: after })).toEqual(second);
  });

  it("reads only the current cycle and never revives a historical one", () => {
    const current = manualFixture({ cycleId: "0a5e0d5e-7e1c-4c39-9b8e-8b2f2a3c4d5e" });
    const projection = project({ manual: current });
    expect(new Set(projection.actions.map((entry) => entry.ref.cycleId))).toEqual(
      new Set(["0a5e0d5e-7e1c-4c39-9b8e-8b2f2a3c4d5e"]),
    );
    expect(projection.headlineActionId).toBe("manual.owner_outreach");
  });

  it("keeps the selection while it is outstanding and moves on once it is done", () => {
    const state = manualFixture({
      owner: "approved_terms",
      tenant: "accepted",
      done: ["owner_outreach", "tenant_offer"],
    });
    const projection = project({ manual: state });
    expect(selectRenewalAction(projection, "manual.pet")).toBe("manual.pet");
    const after = project({
      manual: save(state, {
        kind: "activity",
        activity: "pet",
        outcome: "done",
        source: "Pet registry",
      }),
    });
    expect(selectRenewalAction(after, "manual.pet")).toBe("manual.information_form");
  });

  it("maps every action to an existing control or reports it unresolved, without diagnostics", () => {
    for (const projection of [
      project({ manual: null }),
      project({ manual: manualFixture() }),
      project({ manual: "unreadable" }),
      project({
        manual: manualFixture({
          owner: "approved_terms",
          tenant: "accepted",
          done: ["owner_outreach", "tenant_offer"],
        }),
      }),
    ]) {
      expect(projection.diagnostics).toEqual([]);
      for (const entry of projection.actions)
        expect(entry.control !== null || entry.status === "unresolved", entry.id).toBe(
          true,
        );
    }
    expect(ready(project({ manual: manualFixture() }))).toContain(
      "manual.owner_outreach",
    );
  });
});
