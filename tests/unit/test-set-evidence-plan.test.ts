import { describe, expect, it } from "vitest";

import type { TestSetBaseline } from "@/lib/firestore/test-set-baseline";
import type { TestSetEvidenceEntry } from "@/lib/firestore/test-set-evidence";
import { planTestSetEvidenceBatch } from "@/lib/lease-renewal/test-set-evidence-plan";
import type { S63ObservationBatch } from "@/lib/lease-renewal/test-set-observation-input";

function baseline(leaseId: string, hashSeed: string): TestSetBaseline {
  return {
    leaseId,
    sheetRowNumber: 101,
    rentvineFacts: {
      leaseId,
      leaseEnd: "2030-01-31",
      currentRent: 1234,
      tenantCount: 1,
      addressLabel: "fixture address",
      portfolioId: null,
    },
    sheetRow: { current_rent: "$1,234.00" },
    hash: hashSeed.repeat(64),
    capturedAt: "2030-01-01T00:00:00.000Z",
    capturedByUid: "fixture-operator",
  };
}

function batch(): S63ObservationBatch {
  return {
    schemaVersion: "s63-observation-v1",
    batchRef: "fixture-batch-1",
    entries: [
      {
        observationRef: "process-1",
        caseRef: "case-1",
        kind: "process_observation",
        note: "Fixture process observation.",
        payload: { processVersion: "renewal-v1" },
      },
      {
        observationRef: "safety-2",
        caseRef: "case-2",
        kind: "safety_observation",
        note: "Fixture safety observation.",
        payload: { appDraftCreateCount: 0 },
      },
    ],
  };
}

function evidence(input: {
  leaseId: string;
  key: string;
  kind: TestSetEvidenceEntry["kind"];
  note: string;
  payload: Record<string, unknown>;
}): TestSetEvidenceEntry {
  return {
    id: "fixture-evidence-id",
    leaseId: input.leaseId,
    idempotencyKey: input.key,
    kind: input.kind,
    note: input.note,
    payload: input.payload,
    recordedAt: "2030-01-02T00:00:00.000Z",
    recordedByUid: "fixture-operator",
  };
}

describe("S63 evidence batch planning", () => {
  it("binds every planned append to the exact baseline before any write", () => {
    const first = baseline("fixture-lease-a", "a");
    const second = baseline("fixture-lease-b", "b");
    const plan = planTestSetEvidenceBatch({
      observations: batch(),
      baselineByCase: new Map([
        ["case-1", first],
        ["case-2", second],
      ]),
      evidenceByCase: new Map([
        ["case-1", []],
        ["case-2", []],
      ]),
    });

    expect(plan.reusedCount).toBe(0);
    expect(plan.appends).toHaveLength(2);
    expect(plan.appends[0]).toMatchObject({
      caseRef: "case-1",
      idempotencyKey: "fixture-batch-1:process-1",
      payload: { baselineHash: first.hash },
    });
    expect(plan.appends[1]?.payload.baselineHash).toBe(second.hash);
  });

  it("refuses a later conflicting retry during planning, before any append can start", () => {
    const first = baseline("fixture-lease-a", "a");
    const second = baseline("fixture-lease-b", "b");
    const conflicting = evidence({
      leaseId: second.leaseId,
      key: "fixture-batch-1:safety-2",
      kind: "safety_observation",
      note: "Different observation.",
      payload: { appDraftCreateCount: 9, baselineHash: second.hash },
    });

    expect(() =>
      planTestSetEvidenceBatch({
        observations: batch(),
        baselineByCase: new Map([
          ["case-1", first],
          ["case-2", second],
        ]),
        evidenceByCase: new Map([
          ["case-1", []],
          ["case-2", [conflicting]],
        ]),
      }),
    ).toThrowError(expect.objectContaining({ code: "observation_conflict" }));
  });

  it("reuses exact prior entries and plans only missing entries", () => {
    const first = baseline("fixture-lease-a", "a");
    const second = baseline("fixture-lease-b", "b");
    const exact = evidence({
      leaseId: first.leaseId,
      key: "fixture-batch-1:process-1",
      kind: "process_observation",
      note: "Fixture process observation.",
      payload: { processVersion: "renewal-v1", baselineHash: first.hash },
    });

    const plan = planTestSetEvidenceBatch({
      observations: batch(),
      baselineByCase: new Map([
        ["case-1", first],
        ["case-2", second],
      ]),
      evidenceByCase: new Map([
        ["case-1", [exact]],
        ["case-2", []],
      ]),
    });
    expect(plan.reusedCount).toBe(1);
    expect(plan.appends.map((entry) => entry.caseRef)).toEqual(["case-2"]);
  });
});
