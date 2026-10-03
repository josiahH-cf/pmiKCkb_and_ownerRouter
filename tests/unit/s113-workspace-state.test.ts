import { describe, expect, it } from "vitest";
import {
  STAFF_RECORD_SOURCE,
  currentManualOwnerTerms,
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  manualRenewalSummary,
  type RenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";
const meta = {
  actorUid: "operator",
  recordedAt: "2026-09-10T12:00:00.000Z",
  eventId: "event",
};
const initial = () =>
  emptyRenewalWorkspace("701", "cycle-one", {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
function act(state: ReturnType<typeof initial>, action: RenewalWorkspaceAction) {
  return planRenewalWorkspaceAction(state, action, meta);
}
describe("S113 separate manual cycle", () => {
  it("records the owner response as a fact and never makes provider evidence from staff activity", () => {
    let state = act(initial(), {
      kind: "activity",
      activity: "owner_outreach",
      outcome: "done",
      source: "phone",
    });
    state = act(state, {
      kind: "owner_response",
      outcome: "approved_terms",
      source: "phone",
      terms: { rent: 1250, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
    });
    expect(manualRenewalSummary(state)).toMatchObject({
      complete: false,
      waitingParty: "staff",
      nextActivity: "tenant_offer",
    });
    expect(state).not.toHaveProperty("evidence");
    expect(state).not.toHaveProperty("complete");
    // S156 (BEH-S156-4): an owner approval is the recorded fact alone. Working terms live on the
    // lease, so the approval needs no terms and none are manufactured to hold them.
    const approvedWithoutTerms = act(initial(), {
      kind: "owner_response",
      outcome: "approved_terms",
      source: "phone",
    });
    expect(approvedWithoutTerms.ownerResponse).toMatchObject({
      outcome: "approved_terms",
      source: "phone",
    });
    expect(approvedWithoutTerms.ownerResponse).not.toHaveProperty("terms");
    expect(currentManualOwnerTerms(approvedWithoutTerms)).toBeNull();
    expect(approvedWithoutTerms.termsRevision).toBe(1);
    // Only an explicit approval can carry approved terms.
    expect(() =>
      act(initial(), {
        kind: "owner_response",
        outcome: "revision_requested",
        source: "phone",
        terms: { rent: 1250, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      }),
    ).toThrow(/explicit owner approval/i);
    // Not applicable stays available only for work that depends on the lease.
    expect(() =>
      act(state, {
        kind: "activity",
        activity: "documents",
        outcome: "not_applicable",
        source: "phone",
        reason: "skip",
      }),
    ).toThrow(/depends on the lease/i);
  });
  it("invalidates dependent current markers on changed terms, retaining history externally", () => {
    let state = act(initial(), {
      kind: "owner_response",
      outcome: "approved_terms",
      source: "email",
      terms: { rent: 1250, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
    });
    state = act(state, {
      kind: "activity",
      activity: "tenant_offer",
      outcome: "done",
      source: "email",
    });
    expect(state.activities.tenant_offer?.outcome).toBe("done");
    const next = act(state, {
      kind: "owner_response",
      outcome: "approved_terms",
      source: "email",
      terms: { rent: 1300, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
    });
    expect(manualRenewalSummary(next).nextActivity).toBe("owner_outreach");
    expect(next.activities.tenant_offer?.termsRevision).not.toBe(next.termsRevision);
    expect(next.termsRevision).toBe(2);
  });
  it("uses the non-renewal handoff as guidance and an explicit staff completion event", () => {
    let state = act(initial(), {
      kind: "owner_response",
      outcome: "declined_non_renewal",
      source: "phone",
    });
    expect(manualRenewalSummary(state).nextActivity).toBe("non_renewal_handoff");
    // S156 (BEH-S156-7): the checklist is guidance. Staff record completion when their actual
    // work is complete; nothing refuses it while a suggested activity is unrecorded.
    const completedEarly = act(state, { kind: "complete", source: "reviewed checklist" });
    expect(manualRenewalSummary(completedEarly)).toMatchObject({
      complete: true,
      label: "Completed: recorded by staff",
    });
    expect(completedEarly.completion).toMatchObject({
      source: "reviewed checklist",
      actorUid: "operator",
    });
    state = act(state, {
      kind: "activity",
      activity: "non_renewal_handoff",
      outcome: "done",
      source: "handoff to existing move-out process",
    });
    state = act(state, { kind: "complete", source: "reviewed checklist" });
    expect(manualRenewalSummary(state)).toMatchObject({
      complete: true,
      label: "Completed: recorded by staff",
    });
    // A later staff record keeps the completion; only an explicit reopen clears it.
    const afterwards = act(state, {
      kind: "activity",
      activity: "documents",
      outcome: "done",
      source: "phone",
    });
    expect(afterwards.completion).not.toBeNull();
    expect(manualRenewalSummary(afterwards).complete).toBe(true);
    const reopened = act(afterwards, { kind: "reopen", source: "staff" });
    expect(reopened.completion).toBeNull();
    expect(manualRenewalSummary(reopened).complete).toBe(false);
    expect(manualRenewalSummary(initial()).complete).toBe(false);
  });
  it("S156 (BEH-S156-3): records staff knowledge from a call without a narrative or named source", () => {
    const state = act(initial(), {
      kind: "activity",
      activity: "owner_outreach",
      outcome: "done",
    });
    expect(state.activities.owner_outreach).toMatchObject({
      outcome: "done",
      source: STAFF_RECORD_SOURCE,
      actorUid: "operator",
    });
    expect(state.activities.owner_outreach).not.toHaveProperty("reason");
    const response = act(state, { kind: "owner_response", outcome: "no_response" });
    expect(response.ownerResponse).toMatchObject({
      outcome: "no_response",
      source: STAFF_RECORD_SOURCE,
    });
    const completed = act(response, { kind: "complete" });
    expect(completed.completion).toMatchObject({ source: STAFF_RECORD_SOURCE });
  });
});

describe("S113 manual applicability and counter handoffs", () => {
  it("records Not applicable on lease-dependent work without a cited policy and keeps a cited one as staff evidence", () => {
    // S156 (R-S156-3/7): a conditional activity can be Not applicable on staff knowledge alone;
    // no reason or policy citation is demanded as an attestation.
    const plain = act(initial(), {
      kind: "activity",
      activity: "pet",
      outcome: "not_applicable",
      source: "Reviewed lease",
    });
    expect(plain.activities.pet).toMatchObject({
      outcome: "not_applicable",
      source: "Reviewed lease",
      actorUid: "operator",
    });
    expect(plain.activities.pet).not.toHaveProperty("applicabilityPolicy");
    expect(manualRenewalSummary(plain).nextActivity).not.toBe("pet");
    const state = act(initial(), {
      kind: "activity",
      activity: "pet",
      outcome: "not_applicable",
      reason: "No applicable animal",
      source: "Reviewed lease",
      applicabilityPolicy: "Approved animal predicate from current form catalog",
    });
    expect(state.activities.pet).toMatchObject({
      applicabilityPolicy: "Approved animal predicate from current form catalog",
      reason: "No applicable animal",
      actorUid: "operator",
    });
    expect(state).not.toHaveProperty("providerReceipt");
    // Required (non-conditional) work is recorded as Not started, Waiting or Done only.
    expect(() =>
      act(initial(), {
        kind: "activity",
        activity: "signatures",
        outcome: "not_applicable",
        source: "Reviewed lease",
        reason: "skip",
        applicabilityPolicy: "none applies",
      }),
    ).toThrow(/depends on the lease/i);
  });
  it("returns owner revisions and tenant counters to staff without treating either as approval", () => {
    let state = act(initial(), {
      kind: "activity",
      activity: "owner_outreach",
      outcome: "done",
      source: "Owner call",
    });
    state = act(state, {
      kind: "owner_response",
      outcome: "revision_requested",
      source: "Owner call",
    });
    expect(manualRenewalSummary(state)).toMatchObject({
      nextActivity: "owner_response",
      waitingParty: "staff",
      complete: false,
    });
    state = act(state, {
      kind: "owner_response",
      outcome: "approved_terms",
      terms: { rent: 1250, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      source: "Owner call",
    });
    state = act(state, {
      kind: "activity",
      activity: "tenant_offer",
      outcome: "done",
      source: "Tenant email",
    });
    state = act(state, {
      kind: "tenant_response",
      outcome: "counter_change_requested",
      source: "Tenant call",
    });
    expect(manualRenewalSummary(state)).toMatchObject({
      nextActivity: "owner_response",
      waitingParty: "staff",
      complete: false,
    });
  });
});
