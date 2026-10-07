import { describe, expect, it } from "vitest";

import type { ChargePolicyRecord } from "@/lib/lease-documents/charge-policy";
import {
  captureApprovedWorkingTerms,
  currentOwnerApproval,
  packetEconomics,
} from "@/lib/lease-documents/owner-approval-binding";
import type { PacketInputsRecord } from "@/lib/lease-documents/packet-inputs";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

const LEASE = "701";
const CYCLE = "40000000-0000-4000-8000-000000000001";

function working(
  terms: { rent?: number; effectiveDate?: string; endDate?: string },
  revisions: { rent?: number; effectiveDate?: number; endDate?: number } = {},
): RenewalWorkingRecord {
  const entry = (value: number | string, revision: number) => ({
    value,
    revision,
    eventId: "50000000-0000-4000-8000-000000000001",
    recordedAt: "2026-10-07T01:00:00.000Z",
    recordedByUid: "editor-1",
    recordedByLabel: "editor@pmikcmetro.com",
    origin: "staff_entry" as const,
  });
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: LEASE,
    revision: 3,
    fields: {
      ...(terms.rent !== undefined
        ? { terms_rent: entry(terms.rent, revisions.rent ?? 1) }
        : {}),
      ...(terms.effectiveDate !== undefined
        ? {
            terms_effective_date: entry(
              terms.effectiveDate,
              revisions.effectiveDate ?? 1,
            ),
          }
        : {}),
      ...(terms.endDate !== undefined
        ? { terms_end_date: entry(terms.endDate, revisions.endDate ?? 1) }
        : {}),
    },
  } as RenewalWorkingRecord;
}

const TERMS = { rent: 1250, effectiveDate: "2027-01-01", endDate: "2027-12-31" };
const POLICY: ChargePolicyRecord = {
  schemaVersion: "renewal-charge-policy/v1",
  version: 1,
  effectiveFrom: "2026-10-01",
  content: {
    residentBenefitPackage: null,
    insuranceProgram: null,
    animals: null,
  },
  publishedAt: "2026-10-01T12:00:00.000Z",
  publishedByUid: "admin-1",
};

function approve(
  state: RenewalWorkspaceState,
  record: RenewalWorkingRecord | null,
  inputs: PacketInputsRecord | null = null,
  policy: ChargePolicyRecord | null = POLICY,
) {
  return planRenewalWorkspaceAction(
    state,
    { kind: "owner_response", outcome: "approved_terms", source: "Owner phone call" },
    {
      actorUid: "editor-1",
      recordedAt: "2026-10-07T02:00:00.000Z",
      eventId: "60000000-0000-4000-8000-000000000001",
      approvedWorkingTerms: captureApprovedWorkingTerms({
        leaseId: LEASE,
        working: record,
        inputs,
        policy,
      }),
    },
  );
}

function base() {
  return emptyRenewalWorkspace(LEASE, CYCLE, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  } as never);
}

const hash = (policy: ChargePolicyRecord | null = POLICY) =>
  packetEconomics(LEASE, null, policy).hash;

describe("S66 owner approval bound to the exact Working terms (AC-S66-8, BEH-S66-3)", () => {
  it("accepts a current Working terms revision with recorded owner approval and supplies the approved facts", () => {
    const record = working(TERMS);
    const state = approve(base(), record);
    expect(state.ownerResponse?.approvedWorkingTerms).toMatchObject({
      ...TERMS,
      fieldRevisions: { rent: 1, effectiveDate: 1, endDate: 1 },
      chargePolicyVersion: "1",
    });
    const approval = currentOwnerApproval({
      workspace: state,
      working: record,
      economicsHash: hash(),
    });
    expect(approval.state).toBe("current");
    expect(
      approval.facts.map((fact) => [
        fact.fieldKey,
        fact.normalizedValue,
        fact.verifiedBy,
      ]),
    ).toEqual([
      ["renewal.approved_rent", 1250, "editor-1"],
      ["renewal.effective_date", "2027-01-01", "editor-1"],
      ["renewal.end_date", "2027-12-31", "editor-1"],
    ]);
    expect(approval.facts[0].source).toMatchObject({
      system: "staff_recorded_owner_approval",
      reference: `renewal-cycle:${CYCLE}:working-terms:1.1.1`,
    });
  });

  it("does not substitute legacy owner-response terms, an approval of incomplete terms, or a pricing review", () => {
    const legacy = planRenewalWorkspaceAction(
      base(),
      {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: TERMS,
        source: "Legacy terms on the response",
      },
      {
        actorUid: "editor-1",
        recordedAt: "2026-10-07T02:00:00.000Z",
        eventId: "60000000-0000-4000-8000-000000000002",
      },
    );
    expect(
      currentOwnerApproval({
        workspace: legacy,
        working: working(TERMS),
        economicsHash: hash(),
      }).state,
    ).toBe("no_working_terms");
    const incomplete = approve(base(), working({ rent: 1250 }));
    expect(incomplete.ownerResponse?.approvedWorkingTerms).toBeUndefined();
    expect(
      currentOwnerApproval({
        workspace: incomplete,
        working: working(TERMS),
        economicsHash: hash(),
      }),
    ).toEqual({ state: "no_working_terms", facts: [] });
    const reviewed = planRenewalWorkspaceAction(
      base(),
      { kind: "preparation", rangeLow: 1200, rangeHigh: 1300, pmiNumber: 1250 },
      {
        actorUid: "editor-1",
        recordedAt: "2026-10-07T02:00:00.000Z",
        eventId: "60000000-0000-4000-8000-000000000003",
      },
    );
    expect(
      currentOwnerApproval({
        workspace: reviewed,
        working: working(TERMS),
        economicsHash: hash(),
      }).state,
    ).toBe("not_recorded");
  });

  it("makes the approval stale when a covered term changes, even back to the same value", () => {
    const state = approve(base(), working(TERMS));
    expect(
      currentOwnerApproval({
        workspace: state,
        working: working({ ...TERMS, rent: 1300 }, { rent: 2 }),
        economicsHash: hash(),
      }).state,
    ).toBe("terms_changed");
    // A save that restores the same value still names a new revision of that term.
    expect(
      currentOwnerApproval({
        workspace: state,
        working: working(TERMS, { effectiveDate: 3 }),
        economicsHash: hash(),
      }).state,
    ).toBe("terms_changed");
  });

  it("makes the approval stale when the calculated charges change, and a renewed approval is a terms change", () => {
    const record = working(TERMS);
    const state = approve(base(), record);
    const republished = { ...POLICY, version: 2 };
    expect(
      currentOwnerApproval({
        workspace: state,
        working: record,
        economicsHash: hash(republished),
      }),
    ).toEqual({ state: "charges_changed", facts: [] });
    const renewed = approve(state, record, null, republished);
    expect(renewed.termsRevision).toBe(state.termsRevision + 1);
    expect(
      currentOwnerApproval({
        workspace: renewed,
        working: record,
        economicsHash: hash(republished),
      }).state,
    ).toBe("current");
  });
});
