import { describe, expect, it } from "vitest";
import {
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
  it("requires exact owner terms and never makes provider evidence from staff activity", () => {
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
    expect(() =>
      act(initial(), {
        kind: "owner_response",
        outcome: "approved_terms",
        source: "phone",
      }),
    ).toThrow(/exact/i);
    expect(() =>
      act(state, {
        kind: "activity",
        activity: "documents",
        outcome: "not_applicable",
        source: "phone",
        reason: "skip",
      }),
    ).toThrow(/required/i);
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
  it("uses the non-renewal handoff and an explicit staff completion event", () => {
    let state = act(initial(), {
      kind: "owner_response",
      outcome: "declined_non_renewal",
      source: "phone",
    });
    expect(manualRenewalSummary(state).nextActivity).toBe("non_renewal_handoff");
    expect(() => act(state, { kind: "complete", source: "reviewed checklist" })).toThrow(
      /unfinished/i,
    );
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
    expect(manualRenewalSummary(initial()).complete).toBe(false);
  });
});

describe("S113 manual applicability and counter handoffs", () => {
  it("requires a cited existing policy for staff-recorded N/A and preserves it as staff evidence", () => {
    expect(() =>
      act(initial(), {
        kind: "activity",
        activity: "pet",
        outcome: "not_applicable",
        reason: "No applicable animal",
        source: "Reviewed lease",
      }),
    ).toThrow(/policy|predicate/);
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
      actorUid: "operator",
    });
    expect(state).not.toHaveProperty("providerReceipt");
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
