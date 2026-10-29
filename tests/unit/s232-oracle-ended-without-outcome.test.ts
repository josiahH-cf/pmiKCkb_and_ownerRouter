import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { LEASE_RENEWAL_PROGRESS_COLLECTIONS } from "@/lib/firestore/lease-renewal-progress-schema";
import { LEASE_RENEWAL_COLLECTIONS } from "@/lib/firestore/lease-renewal-resolutions";
import { RENEWAL_WORKSPACE_COLLECTIONS } from "@/lib/firestore/renewal-workspace";
import {
  INDEPENDENT_ONE_STATUS_CONTRACT_MARKER,
  INDEPENDENT_STAFF_LANE_CONTRACT_MARKER,
  projectIndependentRentVineRows,
  type IndependentExpectedContractMarker,
  type IndependentSheetProjection,
} from "@/lib/production-assurance/renewal-source-projection";
import {
  buildExpectedProjectionRows,
  countIndependentExpectedRowStateMismatches,
  countIndependentRowGuidanceMismatches,
  readIndependentDecisionFacts,
  type ExpectedProjectionRow,
  type IndependentDecisionFacts,
  type RenderedProjectionRow,
} from "../../scripts/run-production-reconciliation";

// Synthetic fixtures only: no lease, person, address or amount here belongs to a real record.
const ORIGIN = "https://candidate.example";
const RENTVINE_HOST = "synthetic.rentvine.com";
// AC-S232-1's portfolio date: November 2, 2026 (Central).
const REFERENCE_DATE = "2026-11-02";
const ONE_STATUS = INDEPENDENT_ONE_STATUS_CONTRACT_MARKER;

const RENTVINE_ROWS: Record<string, unknown>[] = [
  // 801: an October-ending fixed-term lease with no app progress.
  { lease: { leaseID: 801, endDate: "2026-10-31", tenants: [{ name: "Tenant A" }] } },
  // 802: the same end date with an app progress record.
  { lease: { leaseID: 802, endDate: "2026-10-31", tenants: [{ name: "Tenant B" }] } },
  // 803: ended, but month to month.
  { lease: { leaseID: 803, endDate: "2026-10-31", tenants: [{ name: "Tenant C" }] } },
  // 804: ends inside the window.
  { lease: { leaseID: 804, endDate: "2026-12-31", tenants: [{ name: "Tenant D" }] } },
  // 805: ends after the window, so it has not ended.
  { lease: { leaseID: 805, endDate: "2027-06-30", tenants: [{ name: "Tenant E" }] } },
  // 806: month to month with an anchor whose next review falls after the window.
  { lease: { leaseID: 806, endDate: "2026-06-30", tenants: [{ name: "Tenant F" }] } },
  // 808: ended on the first day of the window, so it is still in the window.
  { lease: { leaseID: 808, endDate: "2026-11-01", tenants: [{ name: "Tenant H" }] } },
  // 807: ended, but outside the worklist by its source marker.
  {
    lease: {
      leaseID: 807,
      endDate: "2026-10-31",
      programName: "Section 8",
      tenants: [{ name: "Tenant G" }],
    },
  },
].map((row) => ({
  ...row,
  property: {
    address: `${String((row.lease as { leaseID: number }).leaseID)} Sample Way`,
  },
  portfolio: { owners: [{ companyName: "Sample Owner LLC" }] },
}));
const LEASE_DETAILS = new Map<string, Record<string, unknown>>([
  ["801", { leaseID: "801", baseRentAmount: 1250 }],
  ["802", { leaseID: "802", baseRentAmount: 1250 }],
  ["803", { leaseID: "803", baseRentAmount: 1250, isMonthToMonth: "1" }],
  ["804", { leaseID: "804", baseRentAmount: 1250 }],
  ["805", { leaseID: "805", baseRentAmount: 1250 }],
  [
    "806",
    {
      leaseID: "806",
      baseRentAmount: 1250,
      isMonthToMonth: "1",
      monthToMonthStartDate: "2025-06-15",
    },
  ],
  ["807", { leaseID: "807", baseRentAmount: 1250 }],
  ["808", { leaseID: "808", baseRentAmount: 1250 }],
]);
const SHEET: IndependentSheetProjection = {
  leaseUrls: new Map(),
  byLeaseId: new Map(),
  ambiguousLeaseIds: [],
  sourceDigest: "synthetic-sheet-digest",
};
const decisions = (progressLeaseIds?: ReadonlySet<string>): IndependentDecisionFacts => ({
  resolutions: [],
  trackedIncompleteLeaseIds: new Set(),
  ...(progressLeaseIds ? { progressLeaseIds } : {}),
  manualByLease: new Map(),
  staffLaneManualByLease: new Map(),
});
const BASE_ROWS = projectIndependentRentVineRows(
  RENTVINE_ROWS,
  SHEET.leaseUrls,
  LEASE_DETAILS,
  RENTVINE_HOST,
);
const expectedRows = (facts: IndependentDecisionFacts) =>
  buildExpectedProjectionRows(
    BASE_ROWS,
    RENTVINE_ROWS,
    SHEET,
    facts,
    REFERENCE_DATE,
    LEASE_DETAILS,
    "staff_lane",
  );
const EXPECTED = expectedRows(decisions(new Set(["802"])));
const row = (id: string, rows: readonly ExpectedProjectionRow[] = EXPECTED) => {
  const found = rows.find((candidate) => candidate.leaseId === id);
  if (!found) throw new Error(`missing synthetic lease ${id}`);
  return found;
};

/** A rendered row that differs from its expectation only in the retention attribute. */
function observed(
  expected: ExpectedProjectionRow,
  retentionState: string,
): RenderedProjectionRow {
  return {
    leaseId: expected.leaseId,
    address: expected.address,
    owners: expected.owners,
    tenants: expected.tenants,
    endDate: expected.endDate,
    endDateDisplayMatches: true,
    baseRent: expected.baseRent,
    rentvineSourceUrl: expected.rentvineRecordUrl ?? null,
    rentvineRecordUrl: expected.rentvineRecordUrl ?? null,
    disposition: expected.dispositionExpected,
    guidanceContract: ONE_STATUS,
    statusFilterHrefs: [],
    manual: { complete: "none", nextActivity: "none", pendingSourceUpdates: "none" },
    retentionState,
    processState: {
      processStatus: "none",
      currentStepId: "none",
      currentStepState: "none",
      waitingParty: "none",
    },
    status: {
      rentVerification: "needs_verification",
      verifiedByResolutionDiffers: "false",
      overallStatus: "needs_review",
      isBlocked: "false",
      blockerCount: 0,
    },
    workspace: {
      workspaceAvailable: "true",
      primaryHrefs: [],
      baseRentPhaseHrefs: [],
      rentVerificationPhaseHrefs: [],
      rentVerificationSourceLinks: [],
    },
    action: {
      actionKind: "review",
      destinationKind: null,
      stepId: "none",
      requiredCapability: "none",
      declaredBlockerCount: "0",
      blockers: [],
      phaseHrefs: [],
      accessHrefs: [],
    },
  };
}

/** Extra mismatches when the row renders `ended_without_outcome` instead of its expected state. */
const endedDelta = (
  expected: ExpectedProjectionRow,
  marker?: IndependentExpectedContractMarker,
) => {
  const count = (retentionState: string) =>
    countIndependentRowGuidanceMismatches({
      contract: "staff_lane",
      expectedRow: expected,
      observedRow: observed(expected, retentionState),
      role: "Admin",
      origin: ORIGIN,
      ...(marker ? { expectedGuidanceContract: marker } : {}),
    }).fieldMismatches;
  return count("ended_without_outcome") - count(expected.retentionExpected);
};

describe("S232 oracle: ended without a recorded outcome (ARCH-S232-1, AC-S232-1)", () => {
  it("bounds the state to an ended fixed-term lease with no app progress record", () => {
    expect(row("801").retentionExpected).toBe("outside");
    expect(row("801").endedWithoutOutcomeEligible).toBe(true);
    // A progress record, a month-to-month lease, an in-window lease, a lease that has not ended
    // and a source-excluded lease are never eligible.
    for (const id of ["802", "803", "804", "805", "806", "807", "808"])
      expect(row(id).endedWithoutOutcomeEligible, id).toBe(false);
    expect(row("804").retentionExpected).toBe("window");
    expect(row("808").retentionExpected).toBe("window");
    // The anchored month-to-month and the source-excluded leases do read `outside`.
    expect(row("806").retentionExpected).toBe("outside");
    expect(row("806").dispositionExpected).toBe("periodic_review");
    expect(row("807").retentionExpected).toBe("outside");
    expect(row("807").dispositionExpected).toBe("skip");
  });

  it("keeps every expectation exact when the progress read is unknown", () => {
    const unknown = expectedRows(decisions());
    for (const id of ["801", "802", "803", "804", "805", "806", "807", "808"])
      expect(row(id, unknown).endedWithoutOutcomeEligible, id).toBe(false);
  });

  it("accepts the ended state for an eligible row only under the one-status contract", () => {
    expect(endedDelta(row("801"), ONE_STATUS)).toBe(0);
    // The predecessor and the staff-lane revision never render the state.
    expect(endedDelta(row("801"))).toBe(1);
    expect(endedDelta(row("801"), INDEPENDENT_STAFF_LANE_CONTRACT_MARKER)).toBe(1);
    // An ineligible row rendering the state is still a mismatch.
    for (const id of ["802", "803", "804", "805", "806", "807", "808"])
      expect(endedDelta(row(id), ONE_STATUS), id).toBe(1);
  });

  it("compares the row state exactly apart from that one allowance", () => {
    const state = (
      expectedRetention: "outside" | "window",
      observedRetention: string,
      allowEndedWithoutOutcome?: boolean,
    ) =>
      countIndependentExpectedRowStateMismatches({
        expectedRetention,
        expectedOverallStatus: "needs_review",
        observedRetention,
        observedOverallStatus: "needs_review",
        ...(allowEndedWithoutOutcome === undefined ? {} : { allowEndedWithoutOutcome }),
      });
    expect(state("outside", "ended_without_outcome", true)).toBe(0);
    expect(state("outside", "outside", true)).toBe(0);
    expect(state("outside", "ended_without_outcome", false)).toBe(1);
    expect(state("outside", "ended_without_outcome")).toBe(1);
    expect(state("window", "ended_without_outcome", true)).toBe(1);
  });

  it("reads every lease with a progress record, complete or not", async () => {
    const read = async (name: string) => ({
      docs:
        (
          {
            [LEASE_RENEWAL_COLLECTIONS.resolutions]: [],
            [LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress]: [
              { id: "progress-802", data: { lease_id: "802", complete: true } },
              { id: "progress-804", data: { lease_id: "804", complete: false } },
            ],
            [RENEWAL_WORKSPACE_COLLECTIONS.head]: [],
            [RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead]: [],
          } as Record<string, readonly { id: string; data: unknown }[]>
        )[name]?.map((document) => ({ id: document.id, data: () => document.data })) ??
        [],
    });
    const firestore = {
      collection: (name: string) => ({
        get: () => read(name),
        where: () => ({ get: () => read(name) }),
      }),
    } as unknown as Firestore;
    const facts = await readIndependentDecisionFacts(firestore);
    expect([...(facts.progressLeaseIds ?? [])].sort()).toEqual(["802", "804"]);
    expect([...facts.trackedIncompleteLeaseIds]).toEqual(["804"]);
  });
});
