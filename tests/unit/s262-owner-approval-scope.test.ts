import { describe, expect, it } from "vitest";

import {
  currentOwnerApproval,
  ownerApprovalNotice,
} from "@/lib/lease-documents/owner-approval-binding";
import { projectCurrentCycleWorkingRecord } from "@/lib/lease-renewal/current-cycle-terms";
import { planApprovedBaseChange } from "@/lib/lease-renewal/owner-answer-terms";
import {
  describeOwnerApprovalCoverage,
  ownerApprovalCoverage,
} from "@/lib/lease-renewal/owner-approval-coverage";
import {
  ApprovedBaseInputSchema,
  approvalCoversOfferSnapshot,
  approvalCoversRenewalDates,
  approvalCoversWorkingBase,
  ownerApprovalScope,
} from "@/lib/lease-renewal/owner-approval-scope";
import { projectSourceUpdateTermsBasis } from "@/lib/lease-renewal/source-update-terms-basis";
import type {
  RenewalWorkingRecord,
  WorkingFieldEntry,
} from "@/lib/lease-renewal/working-record";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

// S262 R-S262-1..3 (ARCH-S262-1..3, BEH-S262-1/3, AC-S262-1..3): the typed approval scope and
// the planned working change of one reviewed owner answer. Synthetic values only.

const CYCLE = "0f1c8f6e-6d1c-4bd3-9d7a-00000000000a";
const EVENT = (n: number) => `0f1c8f6e-6d1c-4bd3-9d7a-${String(n).padStart(12, "0")}`;
const RESPONSE_EVENT = EVENT(500);
const fmt = { money: (value: number) => `$${value}`, date: (iso: string) => iso };

function entry(
  value: number | string | null,
  revision: number,
  extra: Partial<WorkingFieldEntry> = {},
): WorkingFieldEntry {
  return {
    value,
    revision,
    eventId: EVENT(revision),
    recordedAt: "2026-10-02T15:00:00.000Z",
    recordedByUid: "staff-1",
    recordedByLabel: "staff1@pmikcmetro.com",
    origin: "staff_entry",
    cycleId: CYCLE,
    ...extra,
  };
}

function working(fields: Record<string, WorkingFieldEntry>): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: "701",
    revision: 4,
    fields,
  };
}

const evidence = {
  party: { kind: "representative" as const, name: "Pat Example", capacity: "agent" },
  channel: { kind: "conversation" as const, participants: "Pat Example and staff" },
  occurredAt: "2026-11-09T15:00:00.000Z",
};

function approve(
  base: RenewalWorkspaceState,
  approvedBase: Parameters<typeof planRenewalWorkspaceAction>[2]["approvedBase"],
  approvedWorkingTerms: Parameters<
    typeof planRenewalWorkspaceAction
  >[2]["approvedWorkingTerms"] = null,
) {
  return planRenewalWorkspaceAction(
    base,
    {
      kind: "owner_response",
      outcome: "approved_terms",
      approval: evidence,
      ...(approvedBase
        ? {
            approvedBase: {
              amount: approvedBase.amount,
              scope: approvedBase.scope,
              expectedWorkingRevision: 1,
              expectedRecommendationRevision: 0,
            },
          }
        : {}),
    },
    {
      eventId: RESPONSE_EVENT,
      actorUid: "staff-1",
      recordedAt: "2026-11-10T15:00:00.000Z",
      approvedBase,
      approvedWorkingTerms,
    },
  );
}

describe("AC-S262-1 Amount approved on the approving branch only", () => {
  it("AC-S262-1: refuses invalid precision, a missing amount and an amount on a non-approving outcome", () => {
    expect(
      ApprovedBaseInputSchema.safeParse({
        amount: 1875.555,
        scope: "amount_only",
        expectedWorkingRevision: 1,
        expectedRecommendationRevision: 0,
      }).success,
    ).toBe(false);
    expect(
      ApprovedBaseInputSchema.safeParse({
        scope: "amount_only",
        expectedWorkingRevision: 1,
        expectedRecommendationRevision: 0,
      }).success,
    ).toBe(false);
    expect(() =>
      planRenewalWorkspaceAction(
        emptyRenewalWorkspace("701", CYCLE, {
          kind: "lease_end",
          dateIso: "2026-11-30",
          source: "RentVine lease end",
        }),
        {
          kind: "owner_response",
          outcome: "declined_non_renewal",
          approvedBase: {
            amount: 1875,
            scope: "amount_only",
            expectedWorkingRevision: 1,
            expectedRecommendationRevision: 0,
          },
        },
        {
          eventId: RESPONSE_EVENT,
          actorUid: "staff-1",
          recordedAt: "2026-11-10T15:00:00.000Z",
        },
      ),
    ).toThrow(/Only an approval records an amount approved/);
  });
});

describe("AC-S262-2 the planned change of one reviewed answer", () => {
  it("BEH-S262-1: a $1,850 recommendation and a $1,875 approval keep both, with the recommendation's provenance", () => {
    const stored = working({
      terms_rent: entry(1850, 1, {
        origin: "adopted_source",
        sourceLabel: "stored market comparison",
        recordedByLabel: "lead@pmikcmetro.com",
      }),
      terms_effective_date: entry("2026-12-01", 1),
    });
    let next = 900;
    const change = planApprovedBaseChange({
      leaseId: "701",
      stored,
      projected: projectCurrentCycleWorkingRecord(stored, {
        cycleId: CYCLE,
        previousCycleId: null,
      }),
      cycleId: CYCLE,
      amount: 1875,
      ownerResponseEventId: RESPONSE_EVENT,
      actor: { uid: "staff-2", label: "staff2@pmikcmetro.com" },
      recordedAt: "2026-11-10T15:00:00.000Z",
      newEventId: () => EVENT(next++),
    });
    expect(change.recommended).toEqual({ value: 1850, revision: 1 });
    expect(change.workingRevision).toBe(2);
    expect(change.record?.fields.recommended_rent).toMatchObject({
      value: 1850,
      origin: "adopted_source",
      sourceLabel: "stored market comparison",
      recordedByLabel: "lead@pmikcmetro.com",
      cycleId: CYCLE,
      preservedFrom: { field: "terms_rent", revision: 1, eventId: EVENT(1) },
    });
    expect(change.record?.fields.terms_rent).toMatchObject({
      value: 1875,
      revision: 2,
      cycleId: CYCLE,
      recordedByLabel: "staff2@pmikcmetro.com",
      basis: { kind: "owner_approval", ownerResponseEventId: RESPONSE_EVENT },
    });
    // Dates and every other field are left as they were.
    expect(change.record?.fields.terms_effective_date).toEqual(
      stored.fields.terms_effective_date,
    );
    expect(change.events.map((event) => event.doc.field)).toEqual([
      "recommended_rent",
      "terms_rent",
    ]);
  });

  it("BEH-S262-2: with no earlier recommendation the approved rent is never copied into one", () => {
    const change = planApprovedBaseChange({
      leaseId: "701",
      stored: null,
      projected: null,
      cycleId: CYCLE,
      amount: 1875,
      ownerResponseEventId: RESPONSE_EVENT,
      actor: { uid: "staff-2", label: "staff2@pmikcmetro.com" },
      recordedAt: "2026-11-10T15:00:00.000Z",
      newEventId: () => EVENT(901),
    });
    expect(change.recommended).toBeNull();
    expect(change.record?.fields.recommended_rent).toBeUndefined();
    expect(change.record?.fields.terms_rent?.value).toBe(1875);
  });

  it("BEH-S262-2: an answer re-recorded with the same amount keeps the delivered offer; a different amount is a terms change", () => {
    const start = emptyRenewalWorkspace("701", CYCLE, {
      kind: "lease_end",
      dateIso: "2026-11-30",
      source: "RentVine lease end",
    });
    const base = (amount: number, workingRevision: number) => ({
      amount,
      scope: "amount_only" as const,
      cycleId: CYCLE,
      workingRevision,
      recommended: { value: 1850, revision: 1 },
    });
    const first = approve(start, base(1875, 2));
    expect(first.termsRevision).toBe(1);
    const delivered = planRenewalWorkspaceAction(
      first,
      { kind: "activity", activity: "tenant_offer", outcome: "done" },
      {
        eventId: EVENT(501),
        actorUid: "staff-1",
        recordedAt: "2026-11-10T16:00:00.000Z",
      },
    );
    const same = approve(delivered, base(1875, 2));
    expect(same.termsRevision).toBe(1);
    expect(same.activities.tenant_offer?.termsRevision).toBe(1);
    const different = approve(delivered, base(1900, 3));
    expect(different.termsRevision).toBe(2);
    // An answer that no longer names an amount changes what the owner's answer covers.
    expect(approve(delivered, null).termsRevision).toBe(2);
  });

  it("BEH-S262-2: recording the same approved amount again keeps its revision", () => {
    const stored = working({
      terms_rent: entry(1875, 2, {
        basis: { kind: "owner_approval", ownerResponseEventId: EVENT(400) },
      }),
      recommended_rent: entry(1850, 1),
    });
    const change = planApprovedBaseChange({
      leaseId: "701",
      stored,
      projected: projectCurrentCycleWorkingRecord(stored, {
        cycleId: CYCLE,
        previousCycleId: null,
      }),
      cycleId: CYCLE,
      amount: 1875,
      ownerResponseEventId: RESPONSE_EVENT,
      actor: { uid: "staff-2", label: "staff2@pmikcmetro.com" },
      recordedAt: "2026-11-10T15:00:00.000Z",
      newEventId: () => EVENT(902),
    });
    expect(change.record).toBeNull();
    expect(change.workingRevision).toBe(2);
    expect(change.recommended).toEqual({ value: 1850, revision: 1 });
  });
});

describe("AC-S262-3 typed approval scope", () => {
  const cycleState = emptyRenewalWorkspace("701", CYCLE, {
    kind: "lease_end",
    dateIso: "2026-11-30",
    source: "RentVine lease end",
  });
  const amountOnly = approve(cycleState, {
    amount: 1875,
    scope: "amount_only",
    cycleId: CYCLE,
    workingRevision: 2,
    recommended: { value: 1850, revision: 1 },
  });
  const base = (revision: number, value = 1875) =>
    working({
      terms_rent: entry(value, revision, {
        basis: { kind: "owner_approval", ownerResponseEventId: RESPONSE_EVENT },
      }),
      terms_effective_date: entry("2026-12-01", 1),
      terms_end_date: entry("2027-11-30", 1),
    });

  it("BEH-S262-3: an approval of only $1,875 reads as amount-only and covers only its exact base revision", () => {
    const scope = ownerApprovalScope(amountOnly);
    expect(scope).toEqual({
      kind: "amount_only",
      cycleId: CYCLE,
      rent: 1875,
      rentRevision: 2,
    });
    expect(approvalCoversWorkingBase(scope, base(2))).toBe(true);
    expect(approvalCoversRenewalDates(scope)).toBe(false);
    // A later base revision makes it earlier evidence, even at the same amount.
    expect(approvalCoversWorkingBase(scope, base(3))).toBe(false);
  });

  it("AC-S262-3: changing a date or a charge never widens an amount-only approval", () => {
    const coverage = ownerApprovalCoverage({
      workspace: amountOnly,
      working: working({
        ...base(2).fields,
        terms_effective_date: entry("2027-01-01", 2),
      }),
      economicsHash: "a".repeat(64),
    });
    expect(coverage).toEqual({
      state: "amount_only",
      binding: { rent: 1875, rentRevision: 2 },
      rentCurrent: true,
    });
    expect(describeOwnerApprovalCoverage(coverage, fmt)).toMatch(
      /covers the base rent only: \$1875 per month \(Working revision 2\)\. The renewal dates and other charges are not covered\./,
    );
    // The packet's exact terms stay held with an exact notice.
    const packet = currentOwnerApproval({
      workspace: amountOnly,
      working: base(2),
      economicsHash: "a".repeat(64),
    });
    expect(packet.state).toBe("amount_only");
    expect(packet.facts).toEqual([]);
    expect(ownerApprovalNotice(packet.coverage)).toMatch(/base rent only/);
    // A source update preview says the same.
    expect(
      projectSourceUpdateTermsBasis({
        working: base(2),
        workspace: amountOnly,
        economicsHash: "a".repeat(64),
        returned: null,
        formatTime: (iso) => iso,
      }).approval,
    ).toMatch(/base rent only/);
  });

  it("AC-S262-3: an offer's charges are covered only by its exact approved offer snapshot", () => {
    const scope = ownerApprovalScope(amountOnly);
    const offer = { snapshotId: "offer-1", snapshotHash: "b".repeat(64) };
    expect(approvalCoversOfferSnapshot(scope, offer)).toBe(false);
    const legacyExact = approve(cycleState, null, {
      rent: 1875,
      effectiveDate: "2026-12-01",
      endDate: "2027-11-30",
      fieldRevisions: { rent: 2, effectiveDate: 1, endDate: 1 },
      economicsHash: "c".repeat(64),
      chargePolicyVersion: null,
    });
    // A recorded answer without an amount keeps its actual exact-terms coverage (no backfill).
    expect(ownerApprovalScope(legacyExact)?.kind).toBe("exact_terms");
    expect(approvalCoversRenewalDates(ownerApprovalScope(legacyExact))).toBe(true);
    // An unchanged packet hash is not an offer snapshot.
    expect(approvalCoversOfferSnapshot(ownerApprovalScope(legacyExact), offer)).toBe(
      false,
    );
    expect(
      approvalCoversOfferSnapshot(
        {
          kind: "offer_snapshot",
          cycleId: CYCLE,
          terms: legacyExact.ownerResponse!.approvedWorkingTerms!,
          offer,
        },
        offer,
      ),
    ).toBe(true);
  });
});
