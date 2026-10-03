import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { LEASE_RENEWAL_PROGRESS_COLLECTIONS } from "@/lib/firestore/lease-renewal-progress-schema";
import { LEASE_RENEWAL_COLLECTIONS } from "@/lib/firestore/lease-renewal-resolutions";
import { RENEWAL_WORKSPACE_COLLECTIONS } from "@/lib/firestore/renewal-workspace";
import {
  DESK_GUIDANCE_CONTRACT,
  buildDeskLeaseGuidance,
  type DeskGuidanceInput,
} from "@/lib/lease-renewal/desk-guidance";
import {
  emptyRenewalWorkspace,
  manualRenewalSummary,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import {
  INDEPENDENT_UNRECORDED_STAFF_LANE,
  projectIndependentManualRenewal,
  projectIndependentStaffLaneManualRenewal,
} from "@/lib/production-assurance/manual-renewal-projection";
import {
  INDEPENDENT_STAFF_LANE_CONTRACT_MARKER,
  PRODUCTION_RECONCILIATION_DESK_VIEW,
  countIndependentContractMarkerMismatches,
  projectIndependentRentVineRows,
  resolveIndependentGuidanceContract,
  type IndependentGuidanceContract,
  type IndependentSheetProjection,
} from "@/lib/production-assurance/renewal-source-projection";
import {
  buildExpectedProjectionRows,
  compareProjectionRows,
  countIndependentRowGuidanceMismatches,
  projectIndependentExpectedGuidanceState,
  readIndependentDecisionFacts,
  resolveExpectedGuidanceContract,
  type DirectProjection,
  type ExpectedProjectionRow,
  type RenderedProjection,
  type RenderedProjectionRow,
} from "../../scripts/run-production-reconciliation";

// Synthetic fixtures only: no lease, person, address or amount here belongs to a real record.
const ORIGIN = "https://candidate.example";
const RENTVINE_HOST = "synthetic.rentvine.com";
const REFERENCE_DATE = "2026-10-02";
const DESK_VIEW = encodeURIComponent(PRODUCTION_RECONCILIATION_DESK_VIEW);
const MARKER = INDEPENDENT_STAFF_LANE_CONTRACT_MARKER;

const META = {
  actorUid: "synthetic-operator",
  recordedAt: "2026-10-01T15:00:00.000Z",
  eventId: "synthetic-event",
};
const act = (state: RenewalWorkspaceState, action: RenewalWorkspaceAction) =>
  planRenewalWorkspaceAction(state, action, META);
const dated = (leaseId: string, cycleId: string) =>
  emptyRenewalWorkspace(leaseId, cycleId, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "synthetic provider lease end",
  });
const ownerOutreachDone = (state: RenewalWorkspaceState) =>
  act(state, { kind: "activity", activity: "owner_outreach", outcome: "done" });

/** 703: a dated record whose owner outreach is recorded; both rule sets wait on the owner. */
const STATE_703 = ownerOutreachDone(dated("703", "0f6f6d4e-52d5-4d0b-9a5e-0c8b1c1f7031"));
/** 705: a lease-bound record (no source date existed when the work was first saved). */
const STATE_705 = ownerOutreachDone(
  emptyRenewalWorkspace("705", "0f6f6d4e-52d5-4d0b-9a5e-0c8b1c1f7051", {
    kind: "lease_bound",
    source: "No lease end or review date was available when this work was first saved",
  }),
);
/** 706: staff recorded completion before the suggested checklist was finished. */
const STATE_706: RenewalWorkspaceState = {
  ...ownerOutreachDone(dated("706", "0f6f6d4e-52d5-4d0b-9a5e-0c8b1c1f7061")),
  completion: { ...META, source: "Staff record", termsRevision: 0 },
};

const RENTVINE_ROWS: Record<string, unknown>[] = [
  // 701: in the worklist, sources agree, nothing recorded yet.
  { lease: { leaseID: 701, endDate: "2026-12-31", tenants: [{ name: "Tenant A" }] } },
  // 702: in the worklist, RentVine and the Sheet disagree, nothing recorded yet.
  { lease: { leaseID: 702, endDate: "2026-11-30", tenants: [{ name: "Tenant B" }] } },
  // 703: in the worklist with a dated staff record.
  { lease: { leaseID: 703, endDate: "2026-12-31", tenants: [{ name: "Tenant C" }] } },
  // 704: outside the worklist by its source marker.
  {
    lease: {
      leaseID: 704,
      endDate: "2026-12-31",
      programName: "Section 8",
      tenants: [{ name: "Tenant D" }],
    },
  },
  // 705: month to month with no documented anchor; its only record is lease-bound.
  { lease: { leaseID: 705, tenants: [{ name: "Tenant E" }] } },
  // 706: outside the window with a dated staff record that carries a completion.
  { lease: { leaseID: 706, endDate: "2027-06-30", tenants: [{ name: "Tenant F" }] } },
].map((row) => ({
  ...row,
  property: {
    address: `${String((row.lease as { leaseID: number }).leaseID)} Sample Way`,
  },
  portfolio: { owners: [{ companyName: "Sample Owner LLC" }] },
}));
const LEASE_DETAILS = new Map<string, Record<string, unknown>>([
  ["701", { leaseID: "701", baseRentAmount: 1250 }],
  ["702", { leaseID: "702", baseRentAmount: 1250 }],
  ["703", { leaseID: "703", baseRentAmount: 1250 }],
  ["705", { leaseID: "705", baseRentAmount: 1250, isMonthToMonth: "1" }],
  ["706", { leaseID: "706", baseRentAmount: 1250 }],
]);
const SHEET: IndependentSheetProjection = {
  leaseUrls: new Map(),
  byLeaseId: new Map([
    ["701", { sourceUrl: null, currentRent: 1250 }],
    ["702", { sourceUrl: null, currentRent: 1400 }],
    ["703", { sourceUrl: null, currentRent: 1250 }],
    ["705", { sourceUrl: null, currentRent: 1250 }],
    ["706", { sourceUrl: null, currentRent: 1250 }],
  ]),
  ambiguousLeaseIds: [],
  sourceDigest: "synthetic-sheet-digest",
};
const DECISIONS = {
  resolutions: [],
  trackedIncompleteLeaseIds: new Set<string>(),
  // The predecessor reads only dated records, under its own summary rules.
  manualByLease: new Map([
    ["703", projectIndependentManualRenewal(STATE_703)],
    ["706", projectIndependentManualRenewal(STATE_706)],
  ]),
  // The staff-lane revision reads both heads, under the staff-lane summary rules.
  staffLaneManualByLease: new Map([
    ["703", projectIndependentStaffLaneManualRenewal(STATE_703)],
    ["705", projectIndependentStaffLaneManualRenewal(STATE_705)],
    ["706", projectIndependentStaffLaneManualRenewal(STATE_706)],
  ]),
};

const BASE_ROWS = projectIndependentRentVineRows(
  RENTVINE_ROWS,
  SHEET.leaseUrls,
  LEASE_DETAILS,
  RENTVINE_HOST,
);
const expectedRows = (contract: IndependentGuidanceContract) =>
  buildExpectedProjectionRows(
    BASE_ROWS,
    RENTVINE_ROWS,
    SHEET,
    DECISIONS,
    REFERENCE_DATE,
    LEASE_DETAILS,
    contract,
  );
const PREDECESSOR_ROWS = expectedRows("predecessor");
const STAFF_LANE_ROWS = expectedRows("staff_lane");
const expectedRow = (rows: readonly ExpectedProjectionRow[], id: string) => {
  const row = rows.find((candidate) => candidate.leaseId === id);
  if (!row) throw new Error(`missing synthetic lease ${id}`);
  return row;
};

const primary = (id: string) =>
  `/lease-renewal/live/desk/lease/${id}?deskView=${DESK_VIEW}`;
const phase = (id: string, step: string, fragment = "") =>
  `/lease-renewal/live/desk/lease/${id}?step=${step}&deskView=${DESK_VIEW}${fragment}`;
const sourceLink = (id: string) => ({
  href: `https://${RENTVINE_HOST}/leases/${id}`,
  target: "_blank",
  rel: "noopener noreferrer",
});

type RenderedGuidance = Pick<
  RenderedProjectionRow,
  "manual" | "retentionState" | "processState" | "status" | "workspace" | "action"
>;
const NO_MANUAL = {
  complete: "none",
  nextActivity: "none",
  pendingSourceUpdates: "none",
};
const NO_PROCESS = {
  processStatus: "none",
  currentStepId: "none",
  currentStepState: "none",
  waitingParty: "none",
};
const verifiedWorkspace = (id: string): RenderedGuidance["workspace"] => ({
  workspaceAvailable: "true",
  primaryHrefs: [primary(id)],
  baseRentPhaseHrefs: [phase(id, "verify-renewal")],
  rentVerificationPhaseHrefs: [],
  rentVerificationSourceLinks: [sourceLink(id)],
});
const unverifiedWorkspace = (id: string): RenderedGuidance["workspace"] => ({
  workspaceAvailable: "true",
  primaryHrefs: [primary(id)],
  baseRentPhaseHrefs: [phase(id, "verify-renewal")],
  rentVerificationPhaseHrefs: [phase(id, "verify-renewal")],
  rentVerificationSourceLinks: [],
});
const status = (
  overallStatus: string,
  rentVerification: "verified" | "needs_verification",
  blockerCount = 0,
): RenderedGuidance["status"] => ({
  rentVerification,
  verifiedByResolutionDiffers: "false",
  overallStatus,
  isBlocked: ["blocked", "needs_verification"].includes(overallStatus) ? "true" : "false",
  blockerCount,
});
const phaseAction = (
  id: string,
  actionKind: string,
  stepId: string,
  fragment = "",
): RenderedGuidance["action"] => ({
  actionKind,
  destinationKind: "workspace_phase",
  stepId,
  requiredCapability: "none",
  declaredBlockerCount: "0",
  blockers: [],
  phaseHrefs: [phase(id, stepId, fragment)],
  accessHrefs: [],
});
const REVIEW_ACTION: RenderedGuidance["action"] = {
  actionKind: "review",
  destinationKind: "none",
  stepId: "none",
  requiredCapability: "none",
  declaredBlockerCount: "0",
  blockers: [],
  phaseHrefs: [],
  accessHrefs: [],
};

/** What a revision following the predecessor guidance rules renders for the synthetic portfolio. */
const PREDECESSOR_RENDER: Record<string, RenderedGuidance> = {
  "701": {
    manual: NO_MANUAL,
    retentionState: "window",
    processState: {
      processStatus: "active",
      currentStepId: "owner-decision",
      currentStepState: "ready",
      waitingParty: "none",
    },
    status: status("ready", "verified"),
    workspace: verifiedWorkspace("701"),
    action: phaseAction("701", "act", "owner-decision"),
  },
  "702": {
    manual: NO_MANUAL,
    retentionState: "window",
    processState: {
      processStatus: "active",
      currentStepId: "verify-renewal",
      currentStepState: "blocked",
      waitingParty: "unresolved_source",
    },
    status: status("blocked", "needs_verification", 1),
    workspace: unverifiedWorkspace("702"),
    action: {
      actionKind: "blocked",
      destinationKind: "none",
      stepId: "none",
      requiredCapability: "none",
      declaredBlockerCount: "1",
      blockers: [
        {
          href: phase("702", "verify-renewal"),
          destinationKind: "workspace_phase",
          phaseId: "verify-renewal",
          stepId: "verify-renewal",
        },
      ],
      phaseHrefs: [],
      accessHrefs: [],
    },
  },
  "703": {
    manual: {
      complete: "false",
      nextActivity: "owner_response",
      pendingSourceUpdates: "0",
    },
    retentionState: "window",
    processState: {
      processStatus: "active",
      currentStepId: "owner-decision",
      currentStepState: "ready",
      waitingParty: "owner",
    },
    status: status("waiting", "verified"),
    workspace: verifiedWorkspace("703"),
    action: phaseAction(
      "703",
      "waiting",
      "owner-decision",
      "#renewal-manual-owner_response",
    ),
  },
  "704": {
    manual: NO_MANUAL,
    retentionState: "outside",
    processState: NO_PROCESS,
    status: status("needs_review", "needs_verification"),
    workspace: {
      workspaceAvailable: "false",
      primaryHrefs: [],
      baseRentPhaseHrefs: [],
      rentVerificationPhaseHrefs: [],
      rentVerificationSourceLinks: [],
    },
    action: REVIEW_ACTION,
  },
  "705": {
    // The predecessor never reads the lease-bound collection, so it shows no staff record.
    manual: NO_MANUAL,
    retentionState: "needs_verification",
    processState: NO_PROCESS,
    status: status("needs_review", "verified"),
    workspace: verifiedWorkspace("705"),
    action: REVIEW_ACTION,
  },
  "706": {
    // Predecessor completion needed the whole checklist, so this record is still pending there.
    manual: {
      complete: "false",
      nextActivity: "owner_response",
      pendingSourceUpdates: "0",
    },
    retentionState: "tracked_incomplete",
    processState: {
      processStatus: "active",
      currentStepId: "owner-decision",
      currentStepState: "ready",
      waitingParty: "owner",
    },
    status: status("waiting", "verified"),
    workspace: verifiedWorkspace("706"),
    action: phaseAction(
      "706",
      "waiting",
      "owner-decision",
      "#renewal-manual-owner_response",
    ),
  },
};

/** What a revision following the S156 staff-lane rules renders for the same portfolio. */
const STAFF_LANE_RENDER: Record<string, RenderedGuidance> = {
  "701": {
    ...PREDECESSOR_RENDER["701"],
    action: phaseAction("701", "act", "owner-decision", "#renewal-manual-owner_outreach"),
  },
  "702": {
    ...PREDECESSOR_RENDER["702"],
    // The difference stays visible as rent evidence; the status follows the staff lane.
    status: status("ready", "needs_verification"),
    action: phaseAction("702", "act", "owner-decision", "#renewal-manual-owner_outreach"),
  },
  "703": PREDECESSOR_RENDER["703"],
  "704": {
    ...PREDECESSOR_RENDER["704"],
    // S154: a stable lease id opens the workspace and carries the rent-evidence links; no rent
    // comparison is attached to it, so its rent stays needing verification.
    workspace: unverifiedWorkspace("704"),
  },
  "705": {
    ...PREDECESSOR_RENDER["705"],
    manual: {
      complete: "false",
      nextActivity: "owner_response",
      pendingSourceUpdates: "0",
    },
    status: status("waiting", "verified"),
    action: phaseAction(
      "705",
      "waiting",
      "owner-decision",
      "#renewal-manual-owner_response",
    ),
  },
  "706": {
    // Completion is the staff record: once recorded, nothing is suggested next.
    manual: {
      complete: "true",
      nextActivity: "complete",
      pendingSourceUpdates: "0",
    },
    retentionState: "outside",
    processState: NO_PROCESS,
    status: status("complete", "verified"),
    workspace: verifiedWorkspace("706"),
    action: phaseAction(
      "706",
      "complete",
      "compliance-close",
      "#renewal-manual-complete",
    ),
  },
};

function renderedRow(
  id: string,
  guidance: RenderedGuidance,
  marker: string | null,
): RenderedProjectionRow {
  const source = expectedRow(PREDECESSOR_ROWS, id);
  return {
    leaseId: source.leaseId,
    address: source.address,
    owners: source.owners,
    tenants: source.tenants,
    endDate: source.endDate,
    endDateDisplayMatches: true,
    baseRent: source.baseRent,
    rentvineSourceUrl: source.rentvineRecordUrl ?? null,
    rentvineRecordUrl: source.rentvineRecordUrl ?? null,
    disposition: source.dispositionExpected,
    guidanceContract: marker,
    statusFilterHrefs: [],
    ...guidance,
  };
}
const LEASE_IDS = ["701", "702", "703", "704", "705", "706"] as const;
const page = (
  rules: Record<string, RenderedGuidance>,
  marker: (id: string) => string | null,
): RenderedProjection => ({
  rows: LEASE_IDS.map((id) => renderedRow(id, rules[id], marker(id))),
  application: "complete",
  invalidDestinations: 0,
  fieldMismatches: 0,
});
const DIRECT: DirectProjection = {
  rows: PREDECESSOR_ROWS,
  staffLane: { rows: STAFF_LANE_ROWS, decision: "complete", sourceDigest: "staff" },
  sourceRecords: LEASE_IDS.length,
  projectedRecords: LEASE_IDS.length,
  rentvine: "complete",
  sheet: "complete",
  decision: "complete",
  sourceDigest: "predecessor",
};
const mismatches = (counts: ReturnType<typeof compareProjectionRows>) =>
  counts.fieldMismatches +
  counts.invalidDestinations +
  counts.missingInApplication +
  counts.unexpectedInApplication +
  counts.duplicateApplicationKeys;
const rowMismatches = (
  contract: IndependentGuidanceContract,
  id: string,
  rules: Record<string, RenderedGuidance>,
) => {
  const counts = countIndependentRowGuidanceMismatches({
    contract,
    expectedRow: expectedRow(
      contract === "staff_lane" ? STAFF_LANE_ROWS : PREDECESSOR_ROWS,
      id,
    ),
    observedRow: renderedRow(id, rules[id], contract === "staff_lane" ? MARKER : null),
    role: "Admin",
    origin: ORIGIN,
  });
  return counts.fieldMismatches + counts.invalidDestinations;
};

describe("S156 oracle: the contract marker selects exactly one rule set", () => {
  it("names the same marker the application renders, without importing it into the oracle", () => {
    expect(MARKER).toBe("s156-staff-lane");
    expect(MARKER).toBe(DESK_GUIDANCE_CONTRACT);
  });

  it("selects per row by the rendered marker when the caller names no contract", () => {
    expect(resolveIndependentGuidanceContract(null)).toBe("predecessor");
    expect(resolveIndependentGuidanceContract(MARKER)).toBe("staff_lane");
    // An unrecognised marker is never read under the predecessor rules; it is counted below.
    expect(resolveIndependentGuidanceContract("s999-unknown")).toBe("staff_lane");
    expect(resolveIndependentGuidanceContract("")).toBe("staff_lane");
  });

  it("applies the caller's contract to every row whatever the row renders", () => {
    expect(resolveIndependentGuidanceContract(null, MARKER)).toBe("staff_lane");
    expect(resolveIndependentGuidanceContract(MARKER, "none")).toBe("predecessor");
  });

  it("counts a missing, unexpected, unknown or mixed marker", () => {
    expect(countIndependentContractMarkerMismatches([null, null, null])).toBe(0);
    expect(countIndependentContractMarkerMismatches([MARKER, MARKER])).toBe(0);
    expect(countIndependentContractMarkerMismatches([])).toBe(0);
    expect(countIndependentContractMarkerMismatches([MARKER, null, MARKER])).toBe(1);
    expect(countIndependentContractMarkerMismatches([null, MARKER, null, MARKER])).toBe(
      2,
    );
    expect(countIndependentContractMarkerMismatches(["s999-unknown", MARKER])).toBe(1);
    expect(countIndependentContractMarkerMismatches([""])).toBe(1);
    expect(countIndependentContractMarkerMismatches([MARKER, MARKER], MARKER)).toBe(0);
    expect(countIndependentContractMarkerMismatches([MARKER, null], MARKER)).toBe(1);
    expect(countIndependentContractMarkerMismatches([null, null], MARKER)).toBe(2);
    expect(countIndependentContractMarkerMismatches([null, null], "none")).toBe(0);
    expect(countIndependentContractMarkerMismatches([MARKER, null], "none")).toBe(1);
  });

  it("reads the expected contract from the command line and refuses any other value", () => {
    expect(resolveExpectedGuidanceContract([])).toEqual({});
    expect(
      resolveExpectedGuidanceContract(["--expected-guidance-contract=s156-staff-lane"]),
    ).toEqual({ expectedGuidanceContract: MARKER });
    expect(
      resolveExpectedGuidanceContract(["--expected-guidance-contract=none"]),
    ).toEqual({ expectedGuidanceContract: "none" });
    expect(() =>
      resolveExpectedGuidanceContract(["--expected-guidance-contract=s82"]),
    ).toThrow("expected_guidance_contract_invalid");
  });
});

describe("S156 oracle: one source fixture, two rule sets", () => {
  it("derives both expectations from the same independent source rows", () => {
    const predecessor = Object.fromEntries(
      PREDECESSOR_ROWS.map((row) => [row.leaseId, row]),
    );
    const staffLane = Object.fromEntries(
      STAFF_LANE_ROWS.map((row) => [row.leaseId, row]),
    );
    for (const id of LEASE_IDS) {
      expect(staffLane[id].dispositionExpected).toBe(predecessor[id].dispositionExpected);
      expect(staffLane[id].rentExpectation).toEqual(predecessor[id].rentExpectation);
    }
    // BEH-S154: a lease outside the worklist by its source marker is still a real, openable lease.
    expect(predecessor["704"]).toMatchObject({
      dispositionExpected: "skip",
      workspaceExpected: false,
      retentionExpected: "outside",
      manual: null,
    });
    expect(staffLane["704"]).toMatchObject({
      dispositionExpected: "skip",
      workspaceExpected: true,
      retentionExpected: "outside",
      manual: null,
    });
    // BEH-S154: the lease-bound record exists only for a revision that reads its collection.
    expect(predecessor["705"].manual).toBeNull();
    expect(staffLane["705"].manual).toMatchObject({
      complete: false,
      nextActivity: "owner_response",
    });
    // BEH-S156: completion is the staff record; the predecessor still required the checklist.
    expect(predecessor["706"]).toMatchObject({
      retentionExpected: "tracked_incomplete",
      processExpected: true,
      manual: { complete: false },
    });
    expect(staffLane["706"]).toMatchObject({
      retentionExpected: "outside",
      processExpected: false,
      manual: { complete: true },
    });
  });

  it.each(LEASE_IDS)(
    "lease %s: predecessor rules accept the predecessor render",
    (id) => {
      expect(rowMismatches("predecessor", id, PREDECESSOR_RENDER)).toBe(0);
    },
  );

  it.each(LEASE_IDS)("lease %s: staff-lane rules accept the staff-lane render", (id) => {
    expect(rowMismatches("staff_lane", id, STAFF_LANE_RENDER)).toBe(0);
  });

  // 703 renders identically under both rule sets; only the page marker tells them apart.
  it.each(LEASE_IDS.filter((id) => id !== "703"))(
    "lease %s: each rule set refuses the other rule set's render",
    (id) => {
      expect(rowMismatches("predecessor", id, STAFF_LANE_RENDER)).toBeGreaterThan(0);
      expect(rowMismatches("staff_lane", id, PREDECESSOR_RENDER)).toBeGreaterThan(0);
    },
  );

  it("AC-S156: a worklist lease with nothing recorded is Ready with the owner-outreach action", () => {
    const row = expectedRow(STAFF_LANE_ROWS, "701");
    expect(
      projectIndependentExpectedGuidanceState({
        contract: "staff_lane",
        dispositionExpected: row.dispositionExpected,
        retentionExpected: row.retentionExpected,
        processExpected: row.processExpected,
        rentReconciliationExpected: row.rentReconciliationExpected,
        rentExpectation: row.rentExpectation,
        processState: STAFF_LANE_RENDER["701"].processState,
        manual: row.manual,
      }),
    ).toEqual({
      overallStatus: "ready",
      actionStepId: "owner-decision",
      actionFragment: "#renewal-manual-owner_outreach",
      markerMismatches: 0,
    });
    // The row itself shows no staff record: the lane is guidance, never an invented record.
    const observed = renderedRow("701", STAFF_LANE_RENDER["701"], MARKER);
    expect(observed.manual).toEqual(NO_MANUAL);
    for (const patch of [
      { action: phaseAction("701", "act", "owner-decision") },
      {
        action: phaseAction(
          "701",
          "act",
          "tenant-decision",
          "#renewal-manual-owner_outreach",
        ),
      },
      { action: REVIEW_ACTION },
      { status: status("needs_review", "verified") },
      {
        manual: {
          complete: "false",
          nextActivity: "owner_outreach",
          pendingSourceUpdates: "0",
        },
      },
    ]) {
      const counts = countIndependentRowGuidanceMismatches({
        contract: "staff_lane",
        expectedRow: row,
        observedRow: { ...observed, ...patch },
        role: "Admin",
        origin: ORIGIN,
      });
      expect(counts.fieldMismatches + counts.invalidDestinations).toBeGreaterThan(0);
    }
  });

  it("AC-S157: a rent conflict keeps its evidence while the status follows the staff lane", () => {
    const row = expectedRow(STAFF_LANE_ROWS, "702");
    expect(row.rentExpectation).toMatchObject({
      evidence: "conflict",
      rentVerification: "needs_verification",
    });
    const observed = renderedRow("702", STAFF_LANE_RENDER["702"], MARKER);
    const count = (patch: Partial<RenderedProjectionRow>) => {
      const counts = countIndependentRowGuidanceMismatches({
        contract: "staff_lane",
        expectedRow: row,
        observedRow: { ...observed, ...patch },
        role: "Admin",
        origin: ORIGIN,
      });
      return counts.fieldMismatches + counts.invalidDestinations;
    };
    expect(count({})).toBe(0);
    // The difference must stay visible: a row that hides it fails.
    expect(count({ status: status("ready", "verified") })).toBeGreaterThan(0);
    // No status, flag or blocker may come from the difference.
    expect(count({ status: status("blocked", "needs_verification") })).toBeGreaterThan(0);
    expect(
      count({ status: status("needs_verification", "needs_verification") }),
    ).toBeGreaterThan(0);
    expect(
      count({ status: { ...status("ready", "needs_verification"), isBlocked: "true" } }),
    ).toBeGreaterThan(0);
    expect(
      count({ status: { ...status("ready", "needs_verification"), blockerCount: 1 } }),
    ).toBeGreaterThan(0);
    expect(count({ action: PREDECESSOR_RENDER["702"].action })).toBeGreaterThan(0);
    // Its evidence destinations stay required and exact.
    expect(
      count({
        workspace: { ...unverifiedWorkspace("702"), rentVerificationPhaseHrefs: [] },
      }),
    ).toBeGreaterThan(0);
    expect(
      count({
        workspace: {
          ...unverifiedWorkspace("702"),
          rentVerificationPhaseHrefs: [phase("702", "owner-decision")],
        },
      }),
    ).toBeGreaterThan(0);
  });

  it("BEH-S154: a lease outside the worklist opens its workspace under the staff-lane rules only", () => {
    const row = expectedRow(STAFF_LANE_ROWS, "704");
    const observed = renderedRow("704", STAFF_LANE_RENDER["704"], MARKER);
    const count = (patch: Partial<RenderedProjectionRow>) => {
      const counts = countIndependentRowGuidanceMismatches({
        contract: "staff_lane",
        expectedRow: row,
        observedRow: { ...observed, ...patch },
        role: "Admin",
        origin: ORIGIN,
      });
      return counts.fieldMismatches + counts.invalidDestinations;
    };
    expect(count({})).toBe(0);
    // The rent evidence links are required and exact, as on every opened lease.
    for (const workspace of [
      { ...STAFF_LANE_RENDER["704"].workspace, baseRentPhaseHrefs: [] },
      { ...STAFF_LANE_RENDER["704"].workspace, rentVerificationPhaseHrefs: [] },
      {
        ...STAFF_LANE_RENDER["704"].workspace,
        baseRentPhaseHrefs: [phase("704", "owner-decision")],
      },
      {
        ...STAFF_LANE_RENDER["704"].workspace,
        rentVerificationPhaseHrefs: [],
        rentVerificationSourceLinks: [sourceLink("704")],
      },
    ]) {
      expect(count({ workspace })).toBeGreaterThan(0);
    }
    expect(
      count({
        workspace: {
          ...STAFF_LANE_RENDER["704"].workspace,
          primaryHrefs: [primary("701")],
        },
      }),
    ).toBeGreaterThan(0);
    expect(count({ workspace: PREDECESSOR_RENDER["704"].workspace })).toBeGreaterThan(0);
    expect(
      count({
        workspace: { ...STAFF_LANE_RENDER["704"].workspace, workspaceAvailable: "false" },
      }),
    ).toBeGreaterThan(0);
    // It stays outside the worklist: no staff-lane status or action is invented for it.
    expect(count({ status: status("ready", "needs_verification") })).toBeGreaterThan(0);
    expect(
      count({
        action: phaseAction(
          "704",
          "act",
          "owner-decision",
          "#renewal-manual-owner_outreach",
        ),
      }),
    ).toBeGreaterThan(0);
  });

  it("BEH-S156: staff completion is Complete with the lane's own action destination", () => {
    const row = expectedRow(STAFF_LANE_ROWS, "706");
    const observed = renderedRow("706", STAFF_LANE_RENDER["706"], MARKER);
    const counts = countIndependentRowGuidanceMismatches({
      contract: "staff_lane",
      expectedRow: row,
      observedRow: {
        ...observed,
        action: phaseAction("706", "complete", "compliance-close"),
      },
      role: "Admin",
      origin: ORIGIN,
    });
    expect(counts.fieldMismatches + counts.invalidDestinations).toBeGreaterThan(0);
  });
});

describe("S156 oracle: a whole page is accepted under exactly one contract", () => {
  const staffLanePage = page(STAFF_LANE_RENDER, () => MARKER);
  const predecessorPage = page(PREDECESSOR_RENDER, () => null);

  it("accepts a staff-lane page under the staff-lane contract only", () => {
    expect(
      mismatches(compareProjectionRows(DIRECT, staffLanePage, "Admin", ORIGIN)),
    ).toBe(0);
    expect(
      mismatches(compareProjectionRows(DIRECT, staffLanePage, "Admin", ORIGIN, MARKER)),
    ).toBe(0);
    expect(
      mismatches(compareProjectionRows(DIRECT, staffLanePage, "Admin", ORIGIN, "none")),
    ).toBeGreaterThan(0);
  });

  it("accepts a predecessor page under the predecessor contract only", () => {
    expect(
      mismatches(compareProjectionRows(DIRECT, predecessorPage, "Admin", ORIGIN)),
    ).toBe(0);
    expect(
      mismatches(compareProjectionRows(DIRECT, predecessorPage, "Admin", ORIGIN, "none")),
    ).toBe(0);
    expect(
      mismatches(compareProjectionRows(DIRECT, predecessorPage, "Admin", ORIGIN, MARKER)),
    ).toBeGreaterThan(0);
  });

  it("never accepts one rule set's render under the other marker", () => {
    // Staff-lane rules rendered without the marker are read, and refused, as the predecessor.
    expect(
      mismatches(
        compareProjectionRows(
          DIRECT,
          page(STAFF_LANE_RENDER, () => null),
          "Admin",
          ORIGIN,
        ),
      ),
    ).toBeGreaterThan(0);
    // Predecessor rules rendered with the marker are read, and refused, as the staff lane.
    expect(
      mismatches(
        compareProjectionRows(
          DIRECT,
          page(PREDECESSOR_RENDER, () => MARKER),
          "Admin",
          ORIGIN,
        ),
      ),
    ).toBeGreaterThan(0);
  });

  it("counts a page that mixes markers even when every row matches its own rules", () => {
    const mixed: RenderedProjection = {
      ...staffLanePage,
      rows: LEASE_IDS.map((id) =>
        id === "703"
          ? renderedRow(id, PREDECESSOR_RENDER[id], null)
          : renderedRow(id, STAFF_LANE_RENDER[id], MARKER),
      ),
    };
    const counts = compareProjectionRows(DIRECT, mixed, "Admin", ORIGIN);
    expect(counts.fieldMismatches).toBe(1);
    expect(
      mismatches(compareProjectionRows(DIRECT, mixed, "Admin", ORIGIN, MARKER)),
    ).toBeGreaterThan(0);
    expect(
      mismatches(compareProjectionRows(DIRECT, mixed, "Admin", ORIGIN, "none")),
    ).toBeGreaterThan(0);
  });

  it("counts an unknown marker rather than choosing a rule set for it", () => {
    const unknown = page(STAFF_LANE_RENDER, () => "s999-unknown");
    expect(
      compareProjectionRows(DIRECT, unknown, "Admin", ORIGIN).fieldMismatches,
    ).toBeGreaterThanOrEqual(LEASE_IDS.length);
  });
});

describe("S156 oracle: the independent rules equal the rules the application renders", () => {
  const guidance = (patch: {
    disposition: DeskGuidanceInput["summary"]["disposition"];
    state: RenewalWorkspaceState | null | undefined;
    inWorklist: boolean;
  }) =>
    buildDeskLeaseGuidance({
      summary: {
        id: "701",
        disposition: patch.disposition,
        reason: "synthetic",
        reasonLabel: "Synthetic reason",
        retention: { state: "window", label: "Synthetic" },
        ...(patch.state ? { manualProgress: manualRenewalSummary(patch.state) } : {}),
      } as unknown as DeskGuidanceInput["summary"],
      // Only the presence of the process matters to the staff lane.
      process: patch.inWorklist ? ({} as DeskGuidanceInput["process"]) : null,
      dataCheck: null,
      rentvineCurrentRent: 1250,
      rentDecision: null,
      currencyState: "fresh",
      readComplete: true,
      progressStateAvailable: true,
    });
  const accepted = act(
    act(
      act(
        act(ownerOutreachDone(dated("701", "0f6f6d4e-52d5-4d0b-9a5e-0c8b1c1f7011")), {
          kind: "owner_response",
          outcome: "approved_terms",
          terms: { rent: 1300, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        }),
        { kind: "activity", activity: "tenant_offer", outcome: "done" },
      ),
      { kind: "tenant_response", outcome: "awaiting_response" },
    ),
    { kind: "tenant_response", outcome: "accepted" },
  );
  const STATES: readonly (RenewalWorkspaceState | null)[] = [
    null,
    dated("701", "0f6f6d4e-52d5-4d0b-9a5e-0c8b1c1f7012"),
    STATE_703,
    STATE_705,
    STATE_706,
    act(STATE_703, { kind: "owner_response", outcome: "approved_terms" }),
    act(STATE_703, { kind: "owner_response", outcome: "declined_non_renewal" }),
    accepted,
    act(accepted, { kind: "activity", activity: "information_form", outcome: "waiting" }),
    act(accepted, {
      kind: "activity",
      activity: "information_form",
      outcome: "not_applicable",
    }),
    act(accepted, { kind: "complete" }),
    act(act(accepted, { kind: "complete" }), {
      kind: "tenant_response",
      outcome: "counter_change_requested",
    }),
  ];

  it("projects every staff record exactly as the application summary does", () => {
    for (const state of STATES) {
      if (!state) continue;
      const summary = manualRenewalSummary(state);
      expect(projectIndependentStaffLaneManualRenewal(state)).toMatchObject({
        complete: summary.complete,
        nextActivity: summary.nextActivity,
        pendingSourceUpdates: summary.pendingSourceUpdates,
      });
    }
    const unrecorded = manualRenewalSummary(null);
    expect(INDEPENDENT_UNRECORDED_STAFF_LANE).toMatchObject({
      complete: unrecorded.complete,
      nextActivity: unrecorded.nextActivity,
    });
  });

  it.each([
    ["actionable", true],
    ["out_of_window", true],
    ["out_of_window", false],
    ["periodic_review", false],
    ["review", true],
    ["review", false],
    ["skip", false],
  ] as const)(
    "expects the application's own status and action for a %s lease (worklist: %s)",
    (disposition, inWorklist) => {
      // The desk attaches no staff record to a lease outside the worklist by its source marker.
      for (const state of disposition === "skip" ? [null] : STATES) {
        const rendered = guidance({ disposition, state, inWorklist });
        const expected = projectIndependentExpectedGuidanceState({
          contract: "staff_lane",
          dispositionExpected: disposition,
          retentionExpected: "window",
          processExpected: inWorklist,
          rentReconciliationExpected: inWorklist,
          rentExpectation: {
            evidence: "conflict",
            rentVerification: "needs_verification",
            verifiedByResolutionDiffers: false,
            resolvedValue: null,
          },
          processState: inWorklist
            ? {
                processStatus: "needs_verification",
                currentStepId: "document-packet",
                currentStepState: "blocked",
                waitingParty: "none",
              }
            : NO_PROCESS,
          manual: state ? projectIndependentStaffLaneManualRenewal(state) : null,
        });
        const destination =
          "destination" in rendered.action ? rendered.action.destination : null;
        expect(rendered.contract).toBe(MARKER);
        expect(rendered.blockers).toEqual([]);
        expect(expected.markerMismatches).toBe(0);
        expect(expected.overallStatus).toBe(rendered.overallStatus);
        expect(rendered.isBlocked).toBe(expected.overallStatus === "needs_verification");
        expect(expected.actionStepId).toBe(
          destination?.kind === "workspace_phase" ? destination.stepId : null,
        );
        expect(expected.actionFragment ?? null).toBe(
          destination?.kind === "workspace_phase" && destination.controlId
            ? `#${destination.controlId}`
            : null,
        );
      }
    },
  );
});

describe("S156 oracle: the independent work-record read", () => {
  const docId = (leaseId: string) => createHash("sha256").update(leaseId).digest("hex");
  const firestore = (
    collections: Record<string, readonly { id: string; data: unknown }[]>,
    failing: readonly string[] = [],
  ) => {
    const read = async (name: string) => {
      if (failing.includes(name)) throw new Error("synthetic_read_failure");
      return {
        docs: (collections[name] ?? []).map((document) => ({
          id: document.id,
          data: () => document.data,
        })),
      };
    };
    return {
      collection: (name: string) => ({
        get: () => read(name),
        where: () => ({ get: () => read(name) }),
      }),
    } as unknown as Firestore;
  };
  const DATED_705 = ownerOutreachDone(
    dated("705", "0f6f6d4e-52d5-4d0b-9a5e-0c8b1c1f7052"),
  );
  const base = {
    [LEASE_RENEWAL_COLLECTIONS.resolutions]: [],
    [LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress]: [
      { id: "progress-703", data: { lease_id: "703", complete: false } },
    ],
    [RENEWAL_WORKSPACE_COLLECTIONS.head]: [
      { id: docId("703"), data: STATE_703 },
      { id: docId("706"), data: STATE_706 },
    ],
  };

  it("BEH-S154: reads lease-bound records for the staff lane and never for the predecessor", async () => {
    const facts = await readIndependentDecisionFacts(
      firestore({
        ...base,
        [RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead]: [
          { id: docId("705"), data: STATE_705 },
        ],
      }),
    );
    expect([...(facts.manualByLease?.keys() ?? [])].sort()).toEqual(["703", "706"]);
    expect([...(facts.staffLaneManualByLease?.keys() ?? [])].sort()).toEqual([
      "703",
      "705",
      "706",
    ]);
    expect(facts.staffLaneManualByLease?.get("705")).toMatchObject({
      cycleId: STATE_705.cycleId,
      complete: false,
      nextActivity: "owner_response",
      actionStepId: "owner-decision",
    });
    // The same dated record reads differently under each rule set.
    expect(facts.manualByLease?.get("706")).toMatchObject({ complete: false });
    expect(facts.staffLaneManualByLease?.get("706")).toMatchObject({ complete: true });
    expect([...facts.trackedIncompleteLeaseIds]).toEqual(["703"]);
  });

  it("lets a dated record take the place of the lease-bound record of the same lease", async () => {
    const facts = await readIndependentDecisionFacts(
      firestore({
        ...base,
        [RENEWAL_WORKSPACE_COLLECTIONS.head]: [
          ...base[RENEWAL_WORKSPACE_COLLECTIONS.head],
          { id: docId("705"), data: DATED_705 },
        ],
        [RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead]: [
          { id: docId("705"), data: STATE_705 },
        ],
      }),
    );
    expect(facts.staffLaneManualByLease?.get("705")?.cycleId).toBe(DATED_705.cycleId);
    expect(facts.manualByLease?.get("705")?.cycleId).toBe(DATED_705.cycleId);
  });

  it("keeps the predecessor read whole when the lease-bound collection is unusable", async () => {
    for (const source of [
      firestore(base, [RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead]),
      firestore({
        ...base,
        [RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead]: [
          { id: docId("999"), data: STATE_705 },
        ],
      }),
      firestore({
        ...base,
        [RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead]: [
          { id: docId("705"), data: { ...STATE_705, unexpected: true } },
        ],
      }),
    ]) {
      const facts = await readIndependentDecisionFacts(source);
      expect([...(facts.manualByLease?.keys() ?? [])].sort()).toEqual(["703", "706"]);
      expect(facts.staffLaneManualByLease).toBeNull();
    }
  });

  it("still refuses an invalid dated record for both rule sets", async () => {
    await expect(
      readIndependentDecisionFacts(
        firestore({
          ...base,
          [RENEWAL_WORKSPACE_COLLECTIONS.head]: [{ id: docId("999"), data: STATE_703 }],
        }),
      ),
    ).rejects.toThrow("independent_manual_read_invalid");
  });

  it("invents no staff record when the staff-lane work records could not be read", () => {
    const rows = buildExpectedProjectionRows(
      BASE_ROWS,
      RENTVINE_ROWS,
      SHEET,
      { ...DECISIONS, staffLaneManualByLease: null },
      REFERENCE_DATE,
      LEASE_DETAILS,
      "staff_lane",
    );
    // Without the read no staff record is invented; the caller reports the read as unavailable.
    expect(rows.every((row) => row.manual === null)).toBe(true);
  });
});
