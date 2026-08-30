import type { TestSetBaseline } from "@/lib/firestore/test-set-baseline";
import type { TestSetEvidenceEntry } from "@/lib/firestore/test-set-evidence";
import { canonicalJson } from "@/lib/execution/preview-hash";
import type { S63ObservationBatch } from "@/lib/lease-renewal/test-set-observation-input";
import { S63RunError } from "@/lib/lease-renewal/test-set-run-output";
import type { S63CaseRef } from "@/lib/lease-renewal/test-set-runtime-config";

export interface PlannedTestSetEvidence {
  caseRef: S63CaseRef;
  leaseId: string;
  idempotencyKey: string;
  kind: TestSetEvidenceEntry["kind"];
  note: string;
  payload: Record<string, unknown>;
}

export interface TestSetEvidenceBatchPlan {
  appends: readonly PlannedTestSetEvidence[];
  reusedCount: number;
}

export function testSetEvidenceMatchesPlan(
  existing: TestSetEvidenceEntry,
  planned: PlannedTestSetEvidence,
): boolean {
  return (
    existing.leaseId === planned.leaseId &&
    existing.idempotencyKey === planned.idempotencyKey &&
    existing.kind === planned.kind &&
    existing.note === planned.note &&
    canonicalJson(existing.payload) === canonicalJson(planned.payload)
  );
}

/**
 * Resolve and compare the complete secure batch before the caller performs its first append. This
 * prevents a known conflict in a later observation from leaving an avoidable partial batch. Races
 * are still reconciled by deterministic create-only document ids at the write boundary.
 */
export function planTestSetEvidenceBatch(input: {
  observations: S63ObservationBatch;
  baselineByCase: ReadonlyMap<S63CaseRef, TestSetBaseline>;
  evidenceByCase: ReadonlyMap<S63CaseRef, readonly TestSetEvidenceEntry[]>;
}): TestSetEvidenceBatchPlan {
  const appends: PlannedTestSetEvidence[] = [];
  let reusedCount = 0;

  for (const observation of input.observations.entries) {
    const baseline = input.baselineByCase.get(observation.caseRef);
    if (!baseline) throw new S63RunError("baseline_missing");
    const planned: PlannedTestSetEvidence = {
      caseRef: observation.caseRef,
      leaseId: baseline.leaseId,
      idempotencyKey: `${input.observations.batchRef}:${observation.observationRef}`,
      kind: observation.kind,
      note: observation.note,
      payload: { ...observation.payload, baselineHash: baseline.hash },
    };
    const matchingKey = (input.evidenceByCase.get(observation.caseRef) ?? []).filter(
      (entry) => entry.idempotencyKey === planned.idempotencyKey,
    );
    if (matchingKey.length > 1) {
      throw new S63RunError("observation_conflict");
    }
    if (matchingKey.length === 1) {
      if (!testSetEvidenceMatchesPlan(matchingKey[0]!, planned)) {
        throw new S63RunError("observation_conflict");
      }
      reusedCount += 1;
    } else {
      appends.push(Object.freeze(planned));
    }
  }

  return Object.freeze({ appends: Object.freeze(appends), reusedCount });
}
