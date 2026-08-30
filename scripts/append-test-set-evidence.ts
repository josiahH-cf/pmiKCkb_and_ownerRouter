// S63 secure append-only evidence loader. The observation file refers only to opaque case slots;
// exact lease identity comes from the separate secure runtime config. Every entry is bound to the
// current immutable baseline hash before the first write. Output is counts plus an opaque run ref.
//
//   S63_TEST_SET_RUNTIME_CONFIG_PATH=<secure path> \
//   S63_TEST_SET_OBSERVATION_PATH=<secure path> npm run testset:append-evidence

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  getTestSetBaseline,
  verifyTestSetBaselineHash,
  type TestSetBaseline,
} from "../lib/firestore/test-set-baseline";
import {
  appendTestSetEvidence,
  listTestSetEvidence,
  type TestSetEvidenceEntry,
} from "../lib/firestore/test-set-evidence";
import {
  planTestSetEvidenceBatch,
  testSetEvidenceMatchesPlan,
} from "../lib/lease-renewal/test-set-evidence-plan";
import { loadTestSetObservationBatch } from "../lib/lease-renewal/test-set-observation-input";
import {
  createTestSetRunReference,
  formatTestSetEvidenceSummary,
  formatTestSetRefusal,
  S63RunError,
  safeTestSetFailureCode,
} from "../lib/lease-renewal/test-set-run-output";
import {
  loadTestSetRuntimeConfig,
  type S63CaseRef,
} from "../lib/lease-renewal/test-set-runtime-config";

function loadLocalEnv(root: string): void {
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && match[1] && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  } catch {
    // Ambient environment remains authoritative when no local env file exists.
  }
}

function getLiveFirestore() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }
  return getFirestore();
}

async function main(): Promise<void> {
  const root = process.cwd();
  loadLocalEnv(root);
  const runtime = loadTestSetRuntimeConfig({ rootDir: root });
  const observations = loadTestSetObservationBatch({ rootDir: root });
  const runReference = createTestSetRunReference();

  const db = getLiveFirestore();
  const baselineByCase = new Map<S63CaseRef, TestSetBaseline>();
  const evidenceByCase = new Map<S63CaseRef, TestSetEvidenceEntry[]>();
  for (const binding of runtime.cases) {
    const baseline = await getTestSetBaseline(runtime.actor, binding.leaseId, db);
    if (!baseline) throw new S63RunError("baseline_missing");
    if (
      baseline.leaseId !== binding.leaseId ||
      baseline.rentvineFacts.leaseId !== binding.leaseId ||
      baseline.sheetRowNumber !== binding.sheetRowNumber
    ) {
      throw new S63RunError("baseline_binding_conflict");
    }
    if (!verifyTestSetBaselineHash(baseline)) {
      throw new S63RunError("baseline_hash_invalid");
    }
    baselineByCase.set(binding.caseRef, baseline);
    evidenceByCase.set(
      binding.caseRef,
      await listTestSetEvidence(runtime.actor, binding.leaseId, db),
    );
  }

  const plan = planTestSetEvidenceBatch({
    observations,
    baselineByCase,
    evidenceByCase,
  });
  let appendedCount = 0;
  let reusedCount = plan.reusedCount;
  for (const planned of plan.appends) {
    try {
      const appended = await appendTestSetEvidence(
        runtime.actor,
        {
          leaseId: planned.leaseId,
          kind: planned.kind,
          note: planned.note,
          payload: planned.payload,
          idempotencyKey: planned.idempotencyKey,
        },
        db,
      );
      evidenceByCase.set(planned.caseRef, [
        ...(evidenceByCase.get(planned.caseRef) ?? []),
        appended,
      ]);
      appendedCount += 1;
    } catch {
      const readback = await listTestSetEvidence(runtime.actor, planned.leaseId, db);
      const raced = readback.find(
        (entry) => entry.idempotencyKey === planned.idempotencyKey,
      );
      if (!raced) throw new S63RunError("app_plane_write_failed");
      if (!testSetEvidenceMatchesPlan(raced, planned)) {
        throw new S63RunError("observation_conflict");
      }
      evidenceByCase.set(planned.caseRef, readback);
      reusedCount += 1;
    }
  }

  console.log(
    formatTestSetEvidenceSummary({
      runReference,
      caseSlotCount: new Set(
        observations.entries.map((observation) => observation.caseRef),
      ).size,
      appendedCount,
      reusedCount,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      formatTestSetRefusal({
        operation: "evidence",
        code: safeTestSetFailureCode(error),
      }),
    );
    process.exitCode = 1;
  });
}
