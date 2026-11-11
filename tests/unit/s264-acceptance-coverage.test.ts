import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acceptanceHoldRefusal,
  buildOfferAnswersView,
  tenantAcceptanceCheck,
  type OfferAnswerRecord,
} from "@/lib/lease-renewal/offer-answers";
import {
  offerSnapshotIdentity,
  type FrozenOfferSnapshot,
  type OfferSnapshot,
  type OfferSnapshotRow,
} from "@/lib/lease-renewal/offer-snapshot";
import { projectGuidedPriority } from "@/lib/lease-renewal/guided-priority";
import {
  projectRenewalStage,
  type RenewalStageContext,
} from "@/lib/lease-renewal/renewal-stage";
import {
  currentAcceptanceHold,
  rentvineUpdateReliesOnAcceptance,
  sheetUpdateReliesOnAcceptance,
  type TenantAcceptanceRead,
} from "@/lib/lease-renewal/tenant-acceptance-hold";
import type {
  RenewalWorkspaceAction,
  RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { recordedState } from "@/tests/helpers/outreach-evidence-fixtures";

// S264 R-S264-6 (AC-S264-6, BEH-S264-6) at the tenant decision's consumers: an acceptance of an
// exact offer covers the current offer only while its charges are the ones answered. After a
// charge-only change, Offer the tenant is not done and names its exact next step, the Guided
// priority leads with it, and the source updates that apply the accepted renewal hold. The
// answer itself stays as recorded. Synthetic values only.

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const CYCLE = "10000000-0000-4000-8000-000000007264";
const EVENT = "00000000-0000-4000-8000-0000000072e1";
const NEXT_STEP = "Record the tenant's answer for the current offer";
const LINE =
  "Current acceptance needs verification: it answers an earlier offer. Pet rent changed ($45.00 to $50.00).";

function petRow(cents: number, extra: Partial<OfferSnapshotRow> = {}): OfferSnapshotRow {
  return {
    rowKey: "rentvine:501",
    origin: "rentvine",
    family: "pet",
    label: "Pet rent",
    amountCents: cents,
    cadence: { kind: "monthly" },
    effectiveFrom: "2027-02-01",
    comparison: cents === 4500 ? "unchanged" : "changed",
    sourceRef: "rentvine:lease:7264:recurring-charge:501",
    sourceVersion: "v-501",
    trigger: null,
    mappingEntryId: "00000000-0000-4000-8000-000000009001",
    ...extra,
  };
}

function offer(
  rows: readonly OfferSnapshotRow[],
  extra: Partial<OfferSnapshot> = {},
): FrozenOfferSnapshot {
  const value: OfferSnapshot = {
    schemaVersion: "renewal-offer-snapshot/v1",
    leaseId: "7264",
    cycleId: CYCLE,
    base: { rent: 920, revision: 2 },
    dates: {
      effectiveDate: "2027-02-01",
      effectiveRevision: 1,
      endDate: "2028-01-31",
      endRevision: 1,
    },
    rows,
    transitions: { insurance: null, rbp: null },
    unchangedStatement: true,
    mappingVersion: 1,
    sourceState: "read",
    sourceVersion: "src-1",
    sourceLines: 1,
    ...extra,
  };
  return { ...offerSnapshotIdentity(value), snapshot: value };
}

function acceptanceRecord(
  answered: FrozenOfferSnapshot | null,
  extra: Partial<OfferAnswerRecord> = {},
): OfferAnswerRecord {
  return {
    schemaVersion: "renewal-offer-answer/v1",
    leaseId: "7264",
    cycleId: CYCLE,
    eventId: EVENT,
    party: "tenant",
    outcome: "accepted",
    attribution: answered
      ? {
          kind: "linked_communication",
          sequenceId: "synthetic-sequence",
          occurrenceId: "synthetic-occurrence",
          sentAtMs: Date.parse("2026-11-09T16:00:00.000Z"),
        }
      : { kind: "unattributed" },
    offer: answered,
    recordedAt: "2026-11-10T15:00:00.000Z",
    recordedByUid: "synthetic-staff",
    ...extra,
  };
}

const workspace = (
  tenantResponse: Record<string, unknown> | null = {
    eventId: EVENT,
    outcome: "accepted",
    termsRevision: 0,
  },
) =>
  ({
    leaseId: "7264",
    cycleId: CYCLE,
    termsRevision: 0,
    tenantResponse,
    ownerResponse: null,
  }) as unknown as RenewalWorkspaceState;

describe("AC-S264-6 a tenant acceptance covers the current offer only while its charges are the ones answered", () => {
  const answered = offer([petRow(4500)]);

  it("covers the identical offer; a charge-only change answers an earlier offer with the exact difference", () => {
    expect(
      tenantAcceptanceCheck({
        workspace: workspace(),
        record: acceptanceRecord(answered),
        current: offer([petRow(4500)]),
      }),
    ).toEqual({ eventId: EVENT, state: "covers", line: null });
    expect(
      tenantAcceptanceCheck({
        workspace: workspace(),
        record: acceptanceRecord(answered),
        current: offer([petRow(5000)]),
      }),
    ).toEqual({ eventId: EVENT, state: "earlier_offer", line: LINE });
  });

  it("a re-resolution that changes nothing the tenant read still covers; a redated, removed or added charge does not", () => {
    // Same charges after a mapping or source re-version, or a same-value base save.
    expect(
      tenantAcceptanceCheck({
        workspace: workspace(),
        record: acceptanceRecord(answered),
        current: offer([petRow(4500, { sourceVersion: "v-501b" })], {
          mappingVersion: 2,
          sourceVersion: "src-2",
          sourceLines: 2,
          base: { rent: 920, revision: 3 },
        }),
      })?.state,
    ).toBe("covers");
    const redated = tenantAcceptanceCheck({
      workspace: workspace(),
      record: acceptanceRecord(offer([petRow(4500, { effectiveFrom: "2027-03-01" })])),
      current: offer([petRow(4500, { effectiveFrom: "2027-04-01" })]),
    });
    expect(redated?.state).toBe("earlier_offer");
    expect(redated?.line).toMatch(/^Current acceptance needs verification: /);
    expect(
      tenantAcceptanceCheck({
        workspace: workspace(),
        record: acceptanceRecord(answered),
        current: offer([]),
      }),
    ).toMatchObject({
      state: "earlier_offer",
      line: expect.stringContaining("Pet rent was removed."),
    });
    expect(
      tenantAcceptanceCheck({
        workspace: workspace(),
        record: acceptanceRecord(answered),
        current: offer([petRow(4500)], {
          transitions: { insurance: "does_not_apply", rbp: null },
        }),
      })?.state,
    ).toBe("earlier_offer");
  });

  it("an acceptance not tied to one exact offer, and an unread current offer, keep their recorded reading", () => {
    // Unattributed by staff, or recorded with no offer record at all (every earlier answer).
    for (const record of [acceptanceRecord(null), null])
      expect(
        tenantAcceptanceCheck({
          workspace: workspace(),
          record,
          current: offer([petRow(5000)]),
        }),
      ).toEqual({ eventId: EVENT, state: "not_attributed", line: null });
    expect(
      tenantAcceptanceCheck({
        workspace: workspace(),
        record: acceptanceRecord(answered),
        current: null,
      }),
    ).toEqual({ eventId: EVENT, state: "unknown", line: null });
    // Another answer's record is not this acceptance's.
    expect(
      tenantAcceptanceCheck({
        workspace: workspace(),
        record: acceptanceRecord(answered, { eventId: "another-event" }),
        current: offer([petRow(5000)]),
      })?.state,
    ).toBe("not_attributed");
  });

  it("checks nothing without a current acceptance: a wait, a counter or an answer to earlier terms", () => {
    for (const response of [
      null,
      { eventId: EVENT, outcome: "awaiting_response", termsRevision: 0 },
      { eventId: EVENT, outcome: "counter_change_requested", termsRevision: 0 },
      { eventId: EVENT, outcome: "accepted", termsRevision: -1 },
    ])
      expect(
        tenantAcceptanceCheck({
          workspace: workspace(response),
          record: acceptanceRecord(answered),
          current: offer([petRow(5000)]),
        }),
      ).toBeNull();
  });

  it("the tenant message read carries the check for the stage, Finish up and the source updates", () => {
    const view = buildOfferAnswersView({
      workspace: workspace(),
      current: offer([petRow(5000)]),
      candidates: [],
      tenantRecord: acceptanceRecord(answered),
      ownerRecord: null,
    });
    expect(view.acceptance).toEqual({
      eventId: EVENT,
      state: "earlier_offer",
      line: LINE,
    });
    // The editor's own line for the same answer says the same.
    expect(view.tenant?.line).toBe(LINE);
    expect(
      buildOfferAnswersView({
        workspace: null,
        current: null,
        candidates: [],
        tenantRecord: null,
        ownerRecord: null,
      }).acceptance,
    ).toBeNull();
  });

  it("the refusal a held source update returns before its claim names the difference and the next step", () => {
    expect(acceptanceHoldRefusal(LINE)).toBe(
      `${LINE} This update was not sent. Record the tenant's answer for the current offer, then confirm this update again.`,
    );
  });
});

describe("AC-S264-6 a hold binds to the current acceptance's own event", () => {
  const read = (extra: Partial<TenantAcceptanceRead> = {}): TenantAcceptanceRead => ({
    eventId: EVENT,
    state: "earlier_offer",
    line: LINE,
    ...extra,
  });

  it("holds only the work record's current acceptance; a newer read listed first decides", () => {
    expect(currentAcceptanceHold(workspace(), [read()])).toEqual({
      eventId: EVENT,
      line: LINE,
    });
    expect(
      currentAcceptanceHold(workspace(), [read({ state: "covers", line: null }), read()]),
    ).toBeNull();
    // A newer read that could not read the current offer says nothing; the earlier one stands.
    expect(
      currentAcceptanceHold(workspace(), [
        read({ state: "unknown", line: null }),
        read(),
      ]),
    ).toEqual({ eventId: EVENT, line: LINE });
    expect(currentAcceptanceHold(workspace(), [read({ eventId: "earlier" })])).toBeNull();
    expect(
      currentAcceptanceHold(
        workspace({ eventId: EVENT, outcome: "declined_nonrenewing", termsRevision: 0 }),
        [read()],
      ),
    ).toBeNull();
    expect(currentAcceptanceHold(null, [read()])).toBeNull();
  });

  it("holds the RentVine updates that apply the accepted renewal and the Sheet renewal date, nothing else", () => {
    expect(rentvineUpdateReliesOnAcceptance(undefined)).toBe(true);
    expect(rentvineUpdateReliesOnAcceptance("future_rent")).toBe(true);
    expect(rentvineUpdateReliesOnAcceptance("current_base")).toBe(false);
    expect(
      sheetUpdateReliesOnAcceptance({ kind: "field_update", field: "renewal_date" }),
    ).toBe(true);
    for (const field of [
      "tenant_responded",
      "current_rent",
      "market_value",
      "renewal_completed",
    ])
      expect(sheetUpdateReliesOnAcceptance({ kind: "field_update", field }), field).toBe(
        false,
      );
    expect(sheetUpdateReliesOnAcceptance({ kind: "row_append" })).toBe(false);
  });
});

// A standing agreement covers Ask the owner, so the records start at the tenant offer (S252).
const CONTEXT: RenewalStageContext = {
  leaseId: "4801",
  staffRecordUnavailable: false,
  standingAgreement: { label: "Example standing agreement", reason: "Covered." },
  housingAssistance: null,
  numbers: { verified: true, openDifferences: 0 },
  term: { monthToMonth: false, reviewNeeded: false },
  moveOutInitiated: false,
  sourceRenewal: null,
  verification: null,
  handStatus: null,
  lastContactAtIso: null,
  threadCheck: null,
  outreach: null,
};
const at = (minute: number) => `2026-11-06T15:${String(minute).padStart(2, "0")}:00.000Z`;
const OFFERED: RenewalWorkspaceAction = {
  kind: "activity",
  activity: "tenant_offer",
  outcome: "done",
};
const ACCEPTED: RenewalWorkspaceAction = { kind: "tenant_response", outcome: "accepted" };
const FORMS: RenewalWorkspaceAction[] = [
  { kind: "activity", activity: "information_form", outcome: "done" },
  { kind: "activity", activity: "form_returned", outcome: "done" },
];

function after(actions: readonly RenewalWorkspaceAction[]) {
  return recordedState(
    "4801",
    actions.map((action, index) => ({ action, atIso: at(index + 1) })),
  );
}
function stageWith(
  state: RenewalWorkspaceState,
  tenantAcceptance: TenantAcceptanceRead | null,
) {
  return projectRenewalStage(
    state,
    { ...CONTEXT, tenantAcceptance } as RenewalStageContext,
    {
      standingCovered: true,
    },
  );
}
const held = (state: RenewalWorkspaceState): TenantAcceptanceRead => ({
  eventId: state.tenantResponse!.eventId,
  state: "earlier_offer",
  line: LINE,
});

describe("AC-S264-6 Offer the tenant does not read as done while the acceptance answers an earlier offer", () => {
  it("names the exact next step at the tenant response editor and keeps the recorded answer", () => {
    const state = after([OFFERED, ACCEPTED, ...FORMS]);
    // Without the check, the accepted offer is done and Documents follows (S252).
    expect(stageWith(state, null).currentStepId).toBe("documents");
    const stage = stageWith(state, held(state));
    expect(stage.currentStepId).toBe("offer-tenant");
    expect(stage.nextStep.label).toBe(NEXT_STEP);
    expect(stage.stageLine).toBe(LINE);
    expect(stage.steps.find((step) => step.id === "offer-tenant")).toMatchObject({
      state: "current",
      detail: LINE,
      primary: { label: NEXT_STEP, target: "renewal-manual-tenant_response" },
    });
    // The answer is history, not removed: the staff record still holds the acceptance.
    expect(state.tenantResponse?.outcome).toBe("accepted");
  });

  it("comes before the renewal information form, which follows an acceptance of the current offer", () => {
    const state = after([OFFERED, ACCEPTED]);
    expect(stageWith(state, null).nextStep.label).toBe(
      "Send the renewal information form",
    );
    expect(stageWith(state, held(state)).nextStep.label).toBe(NEXT_STEP);
  });

  it("an answer recorded since, a covering read and a recorded completion read as recorded", () => {
    const state = after([OFFERED, ACCEPTED, ...FORMS]);
    expect(
      stageWith(state, { ...held(state), eventId: "an-earlier-answer" }).currentStepId,
    ).toBe("documents");
    expect(
      stageWith(state, { ...held(state), state: "covers", line: null }).currentStepId,
    ).toBe("documents");
    const completed = after([OFFERED, ACCEPTED, ...FORMS, { kind: "complete" }]);
    expect(stageWith(completed, held(completed)).currentStepId).toBe("complete");
  });

  it("the Guided priority leads with the tenant's answer for the current offer, not the offer review", () => {
    const state = after([OFFERED, ACCEPTED, ...FORMS]);
    const stage = stageWith(state, held(state));
    const shown = stage.steps.find((step) => step.id === "offer-tenant")!;
    const priority = projectGuidedPriority({
      stage,
      shown,
      canEdit: true,
      message: {
        ready: true,
        label: "Review and send",
        target: "renewal-card-message-tenant",
      },
    });
    expect(priority.state).toBe("act");
    expect(priority.lead).toMatchObject({
      key: "tenant-answer",
      label: NEXT_STEP,
      target: "renewal-manual-tenant_response",
      owner: "offer-tenant",
    });
  });
});
