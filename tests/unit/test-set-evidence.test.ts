// S63 evidence record + verdict logic (AC-S63-4, AC-S63-5, AC-S63-10, AC-S63-12). The record is
// append-only by construction; lease 297's day-zero rent disagreement must surface as a RAISED
// discrepancy or criterion 2 fails; a criterion with missing inputs is not_evaluated, never a
// pass; and the record distinguishes a blind human figure from an informed one.

import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  appendTestSetEvidence,
  humanComparisonMode,
  listTestSetEvidence,
  type TestSetEvidenceEntry,
} from "@/lib/firestore/test-set-evidence";
import type { TestSetBaseline } from "@/lib/firestore/test-set-baseline";
import {
  deriveBaselineDiscrepancies,
  evaluateTestSetVerdict,
  numberAgreementTolerance,
  TESTSET_TOLERANCE_PCT,
  TESTSET_TOLERANCE_USD,
  verdictInputFromRecords,
  type TestSetVerdictInput,
} from "@/lib/lease-renewal/test-set-verdict";
import { FakeFirestore } from "../helpers/fake-firestore";

const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor-1@example.com",
  hd: "example.com",
  role: "Editor",
};
function fs(db: FakeFirestore): Firestore {
  return db as unknown as Firestore;
}

describe("test-set evidence record is append-only (AC-S63-4)", () => {
  it("recording a human number after an app number preserves both", async () => {
    const db = new FakeFirestore();
    await appendTestSetEvidence(
      editor,
      {
        leaseId: "278",
        kind: "app_position",
        note: "App proposed a number from its comp basis.",
        payload: { proposedRent: 1300 },
      },
      fs(db),
    );
    await appendTestSetEvidence(
      editor,
      {
        leaseId: "278",
        kind: "human_position",
        note: "Team landed on their own figure.",
        payload: { rent: 1280 },
      },
      fs(db),
    );
    const entries = await listTestSetEvidence(editor, "278", fs(db));
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.kind)).toEqual([
      "app_position",
      "human_position",
    ]);
    // Both figures survive side by side — nothing overwrote the shared field.
    expect(entries[0]!.payload.proposedRent).toBe(1300);
    expect(entries[1]!.payload.rent).toBe(1280);
  });

  it("a re-recorded decision does not erase its predecessor", async () => {
    const db = new FakeFirestore();
    await appendTestSetEvidence(
      editor,
      {
        leaseId: "278",
        kind: "human_position",
        note: "First figure.",
        payload: { rent: 1280 },
      },
      fs(db),
    );
    await appendTestSetEvidence(
      editor,
      {
        leaseId: "278",
        kind: "human_position",
        note: "Revised figure.",
        payload: { rent: 1290 },
      },
      fs(db),
    );
    const entries = await listTestSetEvidence(editor, "278", fs(db));
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.payload.rent)).toEqual([1280, 1290]);
  });

  it("validates its inputs and writes nothing on refusal", async () => {
    const db = new FakeFirestore();
    await expect(
      appendTestSetEvidence(
        editor,
        { leaseId: "278", kind: "app_position", note: "  " },
        fs(db),
      ),
    ).rejects.toThrow(EditableLayerError);
    await expect(
      appendTestSetEvidence(
        editor,
        {
          leaseId: "278",
          kind: "not_a_kind" as never,
          note: "x",
        },
        fs(db),
      ),
    ).rejects.toThrow(EditableLayerError);
    expect(db.store.size).toBe(0);
  });

  it("the module exposes no update or delete path (append-only by construction)", async () => {
    const evidenceModule = await import("@/lib/firestore/test-set-evidence");
    const mutators = Object.keys(evidenceModule).filter((name) =>
      /update|delete|remove|overwrite|edit/i.test(name),
    );
    expect(mutators).toEqual([]);
  });
});

describe("lease 297's day-zero rent disagreement (AC-S63-5)", () => {
  const baseline297: TestSetBaseline = {
    leaseId: "297",
    sheetRowNumber: 510,
    rentvineFacts: {
      leaseId: "297",
      leaseEnd: "2026-10-10",
      currentRent: 0,
      tenantCount: 5,
      addressLabel: "fixture address",
      portfolioId: null,
    },
    sheetRow: { current_rent: "$1,000.00", market_value: "$1,100.00" },
    hash: "0".repeat(64),
    capturedAt: "2026-08-06T00:00:00.000Z",
    capturedByUid: "editor-1",
  };

  it("derives the current_rent disagreement from the frozen baseline", () => {
    expect(deriveBaselineDiscrepancies(baseline297)).toEqual(["current_rent"]);
  });

  it("derives nothing when the sources agree", () => {
    expect(
      deriveBaselineDiscrepancies({
        ...baseline297,
        rentvineFacts: { ...baseline297.rentvineFacts, currentRent: 1000 },
      }),
    ).toEqual([]);
  });

  it("criterion 2 FAILS when the known disagreement was never raised, passes when raised", () => {
    const base: TestSetVerdictInput["factAccuracy"] = {
      knownDiscrepancyFields: deriveBaselineDiscrepancies(baseline297),
      raisedDiscrepancyFields: [],
      factsMatchOrRaised: true,
    };
    const silent = evaluateTestSetVerdict(minimalVerdictInput({ factAccuracy: base }));
    expect(silent.criteria.factAccuracy.status).toBe("fail");
    expect(silent.criteria.factAccuracy.reason).toContain("current_rent");

    const raised = evaluateTestSetVerdict(
      minimalVerdictInput({
        factAccuracy: { ...base, raisedDiscrepancyFields: ["current_rent"] },
      }),
    );
    expect(raised.criteria.factAccuracy.status).toBe("pass");
  });

  it("appending the raised discrepancy records it on the evidence trail", async () => {
    const db = new FakeFirestore();
    const entry = await appendTestSetEvidence(
      editor,
      {
        leaseId: "297",
        kind: "discrepancy_raised",
        note: "RentVine reads a zero current rent while the Sheet lists a non-zero figure.",
        payload: { field: "current_rent" },
      },
      fs(db),
    );
    expect(entry.kind).toBe("discrepancy_raised");
    const entries = await listTestSetEvidence(editor, "297", fs(db));
    expect(entries.map((item) => item.kind)).toContain("discrepancy_raised");
  });
});

describe("criterion 3 while inputs are missing (AC-S63-10)", () => {
  it("evaluates as not_evaluated with an explicit reason, never as a pass", () => {
    const verdict = evaluateTestSetVerdict(
      minimalVerdictInput({
        numberAgreement: {
          providerEstimate: null,
          providerMissingReason: "RentCast account inactive (Q-RENTCAST-ACCOUNT-403)",
          sheetMarketValue: 1100,
        },
      }),
    );
    expect(verdict.criteria.numberAgreement.status).toBe("not_evaluated");
    expect(verdict.criteria.numberAgreement.reason).toContain("Q-RENTCAST-ACCOUNT-403");
    expect(verdict.criteria.numberAgreement.reason).toContain("never reads as success");
    expect(verdict.overall).not.toBe("pass");
  });

  it("a missing Market Value is likewise not_evaluated", () => {
    const verdict = evaluateTestSetVerdict(
      minimalVerdictInput({
        numberAgreement: { providerEstimate: 1200, sheetMarketValue: null },
      }),
    );
    expect(verdict.criteria.numberAgreement.status).toBe("not_evaluated");
  });

  it("applies the owner-decided tolerance: the larger of ±5% and ±$50", () => {
    expect(TESTSET_TOLERANCE_PCT).toBe(5);
    expect(TESTSET_TOLERANCE_USD).toBe(50);
    // 5% of 800 is 40 → the $50 floor applies; 5% of 2000 is 100 → the percent applies.
    expect(numberAgreementTolerance(800)).toBe(50);
    expect(numberAgreementTolerance(2000)).toBe(100);

    const within = evaluateTestSetVerdict(
      minimalVerdictInput({
        numberAgreement: { providerEstimate: 2095, sheetMarketValue: 2000 },
      }),
    );
    expect(within.criteria.numberAgreement.status).toBe("pass");
    const outside = evaluateTestSetVerdict(
      minimalVerdictInput({
        numberAgreement: { providerEstimate: 2101, sheetMarketValue: 2000 },
      }),
    );
    expect(outside.criteria.numberAgreement.status).toBe("fail");
  });

  it("overall pass requires all four criteria to pass; unknowns yield incomplete", () => {
    const complete = evaluateTestSetVerdict(passingVerdictInput());
    expect(complete.overall).toBe("pass");
    const incomplete = evaluateTestSetVerdict(
      minimalVerdictInput({
        numberAgreement: { providerEstimate: null, sheetMarketValue: null },
      }),
    );
    expect(incomplete.overall).toBe("incomplete");
  });
});

describe("blind versus informed human capture (AC-S63-12)", () => {
  function entry(
    kind: TestSetEvidenceEntry["kind"],
    recordedAt: string,
    id: string,
  ): TestSetEvidenceEntry {
    return {
      id,
      leaseId: "278",
      kind,
      note: "x",
      payload: {},
      recordedAt,
      recordedByUid: "editor-1",
    };
  }

  it("human before app is blind; human after app is informed; one side missing is null", () => {
    expect(
      humanComparisonMode([
        entry("human_position", "2026-08-07T10:00:00.000Z", "a"),
        entry("app_position", "2026-08-07T11:00:00.000Z", "b"),
      ]),
    ).toBe("blind");
    expect(
      humanComparisonMode([
        entry("app_position", "2026-08-07T10:00:00.000Z", "a"),
        entry("human_position", "2026-08-07T11:00:00.000Z", "b"),
      ]),
    ).toBe("informed");
    expect(
      humanComparisonMode([entry("app_position", "2026-08-07T10:00:00.000Z", "a")]),
    ).toBe(null);
    expect(humanComparisonMode([])).toBe(null);
  });
});

function minimalVerdictInput(
  overrides: Partial<TestSetVerdictInput>,
): TestSetVerdictInput {
  return {
    reachability: {
      appearedOnDesk: true,
      endDateMatchesBaseline: true,
      dispositionCorrect: true,
    },
    factAccuracy: {
      knownDiscrepancyFields: [],
      raisedDiscrepancyFields: [],
      factsMatchOrRaised: true,
    },
    numberAgreement: { providerEstimate: null, sheetMarketValue: null },
    communicationCorrectness: {
      ownerDraftRecipientsCorrect: true,
      tenantDraftRecipientsCorrect: true,
      channelsSeparated: true,
      numbersAttributed: true,
    },
    ...overrides,
  };
}

function passingVerdictInput(): TestSetVerdictInput {
  return minimalVerdictInput({
    numberAgreement: { providerEstimate: 1100, sheetMarketValue: 1100 },
  });
}

// The report derives its verdict input FROM records, never from hand-typed values.
describe("verdictInputFromRecords", () => {
  const baseline297: TestSetBaseline = {
    leaseId: "297",
    sheetRowNumber: 510,
    rentvineFacts: {
      leaseId: "297",
      leaseEnd: "2026-10-10",
      currentRent: 0,
      tenantCount: 5,
      addressLabel: "fixture address",
      portfolioId: null,
    },
    sheetRow: { current_rent: "$1,000.00", market_value: "$1,100.00" },
    hash: "0".repeat(64),
    capturedAt: "2026-08-06T00:00:00.000Z",
    capturedByUid: "editor-1",
  };

  it("with no evidence yet, every observation is null and criterion 3 carries a reason", () => {
    const input = verdictInputFromRecords({ baseline: baseline297, entries: [] });
    expect(input.reachability.appearedOnDesk).toBeNull();
    expect(input.factAccuracy.factsMatchOrRaised).toBeNull();
    // The known day-zero disagreement is derived from the baseline even before any entry exists.
    expect(input.factAccuracy.knownDiscrepancyFields).toEqual(["current_rent"]);
    expect(input.numberAgreement.providerEstimate).toBeNull();
    expect(input.numberAgreement.providerMissingReason).toContain(
      "Q-RENTCAST-ACCOUNT-403",
    );
    expect(input.numberAgreement.sheetMarketValue).toBe(1100);
    const verdict = evaluateTestSetVerdict(input);
    expect(verdict.overall).toBe("incomplete");
  });

  it("raised discrepancies and observed booleans flow through from entries", () => {
    const input = verdictInputFromRecords({
      baseline: baseline297,
      entries: [
        { kind: "discrepancy_raised", payload: { field: "current_rent" } },
        { kind: "app_position", payload: { providerEstimate: 1120 } },
        {
          kind: "verdict",
          payload: {
            reachability: {
              appearedOnDesk: true,
              endDateMatchesBaseline: true,
              dispositionCorrect: true,
            },
            factAccuracy: { factsMatchOrRaised: true },
            communicationCorrectness: {
              ownerDraftRecipientsCorrect: true,
              tenantDraftRecipientsCorrect: true,
              channelsSeparated: true,
              numbersAttributed: true,
            },
          },
        },
      ],
    });
    const verdict = evaluateTestSetVerdict(input);
    expect(verdict.criteria.factAccuracy.status).toBe("pass");
    // 1120 vs 1100 within max(5% = 55, $50) = 55.
    expect(verdict.criteria.numberAgreement.status).toBe("pass");
    expect(verdict.overall).toBe("pass");
  });
});
