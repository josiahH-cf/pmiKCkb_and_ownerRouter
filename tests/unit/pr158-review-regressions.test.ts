import { describe, expect, it } from "vitest";

import { liveNoticeEvidence } from "@/lib/lease-renewal/live-desk";
import {
  buildRenewalEvidenceReference,
  type RenewalTenantOutcome,
  type RenewalTenantOutcomeState,
} from "@/lib/lease-renewal/renewal-process";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";

// PR #158 review finding 1: an app renewal record whose tenant outcome is still pending
// (awaiting_response, needs_verification) is not a tenant response. Notice timing must keep the
// follow-up schedule for both and name the pending state with its source; actual responses stay.

const outcome = (state: RenewalTenantOutcomeState): RenewalTenantOutcome => {
  const evidence = buildRenewalEvidenceReference({
    ref: `app:tenant-outcome:${state}`,
    source: "app_record",
    disposition: "verified",
  });
  return { state, evidence };
};

function staffCycle() {
  const manual = emptyRenewalWorkspace("4821", "cycle-4821", {
    kind: "lease_end",
    dateIso: "2026-08-31",
    source: "Reviewed lease",
  });
  manual.activities.tenant_offer = {
    eventId: "fixture-event",
    actorUid: "fixture-staff",
    recordedAt: "2026-07-10T16:00:00.000Z",
    occurredAt: "2026-07-10T15:00:00.000Z",
    source: "Staff record",
    termsRevision: 0,
    outcome: "done",
  };
  return manual;
}

describe("PR158 finding 1: pending tenant outcomes are not responses", () => {
  for (const state of ["awaiting_response", "needs_verification"] as const) {
    it(`does not treat an app ${state} outcome as a tenant response`, () => {
      const facts = liveNoticeEvidence({
        endDateIso: "2026-08-31",
        evidence: {},
        tenantOutcome: outcome(state),
        manual: staffCycle(),
      });
      expect(facts.respondedSource).toBeNull();
      expect(facts.sentIso).toBe("2026-07-10");
    });
  }

  for (const state of [
    "accepted",
    "counter_change_requested",
    "declined_nonrenewing",
  ] as const) {
    it(`keeps an app ${state} outcome as a tenant response`, () => {
      expect(
        liveNoticeEvidence({
          endDateIso: "2026-08-31",
          evidence: {},
          tenantOutcome: outcome(state),
          manual: null,
        }).respondedSource,
      ).toBe("App renewal record");
    });
  }

  it("lets a staff-recorded response stand when the app outcome is still pending", () => {
    const manual = staffCycle();
    manual.tenantResponse = {
      eventId: "fixture-response",
      actorUid: "fixture-staff",
      recordedAt: "2026-07-12T16:00:00.000Z",
      source: "Staff record",
      termsRevision: 0,
      outcome: "accepted",
    };
    expect(
      liveNoticeEvidence({
        endDateIso: "2026-08-31",
        evidence: {},
        tenantOutcome: outcome("awaiting_response"),
        manual,
      }).respondedSource,
    ).toBe("Staff record");
  });
});
