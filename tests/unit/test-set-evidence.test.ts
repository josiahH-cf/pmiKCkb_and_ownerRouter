// S63 append-only evidence and dual-verdict derivation. Every identity/value below is an obviously
// synthetic unit fixture and can never reach a Live provider or production record.

import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { TestSetBaseline } from "@/lib/firestore/test-set-baseline";
import {
  appendTestSetEvidence,
  humanComparisonMode,
  listTestSetEvidence,
} from "@/lib/firestore/test-set-evidence";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  deriveBaselineDiscrepancies,
  evaluateTestSetVerdict,
  verdictInputFromRecords,
} from "@/lib/lease-renewal/test-set-verdict";
import {
  RENEWAL_PROCESS_DEFINITION,
  RENEWAL_PROCESS_VERSION,
} from "@/lib/lease-renewal/renewal-process";
import { FakeFirestore } from "../helpers/fake-firestore";

const editor: AuthenticatedUser = {
  uid: "fixture-editor",
  email: "fixture.editor@example.invalid",
  hd: "example.invalid",
  role: "Editor",
};
const leaseId = "fixture-lease-a";

function fs(db: FakeFirestore): Firestore {
  return db as unknown as Firestore;
}

function baseline(currentRent = 1000, sheetRent = "$1,000.00"): TestSetBaseline {
  return {
    leaseId,
    sheetRowNumber: 101,
    rentvineFacts: {
      leaseId,
      leaseEnd: "2030-01-31",
      currentRent,
      tenantCount: 1,
      addressLabel: "fixture address",
      portfolioId: null,
    },
    sheetRow: { current_rent: sheetRent },
    hash: "a".repeat(64),
    capturedAt: "2030-01-01T00:00:00.000Z",
    capturedByUid: editor.uid,
  };
}

function processPayload() {
  return {
    baselineHash: "a".repeat(64),
    processVersion: RENEWAL_PROCESS_VERSION,
    observedStepIds: RENEWAL_PROCESS_DEFINITION.steps.map((step) => step.id),
    observedSubstepIds: RENEWAL_PROCESS_DEFINITION.steps.flatMap((step) =>
      step.substeps.map((substep) => substep.id),
    ),
    branchOrBlockerExplained: true,
    transitionEvidenceExplained: true,
  };
}

function numberPayload() {
  return {
    baselineHash: "a".repeat(64),
    sourceFactsMatchOrRaised: true,
    contractualBaseRentVerified: true,
    recurringChargesSeparated: true,
    rentCastRadiusMiles: 2,
    rentCastRequestedCount: 15,
    providerOrderPreserved: true,
    hiddenSelectionApplied: false,
    providerEvidenceAttributed: true,
    humanDecisionRecordedSeparately: true,
    providerSetOfferedRent: false,
  };
}

function safetyPayload() {
  return {
    baselineHash: "a".repeat(64),
    previewWithoutConfirmationObserved: true,
    appDraftCreateCount: 0,
    appClientSendCount: 0,
    rentvineWriteReceiptCount: 0,
    sheetWriteReceiptCount: 0,
    dotloopWriteReceiptCount: 0,
  };
}

describe("test-set evidence is append-only", () => {
  it("preserves app and human positions instead of overwriting a shared value", async () => {
    const db = new FakeFirestore();
    await appendTestSetEvidence(
      editor,
      {
        leaseId,
        kind: "app_position",
        note: "Fixture app reference evidence.",
        payload: { proposedRent: 1200 },
      },
      fs(db),
    );
    await appendTestSetEvidence(
      editor,
      {
        leaseId,
        kind: "human_position",
        note: "Fixture human decision.",
        payload: { rent: 1180 },
      },
      fs(db),
    );
    const entries = await listTestSetEvidence(editor, leaseId, fs(db));
    expect(entries.map((entry) => entry.kind)).toEqual([
      "app_position",
      "human_position",
    ]);
    expect(entries[0]!.payload.proposedRent).toBe(1200);
    expect(entries[1]!.payload.rent).toBe(1180);
  });

  it("keeps revised human observations as a second immutable entry", async () => {
    const db = new FakeFirestore();
    for (const [note, rent] of [
      ["Fixture first decision.", 1180],
      ["Fixture revised decision.", 1190],
    ] as const) {
      await appendTestSetEvidence(
        editor,
        { leaseId, kind: "human_position", note, payload: { rent } },
        fs(db),
      );
    }
    const entries = await listTestSetEvidence(editor, leaseId, fs(db));
    expect(entries.map((entry) => entry.payload.rent)).toEqual([1180, 1190]);
  });

  it("uses a stable idempotency key so a retry cannot append the same observation twice", async () => {
    const db = new FakeFirestore();
    const input = {
      leaseId,
      kind: "process_observation" as const,
      note: "Fixture idempotent observation.",
      payload: processPayload(),
      idempotencyKey: "fixture-batch-1:fixture-observation-1",
    };
    const first = await appendTestSetEvidence(editor, input, fs(db));
    expect(first.idempotencyKey).toBe(input.idempotencyKey);
    await expect(appendTestSetEvidence(editor, input, fs(db))).rejects.toThrow(
      /already exists/i,
    );
    expect((await listTestSetEvidence(editor, leaseId, fs(db))).length).toBe(1);
  });

  it("validates inputs, writes nothing on refusal, and exports no update/delete path", async () => {
    const db = new FakeFirestore();
    await expect(
      appendTestSetEvidence(
        editor,
        { leaseId, kind: "app_position", note: "  " },
        fs(db),
      ),
    ).rejects.toThrow(EditableLayerError);
    expect(db.store.size).toBe(0);

    const evidenceModule = await import("@/lib/firestore/test-set-evidence");
    expect(
      Object.keys(evidenceModule).filter((name) =>
        /update|delete|remove|overwrite|edit/i.test(name),
      ),
    ).toEqual([]);
  });
});

describe("source disagreement and dual observation derivation", () => {
  it("derives a rent disagreement from the frozen sources without a case-specific rule", () => {
    expect(deriveBaselineDiscrepancies(baseline(0, "$1,000.00"))).toEqual([
      "current_rent",
    ]);
    expect(deriveBaselineDiscrepancies(baseline())).toEqual([]);
  });

  it("round-trips process, number/evidence, and safety observations to a passing verdict", async () => {
    const db = new FakeFirestore();
    for (const [kind, note, payload] of [
      ["process_observation", "Fixture process observation.", processPayload()],
      [
        "number_evidence_observation",
        "Fixture number/evidence observation.",
        numberPayload(),
      ],
      ["safety_observation", "Fixture safety observation.", safetyPayload()],
    ] as const) {
      await appendTestSetEvidence(editor, { leaseId, kind, note, payload }, fs(db));
    }
    const entries = await listTestSetEvidence(editor, leaseId, fs(db));
    const verdict = evaluateTestSetVerdict(
      verdictInputFromRecords({ baseline: baseline(), entries }),
    );
    expect(verdict.criteria.process.status).toBe("pass");
    expect(verdict.criteria.numberEvidence.status).toBe("pass");
    expect(verdict.criteria.safety.status).toBe("pass");
    expect(verdict.overall).toBe("pass");
  });

  it("leaves every family not evaluated when its explicit observation is absent", () => {
    const verdict = evaluateTestSetVerdict(
      verdictInputFromRecords({ baseline: baseline(), entries: [] }),
    );
    expect(verdict.criteria.process.status).toBe("not_evaluated");
    expect(verdict.criteria.numberEvidence.status).toBe("not_evaluated");
    expect(verdict.criteria.safety.status).toBe("not_evaluated");
    expect(verdict.overall).toBe("incomplete");
  });
});

describe("blind versus informed human comparison", () => {
  it("distinguishes ordering and returns null when either side is absent", () => {
    const app = {
      id: "b",
      leaseId,
      kind: "app_position" as const,
      note: "Fixture app position.",
      payload: {},
      recordedAt: "2030-01-02T00:00:00.000Z",
      recordedByUid: editor.uid,
    };
    const humanBefore = {
      ...app,
      id: "a",
      kind: "human_position" as const,
      recordedAt: "2030-01-01T00:00:00.000Z",
    };
    const humanAfter = {
      ...humanBefore,
      id: "c",
      recordedAt: "2030-01-03T00:00:00.000Z",
    };
    expect(humanComparisonMode([humanBefore, app])).toBe("blind");
    expect(humanComparisonMode([app, humanAfter])).toBe("informed");
    expect(humanComparisonMode([app])).toBeNull();
  });
});
