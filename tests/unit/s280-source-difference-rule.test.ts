// S280 R-S280-6: one rule for a RentVine and operating Sheet difference in the current rent or the
// lease dates. ARCH-S280-4, BEH-S280-6 and AC-S280-7 against the pure rule, the reconciliation
// pipeline on the operating Sheet, the Live renewal review projection, the value-free board and
// inbox (the Dashboard's and the Approval Queue's source) and the lease's numbers check. Synthetic
// values only; nothing here reads a provider or writes either source.
import { describe, expect, it } from "vitest";

import { buildNeedsDecisionInbox } from "@/lib/approval/needs-decision-inbox";
import { buildRenewalReviewBoard } from "@/lib/approval/renewal-review";
import { buildWritebackApprovalQueue } from "@/lib/approval/writeback-approval-queue";
import { mapLeasesToNonSheetCandidates } from "@/lib/integrations/rentvine/lease-mapper";
import {
  PRECEDENCE_CONFIRMED,
  PRECEDENCE_TABLE,
  confirmedPrecedenceFieldTypes,
} from "@/lib/lease-renewal/field-reconciliation-rules";
import {
  runRenewalPipeline,
  type NonSheetCandidate,
  type ReconcilableFieldSpec,
} from "@/lib/lease-renewal/pipeline";
import { renewalNumbersCheck } from "@/lib/lease-renewal/renewal-preparation";
import { buildRenewalRunView } from "@/lib/lease-renewal/run-view";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import {
  classifyRentVineSheetDifference,
  sourceDifferenceInformationLine,
} from "@/lib/lease-renewal/source-difference-rule";

const HEADER = SAMPLE_RENEWAL_TABLES[0][0] as readonly string[];
const col = (needle: string): number =>
  HEADER.findIndex((header) => header.toLowerCase().includes(needle));
const TENANT = col("tenant name");
const RENEWAL_DATE = col("renewal date");
const CURRENT_RENT = col("current rent");
const MARKET_VALUE = col("market value");
const PRICING = col("confirmed pricing with the owner");

function sheetRow(values: Record<number, string>): string[] {
  const row = HEADER.map(() => "");
  for (const [index, value] of Object.entries(values)) row[Number(index)] = value;
  return row;
}

const LEASES = [
  { id: "101", label: "101 Sample Pl", tenant: "Avery Sample" },
  { id: "102", label: "102 Sample Pl", tenant: "Blake Sample" },
  { id: "103", label: "103 Sample Pl", tenant: "Casey Sample" },
] as const;

function rentvine(
  leaseId: string,
  tenant: string,
  fields: NonSheetCandidate["fields"],
): NonSheetCandidate {
  return {
    source: "rentvine",
    source_system: "RentVine",
    joinKind: "name",
    joinValue: tenant,
    joinId: `lease:${leaseId}`,
    read_timestamp: "2026-11-12T18:20:00.000Z",
    fields,
  };
}

const LEASE_LABELS = Object.fromEntries(
  LEASES.map((lease) => [`lease:${lease.id}`, lease.label]),
);
const RECORD_JOIN_IDS = Object.fromEntries(
  LEASES.map((lease, index) => [index + 1, `lease:${lease.id}`]),
);

/** Three leases whose operating Sheet rent and lease end differ from RentVine. */
function threeLeaseRun(operatingSheet: boolean) {
  return runRenewalPipeline({
    runId: "live-review",
    tables: [
      [
        HEADER as string[],
        ...LEASES.map((lease, index) =>
          sheetRow({
            [TENANT]: lease.tenant,
            [CURRENT_RENT]: `$${1900 + index * 10}`,
            [RENEWAL_DATE]: "12/31/2026",
          }),
        ),
      ],
    ],
    nonSheetCandidates: LEASES.map((lease) =>
      rentvine(lease.id, lease.tenant, {
        current_rent: { value: 1700, confidence: "Verified" },
        renewal_date: { value: "2027-01-31", confidence: "Verified" },
      }),
    ),
    recordJoinIds: RECORD_JOIN_IDS,
    ...(operatingSheet ? { operatingSheet: true, leaseLabels: LEASE_LABELS } : {}),
  });
}

describe("S280 ARCH-S280-4: the precedence table records the confirmed basis", () => {
  it("ARCH-S280-4: only the current rent and the lease dates are confirmed, and nothing auto-applies", () => {
    expect(confirmedPrecedenceFieldTypes().sort()).toEqual([
      "current_rent",
      "lease_dates_renewal_timing",
    ]);
    for (const rule of Object.values(PRECEDENCE_TABLE)) {
      if (rule.confirmed) expect(rule.order[0]).toBe("rentvine");
      expect(rule.autoApply === "no" || !rule.confirmed).toBe(true);
    }
    expect(PRECEDENCE_CONFIRMED).toBe(false);
  });
});

describe("S280 ARCH-S280-4: the one rule", () => {
  const rent = (sheet: unknown, rv: unknown, extra: object[] = []) =>
    classifyRentVineSheetDifference({
      fieldKey: "current_rent",
      candidates: [
        { source: "sheet_tab3", value: sheet as string },
        { source: "rentvine", value: rv as number },
        ...(extra as { source: string; value: string }[]),
      ],
    });

  it("ARCH-S280-4: a readable RentVine rent and a different Sheet rent are information", () => {
    expect(rent(1750, 1700)).toEqual({
      kind: "information",
      fieldKey: "current_rent",
      valueKind: "rent",
      sheetValue: 1750,
      rentvineValue: 1700,
    });
    expect(
      classifyRentVineSheetDifference({
        fieldKey: "renewal_date",
        candidates: [
          { source: "sheet_tab3", value: "2026-12-31" },
          { source: "rentvine", value: "2027-01-31" },
        ],
      }).kind,
    ).toBe("information");
  });

  it("AC-S280-7: an agreeing or blank Sheet value is no difference", () => {
    expect(rent(1700, 1700).kind).toBe("none");
    expect(rent("", 1700).kind).toBe("none");
  });

  it("AC-S280-7: RentVine unreadable, a differing working value and other sources stay decisions", () => {
    expect(rent(1750, "pending")).toEqual({
      kind: "decision",
      reason: "rentvine_unreadable",
    });
    expect(rent(1750, null)).toEqual({ kind: "decision", reason: "rentvine_unreadable" });
    expect(
      classifyRentVineSheetDifference({
        fieldKey: "current_rent",
        candidates: [
          { source: "sheet_tab3", value: 1750 },
          { source: "rentvine", value: 1700 },
        ],
        workingValue: 1800,
      }),
    ).toEqual({ kind: "decision", reason: "working_value_differs" });
    expect(rent(1750, 1700, [{ source: "google_form", value: "1725" }])).toEqual({
      kind: "decision",
      reason: "other_sources",
    });
  });

  it("AC-S280-7: a market value conflict and an owner decision conflict stay decisions", () => {
    expect(
      classifyRentVineSheetDifference({
        fieldKey: "market_value",
        candidates: [
          { source: "sheet_tab3", value: 1400 },
          { source: "rentvine", value: 2000 },
        ],
      }),
    ).toEqual({ kind: "decision", reason: "unconfirmed_field" });
    expect(
      classifyRentVineSheetDifference({
        fieldKey: "owner_pricing_confirmed",
        candidates: [
          { source: "sheet_tab3", value: true },
          { source: "owner_email", value: false },
        ],
      }),
    ).toEqual({ kind: "decision", reason: "unconfirmed_field" });
  });

  it("R-S280-6: the information line names the lease, both amounts and RentVine as the basis", () => {
    expect(
      sourceDifferenceInformationLine("101 Sample Pl", {
        valueKind: "rent",
        sheetValue: 1750,
        rentvineValue: 1700,
      }),
    ).toBe(
      "101 Sample Pl: the operating Sheet shows $1,750.00 and RentVine shows $1,700.00. RentVine is the basis.",
    );
    expect(
      sourceDifferenceInformationLine("101 Sample Pl", {
        valueKind: "date",
        sheetValue: "2026-12-31",
        rentvineValue: "2027-01-31",
      }),
    ).toBe(
      "101 Sample Pl: the operating Sheet shows 12/31/2026 and RentVine shows 01/31/2027. RentVine is the basis.",
    );
  });
});

describe("S280 ARCH-S280-4: the pipeline on the operating Sheet (fail-first)", () => {
  it("ARCH-S280-4: a Sheet rent above RentVine beyond the known add-ons raises no decision", () => {
    const run = runRenewalPipeline({
      runId: "live-review",
      tables: [
        [
          HEADER as string[],
          sheetRow({ [TENANT]: "Avery Sample", [CURRENT_RENT]: "$1,900" }),
        ],
      ],
      nonSheetCandidates: [
        rentvine("101", "Avery Sample", {
          current_rent: { value: 1700, confidence: "Verified" },
        }),
      ],
      recordJoinIds: { 1: "lease:101" },
      operatingSheet: true,
      leaseLabels: LEASE_LABELS,
    });
    expect(run.flags.map((flag) => flag.fieldKey)).not.toContain("current_rent");
    expect(run.queueItems).toEqual([]);
    const rentOutcome = run.outcomes.find(
      (outcome) => outcome.fieldKey === "current_rent",
    );
    expect(rentOutcome?.information).toMatchObject({
      kind: "information",
      sheetValue: 1900,
      rentvineValue: 1700,
    });
    expect(rentOutcome?.queueMapping).toBeNull();
    expect(rentOutcome?.leaseLabel).toBe("101 Sample Pl");
    expect(rentOutcome?.informationKey).toMatch(
      /^lease_renewal:reconcile:live-review:[a-f0-9]{16}:current_rent$/,
    );
    expect(run.production_allowed).toBe(false);
  });

  it("BEH-S280-6 / AC-S280-7: three leases with Sheet rent and lease end differences give zero decisions and one information row per lease and field", () => {
    const run = threeLeaseRun(true);
    expect(run.flags).toEqual([]);
    const view = buildRenewalRunView(run, [], "Live renewal review");
    expect(view.totalFlags).toBe(0);
    const information = view.information ?? [];
    expect(information).toHaveLength(6);
    expect(new Set(information.map((row) => row.key)).size).toBe(6);
    expect(
      information.find(
        (row) => row.leaseLabel === "101 Sample Pl" && row.fieldKey === "current_rent",
      ),
    ).toMatchObject({
      line: "101 Sample Pl: the operating Sheet shows $1,900.00 and RentVine shows $1,700.00. RentVine is the basis.",
      leaseId: "101",
      sheetUpdateHref: "/lease-renewal/live/desk/lease/101#renewal-rent-and-charges",
    });
    expect(
      information.find(
        (row) => row.leaseLabel === "103 Sample Pl" && row.fieldKey === "renewal_date",
      )?.line,
    ).toBe(
      "103 Sample Pl: the operating Sheet shows 12/31/2026 and RentVine shows 01/31/2027. RentVine is the basis.",
    );
    // Information carries no severity and no decision wording.
    expect(JSON.stringify(information)).not.toMatch(/High|Needs human approval|severity/);

    // The Dashboard's and the Approval Queue's sources list no decision for them.
    const board = buildRenewalReviewBoard([view]);
    const inbox = buildNeedsDecisionInbox(
      [],
      board,
      buildWritebackApprovalQueue([view]),
      { role: "Editor", uid: "editor-1" },
    );
    expect(board.totalOpenFlags).toBe(0);
    expect(inbox.counts.total).toBe(0);
    expect(inbox.rows).toEqual([]);
  });

  it("AC-S280-7: a synthetic (non operating Sheet) run keeps its labeled decisions", () => {
    const run = threeLeaseRun(false);
    expect(run.flags.filter((flag) => flag.fieldKey === "current_rent")).toHaveLength(3);
    expect(run.outcomes.every((outcome) => outcome.information === undefined)).toBe(true);
  });

  const base = {
    runId: "live-review",
    recordJoinIds: { 1: "lease:101" },
    operatingSheet: true,
    leaseLabels: LEASE_LABELS,
  } as const;

  it("AC-S280-7: unreadable RentVine stays a decision and nothing is applied", () => {
    const unreadable = runRenewalPipeline({
      ...base,
      tables: [
        [
          HEADER as string[],
          sheetRow({ [TENANT]: "Avery Sample", [CURRENT_RENT]: "$1,900" }),
        ],
      ],
      nonSheetCandidates: [
        rentvine("101", "Avery Sample", {
          current_rent: { value: "pending", confidence: "Verified" },
        }),
      ],
    });
    expect(unreadable.flags.map((flag) => flag.fieldKey)).toContain("current_rent");
    for (const outcome of unreadable.outcomes) {
      expect(outcome.information).toBeUndefined();
      expect(outcome.reconciliation.auto_apply_allowed).toBe(false);
    }
    expect(unreadable.production_allowed).toBe(false);
  });

  const conflictCases: readonly {
    fieldKey: string;
    fieldLabel: string;
    testTitle: string;
    column: number;
    sheet: string;
    other: NonSheetCandidate;
  }[] = [
    {
      fieldKey: "market_value",
      fieldLabel: "Market value",
      testTitle:
        "AC-S280-7: the market value conflict stays a decision and nothing is applied",
      column: MARKET_VALUE,
      sheet: "$1,400",
      other: {
        source: "rentcast",
        source_system: "RentCast",
        joinKind: "name",
        joinValue: "Avery Sample",
        joinId: "lease:101",
        fields: { market_value: { value: 2000, confidence: "Verified" } },
      },
    },
    {
      fieldKey: "owner_pricing_confirmed",
      fieldLabel: "Owner pricing confirmed",
      testTitle:
        "AC-S280-7: the owner decision conflict stays a decision and nothing is applied",
      column: PRICING,
      sheet: "yes",
      other: {
        source: "owner_email",
        source_system: "Owner email",
        joinKind: "name",
        joinValue: "Avery Sample",
        joinId: "lease:101",
        fields: { owner_pricing_confirmed: { value: false, confidence: "Likely" } },
      },
    },
  ];

  for (const { testTitle, fieldKey, fieldLabel, column, sheet, other } of conflictCases) {
    it(testTitle, () => {
      const spec: ReconcilableFieldSpec = {
        fieldKey,
        fieldLabel,
        sheetSource: "sheet_tab3",
        joinKind: "name",
        joinFieldKey: "tenant_name",
        tab: "Renewals",
      };
      const run = runRenewalPipeline({
        ...base,
        fieldSpecs: [spec],
        tables: [
          [HEADER as string[], sheetRow({ [TENANT]: "Avery Sample", [column]: sheet })],
        ],
        nonSheetCandidates: [other],
      });
      expect(run.flags.map((flag) => flag.fieldKey)).toEqual([fieldKey]);
      expect(run.outcomes).toHaveLength(1);
      expect(run.outcomes[0]).toMatchObject({
        fieldKey,
        reconciliation: { raise_flag: true, auto_apply_allowed: false },
      });
      expect(run.outcomes[0]?.information).toBeUndefined();
      expect(run.production_allowed).toBe(false);
    });
  }
});

describe("S280 BEH-S280-6: the lease's numbers check reads the same rule", () => {
  const facts = {
    contractualRent: 1700,
    rentCharges: null,
    leaseEndIso: "2026-12-31",
    workingRent: null,
    sheetRent: 1750,
    sheetEndIso: "2026-11-30",
    sourceReadable: true,
  };

  it("BEH-S280-6: Numbers agree, with the Sheet values as information", () => {
    const check = renewalNumbersCheck(facts);
    expect(check.state).toBe("agree");
    expect(check.line).toBe("Numbers agree");
    expect(check.sheetNotes).toEqual([
      "The operating Sheet shows $1,750 for the current rent. This is information; RentVine is the basis.",
      "The operating Sheet shows 11/30/2026 for the lease end. This is information; RentVine is the basis.",
    ]);
  });

  it("AC-S280-7: a staff working value that differs from RentVine is still the one difference", () => {
    const check = renewalNumbersCheck({ ...facts, workingRent: 1800 });
    expect(check.state).toBe("difference");
    expect(check.line).toBe(
      "Your working current rent is $1,800 and RentVine reports $1,700",
    );
  });

  it("AC-S280-7: RentVine without a rent is still a difference and shows no Sheet note", () => {
    const check = renewalNumbersCheck({ ...facts, contractualRent: null });
    expect(check.state).toBe("difference");
    expect(check.sheetNotes.some((note) => note.includes("current rent"))).toBe(false);
  });
});

describe("S280 R-S280-6: the lease end as a RentVine lease read carries it (W12-09)", () => {
  // The live lease mapper emits RentVine's lease end as `lease_end_date`, never `renewal_date`
  // (F-RENEWAL-DATE-SEMANTICS), so the renewal date reconciliation alone never sees a RentVine
  // value. On the operating Sheet a different Sheet lease end is still information on Live renewal
  // review (R-S280-6, AC-S280-7), and still raises no flag.
  const leaseEndRun = (sheetEnd: string, operatingSheet = true) =>
    runRenewalPipeline({
      runId: "live-review",
      tables: [
        [
          HEADER as string[],
          ...LEASES.map((lease, index) =>
            sheetRow({
              [TENANT]: lease.tenant,
              [CURRENT_RENT]: `$${1900 + index * 10}`,
              [RENEWAL_DATE]: sheetEnd,
            }),
          ),
        ],
      ],
      nonSheetCandidates: mapLeasesToNonSheetCandidates(
        LEASES.map((lease) => ({
          leaseID: Number(lease.id),
          tenantName: lease.tenant,
          endDate: "2027-01-31",
          currentRent: 1700,
        })),
        { readTimestamp: "2026-11-12T18:20:00.000Z" },
      ).candidates,
      recordJoinIds: RECORD_JOIN_IDS,
      ...(operatingSheet ? { operatingSheet: true, leaseLabels: LEASE_LABELS } : {}),
    });

  it("AC-S280-7: the mapper's lease end gives one information row per lease and field, and no flag", () => {
    const run = leaseEndRun("12/31/2026");
    expect(run.flags).toEqual([]);
    expect(
      run.outcomes
        .filter((outcome) => outcome.fieldKey === "renewal_date")
        .every((outcome) => !outcome.reconciliation.raise_flag),
    ).toBe(true);
    const view = buildRenewalRunView(run, [], "Live renewal review");
    expect(view.totalFlags).toBe(0);
    const information = view.information ?? [];
    expect(information).toHaveLength(6);
    expect(new Set(information.map((row) => row.key)).size).toBe(6);
    expect(
      information.find(
        (row) => row.leaseLabel === "102 Sample Pl" && row.fieldKey === "renewal_date",
      ),
    ).toMatchObject({
      leaseId: "102",
      sheetUpdateHref: "/lease-renewal/live/desk/lease/102#renewal-rent-and-charges",
      line: "102 Sample Pl: the operating Sheet shows 12/31/2026 and RentVine shows 01/31/2027. RentVine is the basis.",
    });
  });

  it("AC-S280-7: an equal or unreadable Sheet lease end adds nothing, and a synthetic run is unchanged", () => {
    for (const sheetEnd of ["01/31/2027", "TBD"]) {
      const run = leaseEndRun(sheetEnd);
      expect(run.flags).toEqual([]);
      expect(
        (buildRenewalRunView(run, [], "Live renewal review").information ?? []).filter(
          (row) => row.fieldKey === "renewal_date",
        ),
      ).toEqual([]);
    }
    const synthetic = leaseEndRun("12/31/2026", false);
    expect(synthetic.outcomes.every((outcome) => outcome.information === undefined)).toBe(
      true,
    );
    expect(synthetic.flags.filter((flag) => flag.fieldKey === "renewal_date")).toEqual(
      [],
    );
  });
});
