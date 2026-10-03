import { describe, expect, it } from "vitest";

import {
  projectRenewalActions,
  renewalGuidanceActionId,
  selectRenewalAction,
  type RenewalActionProjection,
} from "@/lib/lease-renewal/renewal-actions";
import {
  MANUAL_ACTIVITIES,
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
// S154/S156 (b7693d4d, 8a3f929d): the staff lane leads on every lease, there is no reviewed-cycle
// step, the listed order is a suggestion rather than a prerequisite chain, and completion is
// always available as the staff's own record.

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

function staffActions(projection: RenewalActionProjection) {
  return projection.actions.filter((entry) => entry.group === "staff_work");
}

/** Every staff activity, response and the completion record: the whole advisory checklist. */
const STAFF_KEYS = [
  "owner_outreach",
  "owner_response",
  "tenant_offer",
  "tenant_response",
  ...AFTER_ACCEPTANCE,
  "complete",
] as const;

function save(state: RenewalWorkspaceState, raw: RenewalWorkspaceAction) {
  return planRenewalWorkspaceAction(state, raw, {
    actorUid: "fixture-staff",
    recordedAt: "2026-09-30T12:00:00.000Z",
    eventId: "00000000-0000-4000-8000-000000000009",
  });
}

describe("S142 renewal action projection", () => {
  it("follows the process guidance only where no staff lane is mounted", () => {
    // `manual: undefined` leaves the staff lane unmounted (a non-consolidated layout).
    const { snapshot } = actionFixture({});
    const projection = projectRenewalActions(snapshot);
    expect(projection.lane).toBe("process");
    // S156: the shared guidance suggests the first staff activity even here; without the staff
    // lane's controls that suggestion is reported unresolved rather than guessed.
    expect(projection.headlineActionId).toBe(renewalGuidanceActionId(snapshot));
    expect(projection.headlineActionId).toBe("process.guidance");
    expect(action(projection, "process.guidance")).toMatchObject({
      label: "Owner outreach",
      status: "unresolved",
      reason: "no_control",
    });
    // The sample lease still has an open recipient check, listed as verification work.
    expect(
      action(projection, "evidence.confirm-renewal-recipients").control?.handoff,
    ).toBe("external");
    expect(staffActions(projection)).toEqual([]);
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
    expect(recipientsVerified.primaryActionId).toBeNull();
    expect(projection.outcome).toEqual({
      state: "in_progress",
      label: "Manual work not recorded",
    });
  });

  it("S156 BEH-2 / ARCH-2: leads with the staff lane and readies every staff action on a lease with nothing recorded", () => {
    const { snapshot } = actionFixture({ manual: null });
    const projection = projectRenewalActions(snapshot);
    expect(projection.lane).toBe("manual");
    expect(projection.cycleId).toBeNull();
    // The suggestion is the first staff activity; the guidance names the same action.
    expect(projection.headlineActionId).toBe(renewalGuidanceActionId(snapshot));
    expect(projection.headlineActionId).toBe("manual.owner_outreach");
    expect(projection.primaryActionId).toBe("manual.owner_outreach");
    // There is no reviewed-cycle step and no prerequisite chain between staff actions.
    expect(projection.actions.map((entry) => entry.id)).not.toContain("manual.cycle");
    for (const key of STAFF_KEYS) {
      expect(action(projection, `manual.${key}`), key).toMatchObject({
        status: "ready_for_actor",
        prerequisites: [],
        blockedBy: [],
        unmetConditions: [],
      });
    }
    expect(status(projection, "manual.non_renewal_handoff")).toBe("not_applicable");
    expect(action(projection, "manual.preparation")).toMatchObject({
      requirement: "optional",
      status: "ready_for_actor",
      prerequisites: [],
    });
    // The open recipient check stays listed as verification work; it holds nothing.
    const recipients = action(projection, "evidence.confirm-renewal-recipients");
    expect(recipients.status).not.toBe("complete");
    for (const entry of projection.actions)
      expect(entry.blockedBy, entry.id).not.toContain(recipients.id);
    expect(projection.outcome).toEqual({
      state: "in_progress",
      label: "Manual work not recorded",
    });
  });

  it("suggests owner outreach on a fresh record while the owner response and comp preparation stay available", () => {
    const projection = project({ manual: manualFixture() });
    expect(projection.lane).toBe("manual");
    expect(projection.headlineActionId).toBe("manual.owner_outreach");
    expect(projection.primaryActionId).toBe("manual.owner_outreach");
    expect(action(projection, "manual.preparation")).toMatchObject({
      requirement: "optional",
      status: "ready_for_actor",
    });
    // S156 BEH-1: the owner response is available before the outreach is recorded.
    expect(status(projection, "manual.owner_response")).toBe("ready_for_actor");
    expect(action(projection, "manual.owner_outreach").ref).toEqual({
      leaseId: "lease-318-cedar-7",
      cycleId: "b4bc3b81-c402-4f62-a2e2-c605c67867fb",
      key: "owner_outreach",
    });
  });

  it("S156 BEH-1: a different available task can be chosen over the suggested one", () => {
    const state = manualFixture();
    const projection = project({ manual: state });
    expect(projection.headlineActionId).toBe("manual.owner_outreach");
    // Choosing the tenant offer keeps it selected: it is outstanding and ready.
    expect(selectRenewalAction(projection, "manual.tenant_offer")).toBe(
      "manual.tenant_offer",
    );
    // Recording it out of the suggested order is accepted and changes only its own status.
    const after = project({
      manual: save(state, {
        kind: "activity",
        activity: "tenant_offer",
        outcome: "done",
        source: "Offer handed over at the property",
      }),
    });
    expect(status(after, "manual.tenant_offer")).toBe("complete");
    expect(after.headlineActionId).toBe("manual.owner_outreach");
    const changed = projection.actions
      .filter((entry) => status(after, entry.id) !== entry.status)
      .map((entry) => entry.id);
    expect(changed).toEqual(["manual.tenant_offer"]);
  });

  it("waits on the owner after outreach and returns the response to staff on a revision", () => {
    const waiting = project({ manual: manualFixture({ done: ["owner_outreach"] }) });
    expect(action(waiting, "manual.owner_response")).toMatchObject({
      status: "waiting",
      waitingOn: "the owner",
    });
    expect(waiting.headlineActionId).toBe("manual.owner_response");
    // S156: the awaited response holds nothing else; the next staff task is already ready.
    expect(status(waiting, "manual.tenant_offer")).toBe("ready_for_actor");
    expect(waiting.primaryActionId).toBe("manual.tenant_offer");
    expect(selectRenewalAction(waiting, "manual.owner_response")).toBe(
      "manual.owner_response",
    );
    const revision = project({
      manual: manualFixture({ owner: "revision_requested", done: ["owner_outreach"] }),
    });
    expect(action(revision, "manual.owner_response")).toMatchObject({
      status: "ready_for_actor",
      detail: "The owner requested a revision.",
    });
    expect(revision.primaryActionId).toBe("manual.owner_response");
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
    expect(offered.headlineActionId).toBe("manual.tenant_response");
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
    // S156: completion is the staff's own record and is always available.
    expect(status(projection, "manual.complete")).toBe("ready_for_actor");
  });

  it("S156 BEH-2: keeps post-acceptance work available while the outreach and offer records are missing", () => {
    // Owner approval and the tenant acceptance are on record, but both the outreach and the offer
    // records are missing: nothing waits on them.
    let state = manualFixture({ owner: "approved_terms", tenant: "accepted" });
    let projection = project({ manual: state });
    expect(action(projection, "manual.documents")).toMatchObject({
      status: "ready_for_actor",
      blockedBy: [],
      prerequisites: [],
    });
    expect(status(projection, "manual.signatures")).toBe("ready_for_actor");
    expect(projection.headlineActionId).toBe("manual.owner_outreach");
    state = save(state, {
      kind: "activity",
      activity: "owner_outreach",
      outcome: "done",
      source: "Owner call",
    });
    projection = project({ manual: state });
    expect(status(projection, "manual.owner_outreach")).toBe("complete");
    expect(projection.headlineActionId).toBe("manual.tenant_offer");
    state = save(state, {
      kind: "activity",
      activity: "tenant_offer",
      outcome: "done",
      source: "Offer email",
    });
    projection = project({ manual: state });
    expect(status(projection, "manual.documents")).toBe("ready_for_actor");
    expect(status(projection, "manual.signatures")).toBe("ready_for_actor");
    expect(projection.headlineActionId).toBe("manual.information_form");
  });

  it("counts a conditional Not applicable without a policy attestation and refuses one on required work", () => {
    const permitted = project({
      manual: manualFixture({
        owner: "approved_terms",
        tenant: "accepted",
        done: ["owner_outreach", "tenant_offer"],
        notApplicable: ["rhino"],
      }),
    });
    expect(status(permitted, "manual.rhino")).toBe("complete");
    // S156 R-7: no approval checkbox or policy reference replaces the removed gate.
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
    expect(status(project({ manual: state }), "manual.rhino")).toBe("complete");
    expect(MANUAL_ACTIVITIES.documents.conditional).toBe(false);
    expect(() =>
      save(state, {
        kind: "activity",
        activity: "documents",
        outcome: "not_applicable",
        source: "Fixture",
        reason: "Not needed",
      }),
    ).toThrow(/Not applicable is available only for work that depends on the lease/);
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

  it("reopens the owner response for a tenant counter while the tenant answer stays available", () => {
    const projection = project({
      manual: manualFixture({
        owner: "approved_terms",
        tenant: "counter_change_requested",
        done: ["owner_outreach", "tenant_offer"],
      }),
    });
    expect(projection.headlineActionId).toBe("manual.owner_response");
    expect(projection.primaryActionId).toBe("manual.owner_response");
    expect(action(projection, "manual.owner_response")).toMatchObject({
      status: "ready_for_actor",
      detail: "The tenant requested a change to the current terms.",
    });
    // S156: the counter is guidance; recording the tenant's answer is not held behind it.
    expect(action(projection, "manual.tenant_response")).toMatchObject({
      status: "ready_for_actor",
      blockedBy: [],
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
      expect(projection.primaryActionId).toBe("manual.non_renewal_handoff");
      for (const key of AFTER_ACCEPTANCE)
        expect(status(projection, `manual.${key}`), key).toBe("not_applicable");
      // Completion stays the staff's own record, available on either branch.
      expect(status(projection, "manual.complete")).toBe("ready_for_actor");
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
      expect(handedOff.headlineActionId).toBe("manual.complete");
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
    // The stale documents record is reopened for the new terms and is ready again, not held.
    expect(status(projection, "manual.documents")).toBe("ready_for_actor");
    expect(projection.headlineActionId).toBe("manual.tenant_offer");
  });

  it("separates this actor, another authorized actor and a waiting provider effect", () => {
    const rows: RentChargeOutcomeRow[] = [
      {
        id: "rentvine:prepared",
        destination: "rentvine",
        intent: "future",
        label: "RentVine lease renewal dates",
        state: "prepared",
        stateLabel: "Prepared, awaiting staff confirmation",
        detail: "Renewal dates from the working terms.",
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
    // S156/S160 (cafa02a7): ordinary staff confirm a prepared RentVine update themselves.
    expect(status(editor, "support.rentvine:prepared")).toBe("ready_for_actor");
    expect(status(admin, "support.rentvine:prepared")).toBe("ready_for_actor");
    expect(status(editor, "support.rentvine:running")).toBe("waiting");
    expect(action(admin, "support.rentvine:ambiguous")).toMatchObject({
      status: "unknown",
      reason: "completion_unknown",
    });
    // S156-6 / S167-4: resolving a source conflict is ordinary staff work; an Editor and an
    // Approver both see it ready for themselves.
    const conflict = (role: "Editor" | "Approver") =>
      project({
        manual: manualFixture({}, "lease-1207-walnut-2"),
        leaseId: "lease-1207-walnut-2",
        role,
      });
    expect(status(conflict("Editor"), "evidence.resolve-source-conflicts")).toBe(
      "ready_for_actor",
    );
    expect(status(conflict("Approver"), "evidence.resolve-source-conflicts")).toBe(
      "ready_for_actor",
    );
  });

  it("S157 BEH-6/7: keeps a rent difference visible as evidence while the staff lane stays ready", () => {
    const decision = (agreement: "agree" | "conflict" | "single_source" | "missing") => ({
      currentRent: 1180,
      currentRentEvidence: {
        agreement,
        currencyState: "fresh" as const,
        readAtIso: "2026-09-30T17:00:00.000Z",
      },
    });
    const agreeing = actionFixture({
      manual: manualFixture(),
      rentDecision: decision("agree"),
    });
    expect(agreeing.workspace.guidance.rentVerification.state).toBe("verified");
    for (const rentAgreement of ["single_source", "conflict", "missing"] as const) {
      const { snapshot, workspace } = actionFixture({
        manual: manualFixture(),
        rentAgreement,
        rentDecision: decision(rentAgreement),
      });
      const projection = projectRenewalActions(snapshot);
      // The difference is advisory evidence (rentVerification), never a status, a blocker or a
      // prerequisite for the ordinary staff work.
      expect(workspace.guidance.rentVerification.state, rentAgreement).toBe(
        "needs_verification",
      );
      expect(workspace.guidance.rentVerification.destination, rentAgreement).toEqual({
        kind: "workspace_phase",
        stepId: "verify-renewal",
      });
      expect(workspace.guidance.overallStatus, rentAgreement).toBe("ready");
      expect(workspace.guidance.isBlocked, rentAgreement).toBe(false);
      expect(workspace.guidance.blockers, rentAgreement).toEqual([]);
      expect(workspace.guidance.action, rentAgreement).toMatchObject({
        kind: "act",
        label: "Owner outreach",
      });
      expect(projection.headlineActionId, rentAgreement).toBe("manual.owner_outreach");
      expect(projection.primaryActionId, rentAgreement).toBe("manual.owner_outreach");
      expect(status(projection, "manual.owner_outreach"), rentAgreement).toBe(
        "ready_for_actor",
      );
      // The verification work stays listed for the person who wants it.
      expect(action(projection, "evidence.verify-base-rent").group).toBe("verification");
    }
  });

  it("leads with the refresh for expired data without blocking recorded work", () => {
    const projection = project({ manual: manualFixture(), currency: "expired" });
    expect(projection.headlineActionId).toBe("source.refresh");
    expect(action(projection, "source.refresh").control?.refresh).toBe(true);
    expect(status(projection, "manual.owner_outreach")).toBe("ready_for_actor");
  });

  it("keeps an unreadable staff record local to staff-recorded work", () => {
    const projection = project({ manual: "unreadable" });
    expect(projection.lane).toBe("process");
    expect(projection.outcome.state).toBe("unknown");
    expect(status(projection, "source.staff_records")).toBe("ready_for_actor");
    expect(projection.actions.map((entry) => entry.id)).not.toContain("manual.cycle");
    // Every staff action waits only for the records to be read again.
    for (const key of STAFF_KEYS) {
      expect(action(projection, `manual.${key}`), key).toMatchObject({
        status: "unknown",
        prerequisites: [{ id: "source.staff_records", met: false }],
      });
    }
    expect(action(projection, "evidence.verify-base-rent").status).not.toBe("unknown");
  });

  it("leads with a refresh when saved process progress is unreadable and no staff lane is mounted", () => {
    const projection = project({ progressUnavailable: true });
    expect(projection.lane).toBe("process");
    expect(projection.headlineActionId).toBe("source.refresh");
    // Open process work cannot be relied on; evidence already verified from sources stays so.
    expect(action(projection, "evidence.confirm-renewal-recipients")).toMatchObject({
      status: "unknown",
      reason: "source_unavailable",
    });
    expect(status(projection, "evidence.verify-end-date")).toBe("complete");
  });

  it("keeps the staff lane ready when saved process progress is unreadable", () => {
    // S154/S156: the staff record, not the S72 progress, guides the lease; unreadable progress
    // affects only the process evidence.
    const projection = project({ manual: null, progressUnavailable: true });
    expect(projection.lane).toBe("manual");
    expect(projection.headlineActionId).toBe("manual.owner_outreach");
    expect(status(projection, "manual.owner_outreach")).toBe("ready_for_actor");
    expect(status(projection, "manual.complete")).toBe("ready_for_actor");
  });

  it("redirects ordinary outreach to the non-renewal handoff for a confirmed move-out", () => {
    const projection = project({ manual: manualFixture(), moveOutInitiated: true });
    expect(projection.headlineActionId).toBe("issue.move_out_redirect");
    expect(action(projection, "issue.move_out_redirect").control?.targets).toEqual([
      "renewal-manual-non_renewal_handoff",
    ]);
    // The redirect is advisory: the staff lane stays ready beneath it.
    expect(status(projection, "manual.owner_outreach")).toBe("ready_for_actor");
    expect(status(projection, "manual.non_renewal_handoff")).toBe("not_applicable");
  });

  it("S154 BEH-1/2: keeps the staff lane on a lease that needs a term review", () => {
    // Before S154 a reviewed or out-of-window lease had an inspection-only lane with only the
    // term review; now the term review is advisory beside the ordinary staff work.
    const projection = project({ manual: null, termNeedsReview: true });
    expect(projection.lane).toBe("manual");
    expect(projection.outcome.state).toBe("in_progress");
    expect(action(projection, "source.term_review")).toMatchObject({
      requirement: "advisory",
      status: "ready_for_actor",
    });
    expect(projection.headlineActionId).toBe("manual.owner_outreach");
    expect(selectRenewalAction(projection, null)).toBe("manual.owner_outreach");
    expect(selectRenewalAction(projection, "source.term_review")).toBe(
      "source.term_review",
    );
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
