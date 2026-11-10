import { describe, expect, it } from "vitest";

import {
  currentCycleFieldEmpty,
  futureTermScope,
  offerAdoptionCandidate,
  projectCurrentCycleWorkingRecord,
  recommendationFact,
  recommendationField,
  recommendedRentValue,
  storedWorkingRevision,
  type ActiveCycleEvidence,
} from "@/lib/lease-renewal/current-cycle-terms";
import { effectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import { workingTermsFingerprint } from "@/lib/lease-renewal/message-claim-basis";
import {
  workingRenewalTerms,
  type RenewalWorkingRecord,
  type WorkingFieldEntry,
} from "@/lib/lease-renewal/working-record";

// S262 R-S262-5 (ARCH-S262-5, BEH-S262-5, AC-S262-5): one current-cycle rule decides which future
// renewal terms read as current. Synthetic leases, cycles and amounts only.

const CYCLE_A = "0f1c8f6e-6d1c-4bd3-9d7a-00000000000a";
const CYCLE_B = "0f1c8f6e-6d1c-4bd3-9d7a-00000000000b";
const EVENT = (n: number) => `0f1c8f6e-6d1c-4bd3-9d7a-${String(n).padStart(12, "0")}`;

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
    recordedByUid: "editor-1",
    recordedByLabel: "editor1@pmikcmetro.com",
    origin: "staff_entry",
    ...extra,
  };
}

function record(fields: Record<string, WorkingFieldEntry>): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: "701",
    revision: 9,
    fields,
  };
}

const firstCycle: ActiveCycleEvidence = { cycleId: CYCLE_A, previousCycleId: null };
const secondCycle: ActiveCycleEvidence = { cycleId: CYCLE_B, previousCycleId: CYCLE_A };
const legacyCycle: ActiveCycleEvidence = { cycleId: CYCLE_A };

describe("AC-S262-5 current-cycle future terms", () => {
  it("AC-S262-5: a new cycle reads none of the previous cycle's recommendation, approved rent or dates as current", () => {
    const stored = record({
      terms_rent: entry(1875, 3, {
        cycleId: CYCLE_A,
        basis: { kind: "owner_approval", ownerResponseEventId: EVENT(40) },
      }),
      recommended_rent: entry(1850, 1, { cycleId: CYCLE_A }),
      terms_effective_date: entry("2026-12-01", 1, { cycleId: CYCLE_A }),
      terms_end_date: entry("2027-11-30", 1, { cycleId: CYCLE_A }),
      current_rent: entry(1800, 1),
    });
    const projected = projectCurrentCycleWorkingRecord(stored, secondCycle)!;
    expect(workingRenewalTerms(projected)).toMatchObject({
      rent: null,
      effectiveDate: null,
      endDate: null,
    });
    expect(effectiveRenewalTerms(projected).complete).toBeNull();
    expect(recommendedRentValue(projected)).toBeNull();
    // Lease facts keep their lease scope.
    expect(projected.fields.current_rent?.value).toBe(1800);
    // Earlier values stay as history with their scope, and the stored revision still guards a save.
    expect(projected.cycle?.held.terms_rent).toMatchObject({ scope: "earlier" });
    expect(storedWorkingRevision(projected, "terms_rent")).toBe(3);
    // An earlier cycle's value leaves this cycle's field authoritatively empty for S249.
    expect(currentCycleFieldEmpty(projected, "terms_rent")).toBe(true);
    // The same record restored for its own cycle keeps every value.
    const same = projectCurrentCycleWorkingRecord(stored, {
      cycleId: CYCLE_A,
      previousCycleId: null,
    })!;
    expect(workingRenewalTerms(same)).toMatchObject({
      rent: 1875,
      effectiveDate: "2026-12-01",
      endDate: "2027-11-30",
    });
  });

  it("AC-S262-5: a value saved before the lease had a work record belongs to the first cycle, and to no later one", () => {
    const stored = record({ terms_rent: entry(1900, 1, { cycleId: null }) });
    expect(projectCurrentCycleWorkingRecord(stored, null)!.fields.terms_rent?.value).toBe(
      1900,
    );
    expect(
      projectCurrentCycleWorkingRecord(stored, firstCycle)!.fields.terms_rent?.value,
    ).toBe(1900);
    expect(futureTermScope("terms_rent", stored.fields.terms_rent!, secondCycle)).toBe(
      "earlier",
    );
  });

  it("AC-S262-5: an unbound legacy value is neither current nor empty until its owner confirms it", () => {
    const stored = record({
      terms_rent: entry(1850, 2),
      terms_effective_date: entry("2026-12-01", 1),
    });
    const projected = projectCurrentCycleWorkingRecord(stored, legacyCycle)!;
    expect(workingRenewalTerms(projected).rent).toBeNull();
    expect(projected.cycle?.held.terms_rent).toMatchObject({ scope: "unverified" });
    expect(currentCycleFieldEmpty(projected, "terms_rent")).toBe(false);
    expect(currentCycleFieldEmpty(projected, "terms_effective_date")).toBe(false);
    // The editor's revision check still reads the stored revision.
    expect(storedWorkingRevision(projected, "terms_rent")).toBe(2);
  });

  it("AC-S262-5: a legacy value proved by the exact approval or tenant answer on the active cycle stays current", () => {
    const stored = record({
      terms_rent: entry(1850, 2),
      terms_effective_date: entry("2026-12-01", 1),
      terms_end_date: entry("2027-11-30", 4),
    });
    const approved: ActiveCycleEvidence = {
      cycleId: CYCLE_A,
      ownerResponse: {
        outcome: "approved_terms",
        approvedWorkingTerms: {
          rent: 1850,
          effectiveDate: "2026-12-01",
          endDate: "2027-11-30",
          fieldRevisions: { rent: 2, effectiveDate: 1, endDate: 3 },
        },
      },
    };
    const projected = projectCurrentCycleWorkingRecord(stored, approved)!;
    expect(projected.fields.terms_rent?.value).toBe(1850);
    expect(projected.fields.terms_effective_date?.value).toBe("2026-12-01");
    // A different revision than the review captured is not proved by it.
    expect(projected.cycle?.held.terms_end_date).toMatchObject({ scope: "unverified" });
    const answered: ActiveCycleEvidence = {
      cycleId: CYCLE_A,
      tenantResponse: { workingTermRevisions: { rent: 0, effectiveDate: 0, endDate: 4 } },
    };
    expect(
      projectCurrentCycleWorkingRecord(stored, answered)!.fields.terms_end_date?.value,
    ).toBe("2027-11-30");
  });

  it("AC-S262-5: a legacy S249 preparation that named the active cycle proves its rent; another cycle's does not", () => {
    const prepared = entry(1910, 1, {
      origin: "adopted_source",
      sourceLabel: "stored market comparison",
      context: JSON.stringify({ cycleId: CYCLE_A, cycleDateIso: "2026-11-30" }),
    });
    expect(futureTermScope("terms_rent", prepared, legacyCycle)).toBe("current");
    expect(futureTermScope("terms_rent", prepared, { cycleId: CYCLE_B })).toBe(
      "unverified",
    );
    // A review that recorded no recommendation cannot establish one.
    expect(
      futureTermScope("recommended_rent", entry(1850, 1), {
        cycleId: CYCLE_A,
        ownerResponse: {
          outcome: "approved_terms",
          approvedWorkingTerms: {
            rent: 1850,
            effectiveDate: "2026-12-01",
            endDate: "2027-11-30",
            fieldRevisions: { rent: 1, effectiveDate: 1, endDate: 1 },
          },
        },
      }),
    ).toBe("unverified");
  });

  it("AC-S262-5: a legacy value meets a cycle established since binding only as history", () => {
    const stored = record({ terms_rent: entry(1850, 2) });
    expect(futureTermScope("terms_rent", stored.fields.terms_rent!, secondCycle)).toBe(
      "earlier",
    );
    expect(futureTermScope("terms_rent", stored.fields.terms_rent!, firstCycle)).toBe(
      "current",
    );
  });

  it("AC-S262-5: the exact claim fingerprint changes when a value stops being current", () => {
    const stored = record({
      terms_rent: entry(1850, 1, { cycleId: CYCLE_A }),
      terms_effective_date: entry("2026-12-01", 1, { cycleId: CYCLE_A }),
      terms_end_date: entry("2027-11-30", 1, { cycleId: CYCLE_A }),
    });
    const current = workingTermsFingerprint(
      projectCurrentCycleWorkingRecord(stored, firstCycle),
    );
    const later = workingTermsFingerprint(
      projectCurrentCycleWorkingRecord(stored, secondCycle),
    );
    expect(current).not.toBe(later);
    // Projecting twice is the same projection.
    const twice = projectCurrentCycleWorkingRecord(
      projectCurrentCycleWorkingRecord(stored, secondCycle),
      firstCycle,
    );
    expect(workingTermsFingerprint(twice)).toBe(current);
  });
});

describe("R-S262-2 recommendation and working base", () => {
  it("BEH-S262-2: one undifferentiated working value serves both until the base has its own value", () => {
    const shared = record({ terms_rent: entry(1850, 1, { cycleId: CYCLE_A }) });
    expect(recommendationFact(shared).kind).toBe("shared");
    expect(recommendationField(shared)).toBe("terms_rent");
    expect(recommendedRentValue(shared)).toBe(1850);
    expect(offerAdoptionCandidate(shared)).toBeNull();
  });

  it("BEH-S262-2: after an approved base the recommendation is read independently", () => {
    const split = record({
      terms_rent: entry(1875, 2, {
        cycleId: CYCLE_A,
        basis: { kind: "owner_approval", ownerResponseEventId: EVENT(40) },
      }),
      recommended_rent: entry(1900, 3, { cycleId: CYCLE_A }),
    });
    expect(recommendationField(split)).toBe("recommended_rent");
    expect(recommendedRentValue(split)).toBe(1900);
    expect(workingRenewalTerms(split).rent).toBe(1875);
    expect(offerAdoptionCandidate(split)).toEqual({
      value: 1900,
      recommendationRevision: 3,
      workingRevision: 2,
      workingValue: 1875,
    });
    // An equal amount needs no adoption.
    const same = record({
      ...split.fields,
      recommended_rent: entry(1875, 4, { cycleId: CYCLE_A }),
    });
    expect(offerAdoptionCandidate(same)).toBeNull();
  });

  it("BEH-S262-2: an approval with no earlier recommendation leaves it unavailable, never the approved rent", () => {
    const approvedOnly = record({
      terms_rent: entry(1875, 1, {
        cycleId: CYCLE_A,
        basis: { kind: "owner_approval", ownerResponseEventId: EVENT(40) },
      }),
    });
    expect(recommendationFact(approvedOnly).kind).toBe("unavailable");
    expect(recommendedRentValue(approvedOnly)).toBeNull();
    expect(recommendationField(approvedOnly)).toBe("recommended_rent");
  });
});
