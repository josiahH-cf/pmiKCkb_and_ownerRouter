import { describe, expect, it } from "vitest";

import type { ArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import type { CalculatedCharges } from "@/lib/lease-documents/charge-policy";
import {
  buildOfferAnswersView,
  describeOwnerOfferCoverage,
  describeTenantAnswerCoverage,
  offerAnswerCoverage,
  OfferAnswerInputSchema,
  ownerOfferApproval,
  readOfferAnswerRecord,
  type OfferAnswerRecord,
} from "@/lib/lease-renewal/offer-answers";
import { offerPacketComparisons } from "@/lib/lease-renewal/offer-packet-parity";
import {
  offerSnapshotIdentity,
  type FrozenOfferSnapshot,
  type OfferSnapshot,
} from "@/lib/lease-renewal/offer-snapshot";
import { ownerApprovalScope } from "@/lib/lease-renewal/owner-approval-scope";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";

// S264 R-S264-6 (AC-S264-6): which exact offer an answer covers, rechecked against the current
// offer; the owner's offer scope only from the answer's own record; and packet parity with the
// accepted offer's rows. Synthetic values only.

const CYCLE = "10000000-0000-4000-8000-000000007263";
function snapshot(petCents: number | null, extra: Partial<OfferSnapshot> = {}): FrozenOfferSnapshot {
  const value: OfferSnapshot = {
    schemaVersion: "renewal-offer-snapshot/v1",
    leaseId: "7263",
    cycleId: CYCLE,
    base: { rent: 920, revision: 2 },
    dates: { effectiveDate: "2027-02-01", effectiveRevision: 1, endDate: "2028-01-31", endRevision: 1 },
    rows:
      petCents === null
        ? []
        : [
            {
              rowKey: "rentvine:501",
              origin: "rentvine",
              family: "pet",
              label: "Pet rent",
              amountCents: petCents,
              cadence: { kind: "monthly" },
              effectiveFrom: "2027-02-01",
              comparison: petCents === 4500 ? "unchanged" : "changed",
              sourceRef: "rentvine:lease:7263:recurring-charge:501",
              sourceVersion: "v-501",
              trigger: null,
              mappingEntryId: "00000000-0000-4000-8000-000000009001",
            },
          ],
    transitions: { insurance: null, rbp: null },
    unchangedStatement: true,
    mappingVersion: 1,
    sourceState: "read",
    sourceVersion: "src",
    sourceLines: 1,
    ...extra,
  };
  return { ...offerSnapshotIdentity(value), snapshot: value };
}
function answer(party: "tenant" | "owner", offer: FrozenOfferSnapshot | null): OfferAnswerRecord {
  return {
    schemaVersion: "renewal-offer-answer/v1",
    leaseId: "7263",
    cycleId: CYCLE,
    eventId: "00000000-0000-4000-8000-0000000000e1",
    party,
    outcome: party === "owner" ? "approved_terms" : "accepted",
    attribution:
      party === "owner"
        ? { kind: "owner_reviewed_offer", reviewedByUid: "synthetic-staff" }
        : offer
          ? { kind: "linked_communication", sequenceId: "s1", occurrenceId: "o1", sentAtMs: 1 }
          : { kind: "unattributed" },
    offer,
    recordedAt: "2026-11-10T15:00:00.000Z",
    recordedByUid: "synthetic-staff",
  };
}

describe("S264 AC-S264-6 coverage is rechecked against the current offer", () => {
  it("covers only the identical offer; a charge-only change, a base change and an unread offer each say so", () => {
    const answered = snapshot(4500);
    expect(offerAnswerCoverage(answer("tenant", answered), snapshot(4500))).toEqual({
      state: "covers",
    });
    const chargeOnly = offerAnswerCoverage(answer("tenant", answered), snapshot(5000));
    expect(chargeOnly).toEqual({
      state: "earlier_offer",
      changes: ["Pet rent changed ($45.00 to $50.00)."],
      chargesOnly: true,
    });
    expect(describeTenantAnswerCoverage("accepted", chargeOnly)).toBe(
      "Current acceptance needs verification: it answers an earlier offer. Pet rent changed ($45.00 to $50.00).",
    );
    const rebased = offerAnswerCoverage(
      answer("tenant", answered),
      snapshot(4500, { base: { rent: 950, revision: 3 } }),
    );
    expect(rebased).toMatchObject({ state: "earlier_offer", chargesOnly: false });
    expect(offerAnswerCoverage(answer("tenant", answered), null)).toEqual({
      state: "current_unknown",
    });
    expect(
      describeTenantAnswerCoverage("accepted", offerAnswerCoverage(answer("tenant", null), answered)),
    ).toBe("Current acceptance needs verification: the answer is not linked to one exact offer.");
    expect(
      describeTenantAnswerCoverage("counter_change_requested", offerAnswerCoverage(answer("tenant", answered), answered)),
    ).toBe("This answer responds to the current offer.");
  });

  it("a stored record whose frozen offer was altered is not read as an answer", () => {
    const record = answer("tenant", snapshot(4500));
    expect(readOfferAnswerRecord(record)).toEqual(record);
    const altered = {
      ...record,
      offer: { ...record.offer!, snapshot: { ...record.offer!.snapshot, mappingVersion: 9 } },
    };
    expect(readOfferAnswerRecord(altered)).toBeNull();
  });

  it("the save request names one exact offer at most, by its own identity", () => {
    expect(OfferAnswerInputSchema.safeParse({ kind: "unattributed" }).success).toBe(true);
    expect(
      OfferAnswerInputSchema.safeParse({ kind: "external_offer", executionId: "exec_1", reference: "ok" })
        .success,
    ).toBe(false);
    expect(
      OfferAnswerInputSchema.safeParse({
        kind: "owner_reviewed_offer",
        snapshotId: "offer:7263",
        snapshotHash: "not-a-hash",
      }).success,
    ).toBe(false);
    expect(
      OfferAnswerInputSchema.safeParse({ kind: "newest_draft", executionId: "exec_1" }).success,
    ).toBe(false);
  });
});

describe("S264 AC-S264-6 the owner's offer scope comes only from the answer's own record", () => {
  const offer = snapshot(4500);
  const workspace = (approvedBase: Record<string, unknown> | undefined) =>
    ({
      cycleId: CYCLE,
      ownerResponse: {
        eventId: "00000000-0000-4000-8000-0000000000e1",
        outcome: "approved_terms",
        ...(approvedBase ? { approvedBase } : {}),
        approvedWorkingTerms: {
          rent: 920,
          effectiveDate: "2027-02-01",
          endDate: "2028-01-31",
          fieldRevisions: { rent: 2, effectiveDate: 1, endDate: 1 },
          economicsHash: "e".repeat(64),
          chargePolicyVersion: null,
        },
      },
    }) as unknown as RenewalWorkspaceState;

  it("an exact-terms answer with its offer record covers that offer; without it, the base and dates only", () => {
    const binding = ownerOfferApproval(answer("owner", offer));
    const scope = ownerApprovalScope(workspace(undefined), binding);
    expect(scope).toMatchObject({ kind: "offer_snapshot", offer: { snapshotHash: offer.snapshotHash } });
    expect(ownerApprovalScope(workspace(undefined))?.kind).toBe("exact_terms");
    expect(
      ownerApprovalScope(workspace(undefined), { ...binding!, eventId: "another-answer" })?.kind,
    ).toBe("exact_terms");
    expect(describeOwnerOfferCoverage(scope, offerAnswerCoverage(answer("owner", offer), offer))).toBe(
      "The owner's approval covers the current offer, charges included.",
    );
    expect(
      describeOwnerOfferCoverage(ownerApprovalScope(workspace(undefined)), { state: "not_attributed" }),
    ).toBe("The owner's approval covers the base and dates, not the offer's charges.");
  });

  it("an amount-only answer stays amount-only even beside an offer record", () => {
    const scope = ownerApprovalScope(
      workspace({ amount: 920, scope: "amount_only", cycleId: CYCLE, workingRevision: 2 }),
      ownerOfferApproval(answer("owner", offer)),
    );
    expect(scope?.kind).toBe("amount_only");
    expect(describeOwnerOfferCoverage(scope, { state: "not_attributed" })).toBe(
      "The owner approved the base rent only, so the offer's charges are not covered.",
    );
  });
});

describe("S264 AC-S264-6 the response editors' view rechecks each answer now", () => {
  const ownerEvent = "00000000-0000-4000-8000-0000000000e1";
  const tenantEvent = "00000000-0000-4000-8000-0000000000e2";
  const workspace = {
    leaseId: "7263",
    cycleId: CYCLE,
    tenantResponse: { eventId: tenantEvent, outcome: "accepted" },
    ownerResponse: {
      eventId: ownerEvent,
      outcome: "approved_terms",
      approvedWorkingTerms: {
        rent: 920,
        effectiveDate: "2027-02-01",
        endDate: "2028-01-31",
        fieldRevisions: { rent: 2, effectiveDate: 1, endDate: 1 },
        economicsHash: "e".repeat(64),
        chargePolicyVersion: null,
      },
    },
  } as unknown as RenewalWorkspaceState;

  it("names the offers a decision can answer and says why an earlier answer does not cover a changed charge", () => {
    const answered = snapshot(4500);
    const current = snapshot(5000);
    const view = buildOfferAnswersView({
      workspace,
      current,
      candidates: [
        {
          kind: "linked_communication",
          sequenceId: "s1",
          occurrenceId: "o1",
          atMs: Date.parse("2026-11-09T16:00:00.000Z"),
          offer: answered,
        },
        { kind: "external_offer", executionId: "exec_1", atMs: null, offer: current },
      ],
      tenantRecord: { ...answer("tenant", answered), eventId: tenantEvent },
      ownerRecord: answer("owner", answered),
    });
    expect(view).toEqual({
      current: {
        snapshotId: current.snapshotId,
        snapshotHash: current.snapshotHash,
        summary: "Rent $920.00 per month; Pet rent $50.00 per month",
        charged: true,
      },
      candidates: [
        {
          kind: "linked_communication",
          sequenceId: "s1",
          occurrenceId: "o1",
          at: "2026-11-09T16:00:00.000Z",
          snapshotId: answered.snapshotId,
          summary: "Rent $920.00 per month; Pet rent $45.00 per month",
          current: false,
        },
        {
          kind: "external_offer",
          executionId: "exec_1",
          at: null,
          snapshotId: current.snapshotId,
          summary: "Rent $920.00 per month; Pet rent $50.00 per month",
          current: true,
        },
      ],
      tenant: {
        outcome: "accepted",
        eventId: tenantEvent,
        attribution: "linked_communication",
        answered: "Rent $920.00 per month; Pet rent $45.00 per month",
        coverage: "earlier_offer",
        line: "Current acceptance needs verification: it answers an earlier offer. Pet rent changed ($45.00 to $50.00).",
      },
      owner: {
        eventId: ownerEvent,
        scope: "offer_snapshot",
        coverage: "earlier_offer",
        line: "The owner approved an earlier offer, so the current offer's charges are not covered. Pet rent changed ($45.00 to $50.00).",
      },
    });
  });

  it("an answer recorded without its offer, or a record of the other party, covers no charges", () => {
    const view = buildOfferAnswersView({
      workspace,
      current: snapshot(4500),
      candidates: [],
      tenantRecord: answer("owner", snapshot(4500)),
      ownerRecord: null,
    });
    expect(view.tenant).toMatchObject({
      attribution: null,
      answered: null,
      coverage: "not_attributed",
      line: "Current acceptance needs verification: the answer is not linked to one exact offer.",
    });
    expect(view.owner).toEqual({
      eventId: ownerEvent,
      scope: "exact_terms",
      coverage: "not_attributed",
      line: "The owner's approval covers the base and dates, not the offer's charges.",
    });
    expect(
      buildOfferAnswersView({
        workspace: null,
        current: null,
        candidates: [],
        tenantRecord: null,
        ownerRecord: null,
      }),
    ).toEqual({ current: null, candidates: [], tenant: null, owner: null });
  });
});

describe("S264 AC-S264-6 packet parity with the accepted offer's rows", () => {
  const manifest = (maps: Record<string, string[]>) =>
    ({
      state: "readable",
      entries: Object.fromEntries(
        Object.entries(maps).map(([kind, keys]) => [
          kind,
          { fieldMap: { fields: keys.map((factKey) => ({ factKey })) } },
        ]),
      ),
    }) as unknown as ArtifactIntakeManifest;
  const economics = (charges: Array<Record<string, unknown>>) =>
    ({ charges }) as unknown as CalculatedCharges;

  it("a form that reads a shared charge is compared; a difference holds that form alone, with the exact amounts", () => {
    const accepted = snapshot(4500, {
      rows: [
        ...snapshot(4500).snapshot.rows,
        {
          ...snapshot(4500).snapshot.rows[0]!,
          rowKey: "rentvine:502",
          family: "insurance",
          label: "Insurance program",
          amountCents: 1250,
        },
      ],
    }).snapshot;
    const result = offerPacketComparisons({
      manifest: manifest({
        insurance_program_addendum: ["charges.insurance.monthly"],
        animal_agreement: ["animal.monthly_charge"],
        lead_disclosure: ["property.year_built"],
      }),
      economics: economics([
        { kind: "insurance", applicable: true, amountCents: 1500, cadence: "monthly" },
        { kind: "animal", applicable: true, amountCents: 4500, cadence: "monthly" },
        { kind: "animal", applicable: true, amountCents: 30000, cadence: "refundable_deposit" },
      ]),
      accepted,
    });
    expect(result).toEqual([
      {
        family: "animal_agreement",
        state: "match",
        charge: "Pet rent",
        offer: "$45.00 per month",
        packet: "$45.00 per month",
      },
      {
        family: "insurance_program_addendum",
        state: "discrepancy",
        charge: "Insurance",
        offer: "$12.50 per month",
        packet: "$15.00 per month",
      },
    ]);
  });

  it("a charge only one side carries is a discrepancy; an unpriced packet charge or no acceptance compares nothing", () => {
    const map = manifest({ renewal_extension: ["charges.resident_benefit_package.monthly"] });
    expect(
      offerPacketComparisons({
        manifest: map,
        economics: economics([
          { kind: "resident_benefit_package", applicable: true, amountCents: 3000, cadence: "monthly" },
        ]),
        accepted: snapshot(4500).snapshot,
      }),
    ).toEqual([
      {
        family: "renewal_extension",
        state: "discrepancy",
        charge: "Resident Benefits Package",
        offer: "no such charge",
        packet: "$30.00 per month",
      },
    ]);
    expect(
      offerPacketComparisons({
        manifest: map,
        economics: economics([
          { kind: "resident_benefit_package", applicable: null, cadence: "monthly" },
        ]),
        accepted: snapshot(4500).snapshot,
      }),
    ).toEqual([]);
    expect(
      offerPacketComparisons({ manifest: map, economics: economics([]), accepted: null }),
    ).toEqual([]);
  });
});
