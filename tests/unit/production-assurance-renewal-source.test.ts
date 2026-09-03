import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  PRODUCTION_RECONCILIATION_DESK_VIEW,
  countIndependentActionDestinationMismatches,
  countIndependentStatusMismatches,
  countIndependentWorkspaceDestinationMismatches,
  independentCurrentRentResolutionTriggerKey,
  independentCurrentRentCandidateFingerprint,
  independentWorkspaceExpected,
  independentSourceDigest,
  projectIndependentRentExpectation,
  projectIndependentRentVineRows,
  projectIndependentSheetLinks,
  validPhaseWorkspaceDestination,
  validPrimaryWorkspaceDestination,
  validRenderedRentvineSourceDestination,
  validRenewalRowActionDestination,
} from "@/lib/production-assurance/renewal-source-projection";
import {
  aggregateReadStates,
  assertLocalSourceAdapterIdentity,
  classifyIndependentRenewalDisposition,
  classifyIndependentRenewalRetention,
  classifyRenderedSourceState,
  countIndependentExpectedRowStateMismatches,
  projectIndependentExpectedRentState,
  projectIndependentExpectedGuidanceState,
  resolveReconciliationCoordinates,
  validStatusFilterDestination,
} from "../../scripts/run-production-reconciliation";

const ORIGIN = "https://pmi-kc-app.example";
const RENTVINE_HOST = "pmikcmetro.rentvine.com";
const SOURCE_URL = "https://pmikcmetro.rentvine.com/leases/115";

describe("independent production renewal source projection", () => {
  it("reads measured export paths and takes base rent only from the lease detail", () => {
    const rows = projectIndependentRentVineRows(
      [
        {
          lease: {
            leaseID: 115,
            endDate: "2026-10-31T00:00:00Z",
            currentRent: 9999,
            tenants: [{ name: "Tenant One" }, { firstName: "Tenant", lastName: "Two" }],
          },
          property: {
            streetNumber: "84",
            streetName: "Test Ave",
            address2: "Unit A",
          },
          portfolio: {
            owners: [{ companyName: "Owner LLC" }, { companyName: "owner llc" }],
          },
          unit: { rent: "1,250.00" },
        },
        {
          lease: {
            leaseID: 116,
            endDate: "2026-11-30",
            currentRent: 1400,
            tenants: [{ name: "Missing Unit Rent" }],
          },
          property: { address: "116 Test Ave" },
          unit: {},
        },
      ],
      new Map([["115", SOURCE_URL]]),
      // S102: unit.rent (1,250) is the unit's listed rent; the lease detail carries the tenant's
      // base rent and is the only rent input.
      new Map([["115", { leaseID: "115", baseRentAmount: 1225, rentAmount: 1250 }]]),
    );

    expect(rows[0]).toEqual({
      leaseId: "115",
      address: "84 Test Ave Unit A",
      owners: ["Owner LLC"],
      tenants: ["Tenant One", "Tenant Two"],
      endDate: "2026-10-31",
      baseRent: "$1,225",
      rentvineSourceUrl: SOURCE_URL,
    });
    expect(rows[1].baseRent).toBe("Needs Verification");
    expect(
      projectIndependentRentVineRows(
        [
          {
            lease: { leaseID: 117, tenants: [{ name: "No Detail" }] },
            unit: { rent: "1,250.00" },
          },
        ],
        new Map(),
      )[0].baseRent,
    ).toBe("Needs Verification");
  });

  it("pairs evaluated values with only validated FORMULA links and excludes proof rows", () => {
    const evaluated = {
      valueRanges: [
        {
          range: "'Lease Renewal'!A1:C3",
          values: [
            ["Tenant", "Current Rent", "Lease"],
            ["Tenant One", "$1,225", "Open"],
            ["Proof", "$1", "Open"],
          ],
        },
      ],
    };
    const formulas = {
      valueRanges: [
        {
          range: "'Lease Renewal'!A1:C3",
          values: [
            ["Tenant", "Current Rent", "Lease"],
            ["Tenant One", "=SUM(1200,25)", `=HYPERLINK("${SOURCE_URL}","Open")`],
            [
              "Proof",
              "=SUM(1)",
              '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/999","Open")',
            ],
          ],
        },
      ],
    };
    const projection = projectIndependentSheetLinks(
      evaluated,
      formulas,
      {
        "Lease Renewal": [[], [], ["TEST — PMI KC writeback proof — operation proof-op"]],
      },
      RENTVINE_HOST,
    );

    expect([...projection.leaseUrls]).toEqual([["115", SOURCE_URL]]);
    expect([...projection.byLeaseId]).toEqual([
      ["115", { sourceUrl: SOURCE_URL, currentRent: 1225 }],
    ]);
    expect(projection.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(
      independentSourceDigest(
        projectIndependentRentVineRows([], projection.leaseUrls),
        projection.sourceDigest,
      ),
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed on unaligned or conflicting Sheet source layers", () => {
    expect(() =>
      projectIndependentSheetLinks(
        { valueRanges: [{ range: "Lease Renewal", values: [["Header"], ["Row"]] }] },
        { valueRanges: [{ range: "Lease Renewal", values: [["Header"]] }] },
        {},
        RENTVINE_HOST,
      ),
    ).toThrow(/different row counts/);

    expect(() =>
      projectIndependentSheetLinks(
        {
          valueRanges: [
            {
              range: "Lease Renewal",
              values: [
                ["Current Rent", "Lease"],
                ["$1,250", "One"],
                ["$1,250", "Two"],
              ],
            },
          ],
        },
        {
          valueRanges: [
            {
              range: "Lease Renewal",
              values: [
                ["Current Rent", "Lease"],
                ["$1,250", `=HYPERLINK("${SOURCE_URL}","One")`],
                [
                  "$1,250",
                  '=HYPERLINK("https://pmikcmetro.rentvine.com/lease/115?view=other","Two")',
                ],
              ],
            },
          ],
        },
        {},
        RENTVINE_HOST,
      ),
    ).toThrow(/duplicate rows/);
  });

  it("fails closed on missing headers, unlinked data, and multi-destination rows", () => {
    const formulasFor = (rows: unknown[][]) => ({
      valueRanges: [{ range: "'Lease Renewal'!A1:C3", values: rows }],
    });
    expect(() =>
      projectIndependentSheetLinks(
        formulasFor([
          ["Tenant", "Rent", "Lease"],
          ["One", "$1,250", "Open"],
        ]),
        formulasFor([
          ["Tenant", "Rent", "Lease"],
          ["One", "$1,250", "Open"],
        ]),
        {},
        RENTVINE_HOST,
      ),
    ).toThrow(/exactly one Current Rent header/);

    expect(() =>
      projectIndependentSheetLinks(
        formulasFor([
          ["Tenant", "Current Rent", "Lease"],
          ["One", "$1,250", "Open"],
        ]),
        formulasFor([
          ["Tenant", "Current Rent", "Lease"],
          ["One", "$1,250", "Open"],
        ]),
        {},
        RENTVINE_HOST,
      ),
    ).toThrow(/no exact RentVine lease link/);

    expect(() =>
      projectIndependentSheetLinks(
        formulasFor([
          ["Tenant", "Current Rent", "Lease"],
          ["One", "$1,250", "Open"],
        ]),
        formulasFor([
          ["Tenant", "Current Rent", "Lease"],
          [
            "One",
            `=HYPERLINK("${SOURCE_URL}","Rent")`,
            '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/116","Open")',
          ],
        ]),
        {},
        RENTVINE_HOST,
      ),
    ).toThrow(/multiple RentVine lease destinations/);

    expect(() =>
      projectIndependentSheetLinks(
        formulasFor([
          ["Tenant", "Current Rent", "Lease"],
          ["One", "$1,250", "Open"],
        ]),
        formulasFor([
          ["Tenant", "Current Rent", "Lease"],
          [
            `=HYPERLINK("${SOURCE_URL}","One")`,
            "$1,250",
            `=HYPERLINK("${SOURCE_URL}","Open")`,
          ],
        ]),
        {},
        RENTVINE_HOST,
      ),
    ).toThrow(/multiple RentVine lease destinations/);
  });
});

describe("independent production renewal truth oracle", () => {
  const sheetFact = (currentRent: number | null) => ({
    sourceUrl: SOURCE_URL,
    currentRent,
  });

  it.each([
    [1250, 1250, "agree"],
    [1250, 1250.5, "add_on_explained"],
    [1250, 1261.95, "add_on_explained"],
    [1250, 1278, "add_on_explained"],
    [1250, 1289.95, "add_on_explained"],
    [1250, 1290.45, "add_on_explained"],
  ] as const)(
    "classifies RentVine %s and Sheet %s as %s",
    (rentvineCurrentRent, sheetCurrentRent, evidence) => {
      expect(
        projectIndependentRentExpectation({
          leaseId: "115",
          rentvineCurrentRent,
          sheetFact: sheetFact(sheetCurrentRent),
          resolutions: [],
        }),
      ).toEqual({
        evidence,
        rentVerification: "verified",
        verifiedByResolutionDiffers: false,
        resolvedValue: null,
      });
    },
  );

  it("keeps reverse-direction, unexplained, and missing source values unverified", () => {
    expect(
      projectIndependentRentExpectation({
        leaseId: "115",
        rentvineCurrentRent: 1278,
        sheetFact: sheetFact(1250),
        resolutions: [],
      }).evidence,
    ).toBe("conflict");
    expect(
      projectIndependentRentExpectation({
        leaseId: "115",
        rentvineCurrentRent: 1250,
        sheetFact: sheetFact(1300),
        resolutions: [],
      }).rentVerification,
    ).toBe("needs_verification");
    expect(
      projectIndependentRentExpectation({
        leaseId: "115",
        rentvineCurrentRent: null,
        sheetFact: sheetFact(1250),
        resolutions: [],
      }).evidence,
    ).toBe("missing_rentvine");
    expect(
      projectIndependentRentExpectation({
        leaseId: "115",
        rentvineCurrentRent: 1250,
        sheetFact: null,
        resolutions: [],
      }).evidence,
    ).toBe("missing_sheet");
    expect(
      projectIndependentRentExpectation({
        leaseId: "115",
        rentvineCurrentRent: 1250,
        sheetFact: sheetFact(null),
        resolutions: [],
      }).evidence,
    ).toBe("missing_sheet");
  });

  it("accepts only one exact current resolved decision and marks a differing value", () => {
    const trigger = independentCurrentRentResolutionTriggerKey("115");
    expect(trigger).toBe(
      "lease_renewal:reconcile:live-review:bd039804a51b8ffe:current_rent",
    );
    const resolution = {
      run_id: "live-review",
      source_trigger_key: trigger,
      field_key: "current_rent",
      status: "Resolved",
      candidate_fingerprint: independentCurrentRentCandidateFingerprint(1250, 1300),
      resolution_kind: "corrected_value",
      corrected_value: "$1,300.00",
      proposed_writeback: {
        field_key: "current_rent",
        value: "$1,300.00",
        source_of_value: "corrected_value",
        status: "Queued",
        production_allowed: false,
      },
    };
    expect(
      projectIndependentRentExpectation({
        leaseId: "115",
        rentvineCurrentRent: 1250,
        sheetFact: sheetFact(1300),
        resolutions: [resolution],
      }),
    ).toEqual({
      evidence: "conflict",
      rentVerification: "verified",
      verifiedByResolutionDiffers: true,
      resolvedValue: 1300,
    });

    expect(
      projectIndependentRentExpectation({
        leaseId: "115",
        rentvineCurrentRent: 1250,
        sheetFact: sheetFact(1300),
        resolutions: [{ ...resolution, status: "Open" }],
      }).rentVerification,
    ).toBe("needs_verification");
    expect(
      projectIndependentRentExpectation({
        leaseId: "115",
        rentvineCurrentRent: 1250,
        sheetFact: sheetFact(1300),
        resolutions: [
          {
            run_id: resolution.run_id,
            source_trigger_key: resolution.source_trigger_key,
            field_key: resolution.field_key,
            status: "Dismissed",
            candidate_fingerprint: resolution.candidate_fingerprint,
            resolution_kind: "flag_incorrect",
          },
        ],
      }).rentVerification,
    ).toBe("needs_verification");
    expect(() =>
      projectIndependentRentExpectation({
        leaseId: "115",
        rentvineCurrentRent: 1250,
        sheetFact: sheetFact(1300),
        resolutions: [resolution, resolution],
      }),
    ).toThrow(/duplicate current-rent decisions/);
    expect(() =>
      projectIndependentRentExpectation({
        leaseId: "115",
        rentvineCurrentRent: 1250,
        sheetFact: sheetFact(1300),
        resolutions: [
          {
            ...resolution,
            corrected_value: "1e3",
            proposed_writeback: {
              ...resolution.proposed_writeback,
              value: "1e3",
            },
          },
        ],
      }),
    ).toThrow(/no valid money value/);

    expect(
      projectIndependentRentExpectation({
        leaseId: "115",
        rentvineCurrentRent: 1400,
        sheetFact: sheetFact(1450),
        resolutions: [resolution],
      }),
    ).toEqual({
      evidence: "conflict",
      rentVerification: "needs_verification",
      verifiedByResolutionDiffers: false,
      resolvedValue: null,
    });
  });

  it("accepts only the exact source candidate named by a complete pick-source contract", () => {
    const trigger = independentCurrentRentResolutionTriggerKey("115");
    const pickedSheet = {
      run_id: "live-review",
      source_trigger_key: trigger,
      field_key: "current_rent",
      status: "Resolved",
      candidate_fingerprint: independentCurrentRentCandidateFingerprint(1250, 1300),
      resolution_kind: "pick_source",
      chosen_source: "sheet_tab3",
      proposed_writeback: {
        field_key: "current_rent",
        value: "1300",
        source_of_value: "sheet_tab3",
        status: "Queued",
        production_allowed: false,
      },
    };

    expect(
      projectIndependentRentExpectation({
        leaseId: "115",
        rentvineCurrentRent: 1250,
        sheetFact: sheetFact(1300),
        resolutions: [pickedSheet],
      }),
    ).toMatchObject({
      rentVerification: "verified",
      verifiedByResolutionDiffers: true,
      resolvedValue: 1300,
    });

    for (const malformed of [
      { ...pickedSheet, chosen_source: "unknown_source" },
      {
        ...pickedSheet,
        proposed_writeback: { ...pickedSheet.proposed_writeback, value: "1250" },
      },
      {
        ...pickedSheet,
        proposed_writeback: {
          ...pickedSheet.proposed_writeback,
          source_of_value: "rentvine",
        },
      },
    ]) {
      expect(() =>
        projectIndependentRentExpectation({
          leaseId: "115",
          rentvineCurrentRent: 1250,
          sheetFact: sheetFact(1300),
          resolutions: [malformed],
        }),
      ).toThrow(/exact picked candidate/);
    }
  });

  it.each([
    ["missing kind", { removeKind: true }],
    ["wrong proposal field", { proposalField: "renewal_date" }],
    ["wrong proposal state", { proposalStatus: "Written" }],
    ["write-enabled proposal", { productionAllowed: true }],
    ["mismatched corrected value", { proposalValue: "1299" }],
    ["wrong corrected source", { proposalSource: "rentvine" }],
  ] as readonly [
    string,
    {
      removeKind?: boolean;
      proposalField?: string;
      proposalStatus?: string;
      productionAllowed?: boolean;
      proposalValue?: string;
      proposalSource?: string;
    },
  ][])("rejects a malformed current resolution: %s", (_name, mutation) => {
    const corrected = {
      run_id: "live-review",
      source_trigger_key: independentCurrentRentResolutionTriggerKey("115"),
      field_key: "current_rent",
      status: "Resolved",
      candidate_fingerprint: independentCurrentRentCandidateFingerprint(1250, 1300),
      resolution_kind: "corrected_value",
      corrected_value: "1300",
      proposed_writeback: {
        field_key: "current_rent",
        value: "1300",
        source_of_value: "corrected_value",
        status: "Queued",
        production_allowed: false,
      },
    };
    const malformed = {
      ...corrected,
      resolution_kind: mutation.removeKind ? undefined : corrected.resolution_kind,
      proposed_writeback: {
        ...corrected.proposed_writeback,
        field_key: mutation.proposalField ?? corrected.proposed_writeback.field_key,
        status: mutation.proposalStatus ?? corrected.proposed_writeback.status,
        production_allowed:
          mutation.productionAllowed ?? corrected.proposed_writeback.production_allowed,
        value: mutation.proposalValue ?? corrected.proposed_writeback.value,
        source_of_value:
          mutation.proposalSource ?? corrected.proposed_writeback.source_of_value,
      },
    };
    expect(() =>
      projectIndependentRentExpectation({
        leaseId: "115",
        rentvineCurrentRent: 1250,
        sheetFact: sheetFact(1300),
        resolutions: [malformed],
      }),
    ).toThrow(/invalid/);
  });

  it("derives workspace eligibility without treating review dates as skips", () => {
    expect(
      independentWorkspaceExpected({
        lease: { leaseID: 115, endDate: null },
      }),
    ).toBe(true);
    expect(
      independentWorkspaceExpected({
        lease: { leaseID: 115, isMonthToMonth: "yes" },
      }),
    ).toBe(false);
    expect(
      independentWorkspaceExpected({
        lease: { leaseID: 115, leaseStatus: "Owner hold" },
      }),
    ).toBe(false);
    expect(
      independentWorkspaceExpected({
        lease: { leaseID: 115, programName: "Section 8" },
      }),
    ).toBe(false);
    expect(independentWorkspaceExpected({ lease: { endDate: "2026-10-12" } })).toBe(
      false,
    );
  });

  it("detects source-derived status contradictions without copying S72", () => {
    const conflict = projectIndependentRentExpectation({
      leaseId: "115",
      rentvineCurrentRent: 1250,
      sheetFact: sheetFact(1300),
      resolutions: [],
    });
    expect(
      countIndependentStatusMismatches(conflict, {
        rentVerification: "needs_verification",
        verifiedByResolutionDiffers: "false",
        overallStatus: "blocked",
        isBlocked: "true",
        blockerCount: 1,
      }),
    ).toBe(0);
    expect(
      countIndependentStatusMismatches(conflict, {
        rentVerification: "verified",
        verifiedByResolutionDiffers: "true",
        overallStatus: "ready",
        isBlocked: "false",
        blockerCount: 0,
      }),
    ).toBeGreaterThan(0);

    const agreed = projectIndependentRentExpectation({
      leaseId: "115",
      rentvineCurrentRent: 1250,
      sheetFact: sheetFact(1250),
      resolutions: [],
    });
    expect(
      countIndependentStatusMismatches(agreed, {
        rentVerification: "verified",
        verifiedByResolutionDiffers: "false",
        overallStatus: "waiting",
        isBlocked: "false",
        blockerCount: 0,
      }),
    ).toBe(0);
  });

  it.each([
    {
      name: "missing RentVine rent",
      rentvineCurrentRent: null,
      sheet: sheetFact(1250),
    },
    {
      name: "missing Sheet rent",
      rentvineCurrentRent: 1250,
      sheet: null,
    },
  ])("requires a causal blocker for $name", ({ rentvineCurrentRent, sheet }) => {
    const expected = projectIndependentRentExpectation({
      leaseId: "115",
      rentvineCurrentRent,
      sheetFact: sheet,
      resolutions: [],
    });
    const rendered = {
      rentVerification: "needs_verification",
      verifiedByResolutionDiffers: "false",
      overallStatus: "needs_verification",
      isBlocked: "true",
    } as const;

    expect(
      countIndependentStatusMismatches(expected, {
        ...rendered,
        blockerCount: 0,
      }),
    ).toBeGreaterThan(0);
    expect(
      countIndependentStatusMismatches(expected, {
        ...rendered,
        blockerCount: 1,
      }),
    ).toBe(0);
  });
});

describe("production renewal destination structure", () => {
  const deskView = encodeURIComponent("v=2&scope=all");

  it("accepts only same-origin canonical workspace and phase links", () => {
    expect(
      validPrimaryWorkspaceDestination(
        `/lease-renewal/live/desk/lease/115?deskView=${deskView}`,
        ORIGIN,
        "115",
      ),
    ).toBe(true);
    expect(
      validPhaseWorkspaceDestination(
        `/lease-renewal/live/desk/lease/115?step=verify-renewal&deskView=${deskView}`,
        ORIGIN,
        "115",
        "verify-renewal",
      ),
    ).toBe(true);
    expect(
      validPhaseWorkspaceDestination(
        "/lease-renewal/live/desk/lease/115?step=unknown",
        ORIGIN,
        "115",
      ),
    ).toBe(false);
    expect(
      validPrimaryWorkspaceDestination(
        "https://evil.example/lease-renewal/live/desk/lease/115",
        ORIGIN,
        "115",
      ),
    ).toBe(false);
    expect(
      validPrimaryWorkspaceDestination(
        "/lease-renewal/live/desk/lease/115#unexpected",
        ORIGIN,
        "115",
      ),
    ).toBe(false);
    expect(
      validPrimaryWorkspaceDestination(
        "/lease-renewal/live/desk/lease/115",
        ORIGIN,
        "115",
      ),
    ).toBe(false);
    expect(
      validPrimaryWorkspaceDestination(
        `/lease-renewal/live/desk/lease/115?deskView=${encodeURIComponent("v=2&scope=active")}`,
        ORIGIN,
        "115",
      ),
    ).toBe(false);
    expect(
      validPhaseWorkspaceDestination(
        `/lease-renewal/live/desk/lease/115?step=owner-decision&deskView=${deskView}`,
        ORIGIN,
        "115",
        "verify-renewal",
      ),
    ).toBe(false);
  });

  it("accepts only the bounded access handoff or an exact phase action", () => {
    expect(
      validRenewalRowActionDestination(
        "/admin/access?v=1&capability=edit&space=renewals&return_to=%2Flease-renewal%2Flive%2Fdesk%3Fv%3D2%26scope%3Dall",
        ORIGIN,
        "115",
      ),
    ).toBe(true);
    expect(
      validRenewalRowActionDestination(
        "/admin/access?v=1&capability=manageAdmin&space=renewals&return_to=%2Flease-renewal%2Flive%2Fdesk",
        ORIGIN,
        "115",
      ),
    ).toBe(false);
    expect(
      validRenewalRowActionDestination(
        "/admin/access?v=1&capability=edit&space=renewals&return_to=%2Flease-renewal%2Flive%2Fdesk",
        ORIGIN,
        "115",
      ),
    ).toBe(false);
  });

  it("counts absent required workspace destinations instead of validating only present links", () => {
    const primary = `/lease-renewal/live/desk/lease/115?deskView=${deskView}`;
    const verify = `/lease-renewal/live/desk/lease/115?step=verify-renewal&deskView=${deskView}`;
    expect(
      countIndependentWorkspaceDestinationMismatches({
        workspaceExpected: true,
        leaseId: "115",
        origin: ORIGIN,
        observed: {
          workspaceAvailable: "true",
          primaryHrefs: [primary],
          baseRentPhaseHrefs: [verify],
          rentVerificationPhaseHrefs: [verify],
        },
      }),
    ).toBe(0);
    expect(
      countIndependentWorkspaceDestinationMismatches({
        workspaceExpected: true,
        leaseId: "115",
        origin: ORIGIN,
        observed: {
          workspaceAvailable: "false",
          primaryHrefs: [],
          baseRentPhaseHrefs: [],
          rentVerificationPhaseHrefs: [],
        },
      }),
    ).toBeGreaterThan(0);
    expect(
      countIndependentWorkspaceDestinationMismatches({
        workspaceExpected: false,
        leaseId: "115",
        origin: ORIGIN,
        observed: {
          workspaceAvailable: "true",
          primaryHrefs: [primary],
          baseRentPhaseHrefs: [verify],
          rentVerificationPhaseHrefs: [verify],
        },
      }),
    ).toBeGreaterThan(0);
    expect(PRODUCTION_RECONCILIATION_DESK_VIEW).toBe("v=2&scope=all");
  });

  it("requires every declared blocker and exactly one current action or access handoff", () => {
    const verify = `/lease-renewal/live/desk/lease/115?step=verify-renewal&deskView=${deskView}`;
    const base = {
      leaseId: "115",
      origin: ORIGIN,
    };
    expect(
      countIndependentActionDestinationMismatches({
        ...base,
        expectedStep: "verify-renewal",
        observed: {
          actionKind: "blocked",
          destinationKind: "none",
          stepId: "none",
          requiredCapability: "none",
          declaredBlockerCount: "1",
          blockers: [
            {
              href: verify,
              destinationKind: "workspace_phase",
              phaseId: "verify-renewal",
              stepId: "verify-renewal",
            },
          ],
          phaseHrefs: [],
          accessHrefs: [],
        },
      }),
    ).toBe(0);
    const owner = `/lease-renewal/live/desk/lease/115?step=owner-decision&deskView=${deskView}`;
    expect(
      countIndependentActionDestinationMismatches({
        ...base,
        expectedStep: "verify-renewal",
        observed: {
          actionKind: "blocked",
          destinationKind: "none",
          stepId: "none",
          requiredCapability: "none",
          declaredBlockerCount: "1",
          blockers: [
            {
              href: owner,
              destinationKind: "workspace_phase",
              phaseId: "owner-decision",
              stepId: "owner-decision",
            },
          ],
          phaseHrefs: [],
          accessHrefs: [],
        },
      }),
    ).toBeGreaterThan(0);
    expect(
      countIndependentActionDestinationMismatches({
        ...base,
        observed: {
          actionKind: "blocked",
          destinationKind: "none",
          stepId: "none",
          requiredCapability: "none",
          declaredBlockerCount: "1",
          blockers: [],
          phaseHrefs: [],
          accessHrefs: [],
        },
      }),
    ).toBeGreaterThan(0);

    expect(
      countIndependentActionDestinationMismatches({
        ...base,
        expectedStep: "verify-renewal",
        observed: {
          actionKind: "needs_verification",
          destinationKind: "none",
          stepId: "none",
          requiredCapability: "none",
          declaredBlockerCount: "0",
          blockers: [],
          phaseHrefs: [],
          accessHrefs: [],
        },
      }),
    ).toBeGreaterThan(0);
    expect(
      countIndependentActionDestinationMismatches({
        ...base,
        expectedStep: "verify-renewal",
        observed: {
          actionKind: "needs_verification",
          destinationKind: "workspace_phase",
          stepId: "verify-renewal",
          requiredCapability: "none",
          declaredBlockerCount: "0",
          blockers: [],
          phaseHrefs: [verify],
          accessHrefs: [],
        },
      }),
    ).toBe(0);

    const access =
      "/admin/access?v=1&capability=approve&space=renewals&return_to=%2Flease-renewal%2Flive%2Fdesk%3Fv%3D2%26scope%3Dall";
    expect(
      countIndependentActionDestinationMismatches({
        ...base,
        accessHandoffExpected: true,
        observed: {
          actionKind: "act",
          destinationKind: "workspace_phase",
          stepId: "verify-renewal",
          requiredCapability: "approve",
          declaredBlockerCount: "0",
          blockers: [],
          phaseHrefs: [],
          accessHrefs: [access],
        },
      }),
    ).toBe(0);
    expect(
      countIndependentActionDestinationMismatches({
        ...base,
        accessHandoffExpected: true,
        observed: {
          actionKind: "act",
          destinationKind: "workspace_phase",
          stepId: "verify-renewal",
          requiredCapability: "edit",
          declaredBlockerCount: "0",
          blockers: [],
          phaseHrefs: [],
          accessHrefs: [access],
        },
      }),
    ).toBeGreaterThan(0);
  });

  it("permits the in-app fallback but requires exact safety for rendered sources", () => {
    const valid = {
      href: SOURCE_URL,
      expectedHref: SOURCE_URL,
      expectedHost: RENTVINE_HOST,
      leaseId: "115",
      target: "_blank",
      rel: "noopener noreferrer",
    };
    expect(validRenderedRentvineSourceDestination(valid)).toBe(true);
    expect(
      validRenderedRentvineSourceDestination({ ...valid, href: `${SOURCE_URL}?other=1` }),
    ).toBe(false);
    expect(validRenderedRentvineSourceDestination({ ...valid, href: null })).toBe(true);
    expect(
      validRenderedRentvineSourceDestination({
        ...valid,
        href: SOURCE_URL,
        expectedHref: null,
      }),
    ).toBe(false);
  });
});

describe("production reconciliation runner boundary", () => {
  const sourceRow = {
    leaseId: "115",
    address: "84 Test Ave",
    owners: ["Owner"],
    tenants: ["Tenant"],
    endDate: "2026-10-31",
    baseRent: "$1,250",
    rentvineSourceUrl: SOURCE_URL,
  } as const;

  it("independently classifies every renewal cohort disposition", () => {
    const classify = (endDate: string, workspaceExpected = true) =>
      classifyIndependentRenewalDisposition({
        row: { ...sourceRow, endDate },
        workspaceExpected,
        referenceDateIso: "2026-09-02",
      });

    expect(classify("2026-10-31", false)).toBe("skip");
    expect(classify("Needs Verification")).toBe("review");
    expect(classify("2026-08-31")).toBe("out_of_window");
    expect(classify("2027-01-31")).toBe("out_of_window");
    expect(classify("2026-10-30")).toBe("review");
    expect(classify("2026-10-31")).toBe("actionable");
    expect(() =>
      classifyIndependentRenewalDisposition({
        row: sourceRow,
        workspaceExpected: true,
        referenceDateIso: "not-a-date",
      }),
    ).toThrow("reconciliation_reference_date_invalid");
  });

  it("independently derives current-window and tracked-incomplete retention", () => {
    const classify = (endDate: string, trackedIncomplete = false) =>
      classifyIndependentRenewalRetention({
        row: { ...sourceRow, endDate },
        trackedIncomplete,
        referenceDateIso: "2026-09-02",
      });

    expect(classify("Needs Verification")).toBe("needs_verification");
    expect(classify("2026-10-31")).toBe("window");
    expect(classify("2026-08-31")).toBe("outside");
    expect(classify("2026-08-31", true)).toBe("tracked_incomplete");
    expect(
      classifyIndependentRenewalRetention({
        row: { ...sourceRow, endDate: "2026-10-31" },
        trackedIncomplete: true,
        workspaceExpected: false,
        referenceDateIso: "2026-09-02",
      }),
    ).toBe("outside");
    expect(() =>
      classifyIndependentRenewalRetention({
        row: sourceRow,
        trackedIncomplete: false,
        referenceDateIso: "not-a-date",
      }),
    ).toThrow("reconciliation_reference_date_invalid");
  });

  it("pins every overall status/action while keeping the process-marker trust boundary explicit", () => {
    const verified = {
      evidence: "agree",
      rentVerification: "verified",
      verifiedByResolutionDiffers: false,
      resolvedValue: 1250,
    } as const;
    const missing = {
      evidence: "missing_sheet",
      rentVerification: "needs_verification",
      verifiedByResolutionDiffers: false,
      resolvedValue: null,
    } as const;
    const conflict = { ...missing, evidence: "conflict" } as const;
    const readyProcess = {
      processStatus: "active",
      currentStepId: "owner-decision",
      currentStepState: "ready",
      waitingParty: "none",
    } as const;

    expect(
      projectIndependentExpectedGuidanceState({
        dispositionExpected: "review",
        retentionExpected: "needs_verification",
        processExpected: true,
        rentReconciliationExpected: true,
        rentExpectation: conflict,
        processState: readyProcess,
      }),
    ).toMatchObject({
      overallStatus: "needs_verification",
      actionStepId: "verify-renewal",
      markerMismatches: 1,
    });
    expect(
      projectIndependentExpectedGuidanceState({
        dispositionExpected: "out_of_window",
        retentionExpected: "outside",
        processExpected: false,
        rentReconciliationExpected: false,
        rentExpectation: verified,
        processState: {
          processStatus: "none",
          currentStepId: "none",
          currentStepState: "none",
          waitingParty: "none",
        },
      }),
    ).toEqual({
      overallStatus: "needs_review",
      actionStepId: null,
      markerMismatches: 0,
    });
    expect(
      projectIndependentExpectedGuidanceState({
        dispositionExpected: "actionable",
        retentionExpected: "window",
        processExpected: true,
        rentReconciliationExpected: true,
        rentExpectation: missing,
        processState: readyProcess,
      }),
    ).toMatchObject({
      overallStatus: "needs_verification",
      actionStepId: "verify-renewal",
      markerMismatches: 1,
    });
    expect(
      projectIndependentExpectedGuidanceState({
        dispositionExpected: "actionable",
        retentionExpected: "window",
        processExpected: true,
        rentReconciliationExpected: true,
        rentExpectation: conflict,
        processState: readyProcess,
      }),
    ).toMatchObject({
      overallStatus: "blocked",
      actionStepId: "verify-renewal",
      markerMismatches: 1,
    });
    expect(
      projectIndependentExpectedGuidanceState({
        dispositionExpected: "actionable",
        retentionExpected: "window",
        processExpected: true,
        rentReconciliationExpected: true,
        rentExpectation: verified,
        processState: readyProcess,
      }),
    ).toEqual({
      overallStatus: "ready",
      actionStepId: "owner-decision",
      markerMismatches: 0,
    });
    expect(
      projectIndependentExpectedGuidanceState({
        dispositionExpected: "actionable",
        retentionExpected: "window",
        processExpected: true,
        rentReconciliationExpected: true,
        rentExpectation: verified,
        processState: {
          ...readyProcess,
          processStatus: "waiting",
          currentStepId: "tenant-decision",
          currentStepState: "blocked",
          waitingParty: "tenant",
        },
      }),
    ).toEqual({
      overallStatus: "waiting",
      actionStepId: "tenant-decision",
      markerMismatches: 0,
    });
    expect(
      projectIndependentExpectedGuidanceState({
        dispositionExpected: "actionable",
        retentionExpected: "window",
        processExpected: true,
        rentReconciliationExpected: true,
        rentExpectation: verified,
        processState: {
          ...readyProcess,
          processStatus: "complete",
          currentStepId: "compliance-close",
          currentStepState: "complete",
        },
      }),
    ).toEqual({
      overallStatus: "complete",
      actionStepId: "compliance-close",
      markerMismatches: 0,
    });
    expect(
      projectIndependentExpectedGuidanceState({
        dispositionExpected: "actionable",
        retentionExpected: "window",
        processExpected: true,
        rentReconciliationExpected: true,
        rentExpectation: verified,
        processState: {
          processStatus: null,
          currentStepId: null,
          currentStepState: "invented",
          waitingParty: null,
        },
      }).markerMismatches,
    ).toBe(4);

    expect(
      countIndependentExpectedRowStateMismatches({
        expectedRetention: "outside",
        expectedOverallStatus: "needs_review",
        observedRetention: "outside",
        observedOverallStatus: "needs_review",
      }),
    ).toBe(0);
    expect(
      countIndependentExpectedRowStateMismatches({
        expectedRetention: "outside",
        expectedOverallStatus: "needs_review",
        observedRetention: "tracked_incomplete",
        observedOverallStatus: "ready",
      }),
    ).toBe(2);
    expect(
      countIndependentExpectedRowStateMismatches({
        expectedRetention: "window",
        expectedOverallStatus: "ready",
        observedRetention: "window",
        observedOverallStatus: "waiting",
      }),
    ).toBe(1);
  });

  it("keeps source/resolution rent truth for eligible review and out-of-window rows", () => {
    const verified = {
      evidence: "add_on_explained" as const,
      rentVerification: "verified" as const,
      verifiedByResolutionDiffers: true,
      resolvedValue: 1425,
    };
    expect(
      projectIndependentExpectedRentState({
        workspaceExpected: true,
        dispositionExpected: "out_of_window",
        sourceExpectation: verified,
      }),
    ).toEqual(verified);
    expect(
      projectIndependentExpectedRentState({
        workspaceExpected: true,
        dispositionExpected: "review",
        sourceExpectation: verified,
      }),
    ).toEqual(verified);
    expect(
      projectIndependentExpectedRentState({
        workspaceExpected: false,
        dispositionExpected: "skip",
        sourceExpectation: verified,
      }),
    ).toMatchObject({
      rentVerification: "needs_verification",
      verifiedByResolutionDiffers: false,
      resolvedValue: null,
    });
  });

  it("classifies only a fresh, complete, settled desk as complete", () => {
    expect(
      classifyRenderedSourceState({
        currency: "fresh",
        readComplete: "true",
        refreshing: "false",
        refreshFailed: "false",
      }),
    ).toBe("complete");
    expect(
      classifyRenderedSourceState({
        currency: "stale",
        readComplete: "true",
        refreshing: "false",
        refreshFailed: "false",
      }),
    ).toBe("partial");
    expect(
      classifyRenderedSourceState({
        currency: "fresh",
        readComplete: "false",
        refreshing: "false",
        refreshFailed: "false",
      }),
    ).toBe("partial");
    for (const patch of [
      { currency: "expired" },
      { refreshFailed: "true" },
      { refreshing: null },
    ] as const) {
      expect(
        classifyRenderedSourceState({
          currency: "fresh",
          readComplete: "true",
          refreshing: "false",
          refreshFailed: "false",
          ...patch,
        }),
      ).toBe("unavailable");
    }
  });

  it("aggregates both source reads without letting a late failure pass", () => {
    expect(aggregateReadStates("complete", "complete")).toBe("complete");
    expect(aggregateReadStates("complete", "partial")).toBe("partial");
    expect(aggregateReadStates("complete", "unavailable")).toBe("unavailable");
    expect(aggregateReadStates()).toBe("unavailable");
  });

  it("requires an exact configuration fingerprint before reconciliation", () => {
    const fingerprint = `sha256:${"a".repeat(64)}`;
    expect(
      resolveReconciliationCoordinates([
        "--project=pmi-kc-kb-prod",
        "--region=us-central1",
        "--service=pmi-kc-app",
        `--expected-config-fingerprint=${fingerprint}`,
      ]),
    ).toEqual({
      project: "pmi-kc-kb-prod",
      region: "us-central1",
      service: "pmi-kc-app",
      expectedConfigurationFingerprint: fingerprint,
    });
    expect(() => resolveReconciliationCoordinates([])).toThrow(
      "expected_config_fingerprint_required",
    );
  });

  it("accepts only the exact all-scope status shortcut", () => {
    expect(
      validStatusFilterDestination(
        "/lease-renewal/live/desk?v=2&overallStatus=blocked&scope=all",
        ORIGIN,
        "blocked",
      ),
    ).toBe(true);
    expect(
      validStatusFilterDestination(
        "/lease-renewal/live/desk?v=2&overallStatus=ready&scope=all",
        ORIGIN,
        "blocked",
      ),
    ).toBe(false);
    expect(
      validStatusFilterDestination(
        "/lease-renewal/live/desk?v=2&overallStatus=blocked&scope=all&extra=1",
        ORIGIN,
        "blocked",
      ),
    ).toBe(false);
  });

  it("refuses a different commit or tracked/untracked local source modifications", () => {
    const expected = "a".repeat(40);
    expect(() =>
      assertLocalSourceAdapterIdentity(expected, {
        head: "b".repeat(40),
        trackedChanges: "",
      }),
    ).toThrow(/expected commit/);
    expect(() =>
      assertLocalSourceAdapterIdentity(expected, {
        head: expected,
        trackedChanges: " M scripts\/run-production-reconciliation.ts\n",
      }),
    ).toThrow(/uncommitted source changes/);
    expect(() =>
      assertLocalSourceAdapterIdentity(expected, { head: expected, trackedChanges: "" }),
    ).not.toThrow();
  });

  it("does not import the desk projection and targets the rendered semantic table", () => {
    const source = readFileSync(
      `${process.cwd()}/scripts/run-production-reconciliation.ts`,
      "utf8",
    );
    expect(source).not.toMatch(/live-desk|live-lease-cache|loadLiveRenewalDesk/);
    expect(source).toContain("table.renewal-table tbody > tr[data-lease-id]");
    expect(source).toContain('"--untracked-files=all"');
  });

  it("keeps the independent oracle outside application projection modules", () => {
    const source = readFileSync(
      `${process.cwd()}/lib/production-assurance/renewal-source-projection.ts`,
      "utf8",
    );
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
      (match) => match[1],
    );
    for (const forbidden of [
      "live-desk",
      "live-lease-cache",
      "desk-guidance",
      "pipeline",
      "ingest",
      "lease-mapper",
      "sheet-links",
      "reconciliation",
    ]) {
      expect(imports.some((specifier) => specifier.includes(forbidden))).toBe(false);
    }
    // Match the application `rent` module/path segment, not the independently measured RentVine
    // provider namespace. The shared address composer is a leaf normalization primitive, not a
    // renewal projection, and AC-S71-3 requires it to remain the sole address composer.
    expect(imports.some((specifier) => /\/rent(?:\/|$)/.test(specifier))).toBe(false);
  });
});
