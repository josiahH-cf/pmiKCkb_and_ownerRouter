import { describe, expect, it } from "vitest";

import {
  emptyOfferChargeSelection,
  projectOfferCharges,
  type OfferChargeSelection,
  type OfferSourceLine,
} from "@/lib/lease-renewal/offer-charges";
import {
  OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
  type OfferChargeMappingsRead,
} from "@/lib/lease-renewal/offer-charge-mapping";
import {
  buildOfferSnapshot,
  describeOfferSnapshotChanges,
  offerLineVersion,
  offerSnapshotIntact,
  offerSnapshotIsMaterial,
  offerTermsUnchanged,
} from "@/lib/lease-renewal/offer-snapshot";
import {
  approvalCoversOfferSnapshot,
  type OwnerApprovalScope,
} from "@/lib/lease-renewal/owner-approval-scope";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";

// S264 R-S264-6 (AC-S264-6, the snapshot half): the immutable offer snapshot binds lease, cycle,
// the reviewed current-cycle working base and dates, the canonical selected rows and the mapping
// and source versions. Its identity is S262's `OfferSnapshotIdentity`, so a charge-only change
// keeps base and dates but can never be covered by an answer to the earlier snapshot.

const LEASE = "7264";
const CYCLE = "10000000-0000-4000-8000-000000007264";
const RENEWAL = "2027-02-01";

const working = {
  leaseId: LEASE,
  revision: 3,
  cycle: { cycleId: CYCLE },
  fields: {
    terms_rent: { value: 920, revision: 2 },
    terms_effective_date: { value: RENEWAL, revision: 1 },
    terms_end_date: { value: "2028-01-31", revision: 1 },
  },
} as unknown as RenewalWorkingRecord;

const pet: OfferSourceLine = {
  chargeId: "301",
  accountId: "9001",
  accountName: "Synthetic Pet Rent",
  description: "Synthetic pet rent",
  classification: "non_rent",
  amount: "45.00",
  frequency: "1",
  startDate: "2026-02-01",
  endDate: null,
  endDateRaw: null,
  statusId: 1,
  version: "v-301",
};
const mappings = (version: number): OfferChargeMappingsRead => ({
  readable: true,
  record: {
    schemaVersion: OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
    version,
    entries: [
      {
        entryId: "00000000-0000-4000-8000-000000009001",
        accountId: "9001",
        accountName: "Synthetic Pet Rent",
        displayLabel: "Pet rent",
        family: "pet" as const,
        frequencyMonths: 1,
        applicability: "active_on_renewal_date" as const,
        requirement: null,
        approval: { reference: "Synthetic approval note", approvedOn: "2026-11-01" },
      },
    ],
    updatedAt: "2026-11-02T15:00:00.000Z",
    updatedByUid: "synthetic-admin",
  },
});

function snapshot(
  input: {
    lines?: OfferSourceLine[];
    mappingVersion?: number;
    selection?: OfferChargeSelection;
    record?: RenewalWorkingRecord | null;
  } = {},
) {
  const lines = input.lines ?? [pet];
  const source = {
    state: "read" as const,
    asOf: "2026-11-10",
    lines,
    version: lines.map((l) => l.version).join(","),
  };
  const review = projectOfferCharges({
    leaseId: LEASE,
    source,
    mappings: mappings(input.mappingVersion ?? 1),
    selection: input.selection ?? null,
    terms: { rent: 920, effectiveDate: RENEWAL },
  });
  return buildOfferSnapshot({
    leaseId: LEASE,
    cycleId: CYCLE,
    working: input.record === undefined ? working : input.record,
    review,
    source,
  });
}

describe("S264 AC-S264-6 the offer snapshot", () => {
  it("binds lease, cycle, the working base and dates with their revisions, the canonical rows and the versions", () => {
    const frozen = snapshot();
    expect(frozen.snapshot).toMatchObject({
      leaseId: LEASE,
      cycleId: CYCLE,
      base: { rent: 920, revision: 2 },
      dates: {
        effectiveDate: RENEWAL,
        effectiveRevision: 1,
        endDate: "2028-01-31",
        endRevision: 1,
      },
      mappingVersion: 1,
      sourceState: "read",
      sourceLines: 1,
      unchangedStatement: true,
    });
    expect(
      frozen.snapshot.rows.map((row) => [row.rowKey, row.amountCents, row.sourceVersion]),
    ).toEqual([["rentvine:301", 4500, "v-301"]]);
    expect(frozen.snapshotId).toBe(
      `offer:${LEASE}:${CYCLE}:${frozen.snapshotHash.slice(0, 16)}`,
    );
    expect(offerSnapshotIntact(frozen)).toBe(true);
    expect(
      offerSnapshotIntact({
        ...frozen,
        snapshot: { ...frozen.snapshot, mappingVersion: 9 },
      }),
    ).toBe(false);
    // The same reviewed inputs freeze the same identity.
    expect(snapshot().snapshotHash).toBe(frozen.snapshotHash);
  });

  it("an unbound or prior-cycle working value is not current: the projected record without it leaves the base unentered", () => {
    expect(snapshot({ record: null }).snapshot.base).toEqual({
      rent: null,
      revision: null,
    });
  });

  it("a charge-only change at the same base and dates is a new snapshot an earlier answer cannot cover", () => {
    const answered = snapshot();
    const scope: OwnerApprovalScope = {
      kind: "offer_snapshot",
      cycleId: CYCLE,
      terms: {
        rent: 920,
        effectiveDate: RENEWAL,
        endDate: "2028-01-31",
        fieldRevisions: { rent: 2, effectiveDate: 1, endDate: 1 },
        economicsHash: "e".repeat(64),
        chargePolicyVersion: null,
      },
      offer: { snapshotId: answered.snapshotId, snapshotHash: answered.snapshotHash },
    };
    expect(approvalCoversOfferSnapshot(scope, answered)).toBe(true);
    const corrected = snapshot({
      selection: {
        ...emptyOfferChargeSelection(),
        decisions: [
          {
            rowKey: "rentvine:301",
            choice: "include",
            reason: null,
            renewalAmountCents: 5000,
            effectiveDate: null,
            correctionSource: "Synthetic signed pet addendum",
            reviewed: { sourceVersion: "v-301", renewalDate: RENEWAL, mappingVersion: 1 },
          },
        ],
      },
    });
    expect(offerTermsUnchanged(answered.snapshot, corrected.snapshot)).toBe(true);
    expect(approvalCoversOfferSnapshot(scope, corrected)).toBe(false);
    expect(describeOfferSnapshotChanges(answered.snapshot, corrected.snapshot)).toEqual([
      "Pet rent changed ($45.00 to $50.00).",
    ]);
    // A mapping revision at the same amount is a different snapshot too.
    const remapped = snapshot({ mappingVersion: 2 });
    expect(remapped.snapshot.rows.map((row) => row.amountCents)).toEqual([4500]);
    expect(approvalCoversOfferSnapshot(scope, remapped)).toBe(false);
    expect(describeOfferSnapshotChanges(answered.snapshot, remapped.snapshot)).toEqual([
      "The offer charge mapping changed.",
    ]);
    // Amount-only and exact-terms approvals never cover offer charges.
    expect(
      approvalCoversOfferSnapshot(
        { kind: "amount_only", cycleId: CYCLE, rent: 920, rentRevision: 2 },
        answered,
      ),
    ).toBe(false);
  });

  it("an offer with no charge line, transition or source line adds nothing to an earlier send basis", () => {
    const none = buildOfferSnapshot({
      leaseId: LEASE,
      cycleId: CYCLE,
      working,
      review: projectOfferCharges({
        leaseId: LEASE,
        source: { state: "not_read" },
        mappings: mappings(1),
        selection: null,
        terms: { rent: 920, effectiveDate: RENEWAL },
      }),
      source: { state: "not_read" },
    });
    expect(offerSnapshotIsMaterial(none.snapshot)).toBe(false);
    expect(offerSnapshotIsMaterial(snapshot().snapshot)).toBe(true);
  });

  it("the line version ignores billing bookkeeping and follows every material field", () => {
    const projection = {
      leaseRecurringChargeID: "301",
      leaseID: LEASE,
      accountID: "9001",
      amount: "45.00",
      description: "Synthetic pet rent",
      dayDue: "1",
      frequency: "1",
      startDate: "2026-02-01",
      isMoveInCharge: "0",
      isFromImport: "0",
      endDate: null,
      nextChargeDate: "2026-12-01",
      rentIncreaseID: null,
      importSourceKey: null,
      recurringStatusID: 1 as const,
    };
    const version = offerLineVersion(projection);
    expect(
      offerLineVersion({ ...projection, nextChargeDate: "2027-01-01", dayDue: "5" }),
    ).toBe(version);
    expect(offerLineVersion({ ...projection, amount: "45.01" })).not.toBe(version);
    expect(offerLineVersion({ ...projection, endDate: "2027-01-31" })).not.toBe(version);
    expect(offerLineVersion({ ...projection, recurringStatusID: 3 })).not.toBe(version);
  });
});
