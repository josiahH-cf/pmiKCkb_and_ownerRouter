// S63 secure report generator. Exact case/operator/report context comes only from git-excluded
// runtime configuration. The generator reads immutable Firestore baselines/evidence, validates the
// exact binding/hash, and writes client data only under gitignored temp/test-set/. Terminal output
// contains counts and an opaque run reference, never a case value or report path.
//
//   S63_TEST_SET_RUNTIME_CONFIG_PATH=<secure path> npm run testset:report

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  getTestSetBaseline,
  verifyTestSetBaselineHash,
} from "../lib/firestore/test-set-baseline";
import {
  humanComparisonMode,
  listTestSetEvidence,
} from "../lib/firestore/test-set-evidence";
import {
  buildTestSetReport,
  type TestSetReportLease,
} from "../lib/lease-renewal/test-set-report";
import {
  createTestSetRunReference,
  formatTestSetRefusal,
  formatTestSetReportSummary,
  S63RunError,
  safeTestSetFailureCode,
} from "../lib/lease-renewal/test-set-run-output";
import { loadTestSetRuntimeConfig } from "../lib/lease-renewal/test-set-runtime-config";
import {
  evaluateTestSetVerdict,
  verdictInputFromRecords,
} from "../lib/lease-renewal/test-set-verdict";

const REPORT_DEFAULT_DIR = "temp/test-set";

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
  const runReference = createTestSetRunReference();
  const outPath = resolve(root, REPORT_DEFAULT_DIR, `report-${runReference}.md`);
  const relOut = relative(resolve(root, "temp"), outPath);
  if (
    relOut === "" ||
    relOut === ".." ||
    relOut.startsWith(`..${sep}`) ||
    isAbsolute(relOut)
  ) {
    throw new S63RunError("report_path_refused");
  }

  const db = getLiveFirestore();
  const leases: TestSetReportLease[] = [];
  for (const binding of runtime.cases) {
    const baseline = await getTestSetBaseline(runtime.actor, binding.leaseId, db);
    if (
      baseline &&
      (baseline.leaseId !== binding.leaseId ||
        baseline.rentvineFacts.leaseId !== binding.leaseId ||
        baseline.sheetRowNumber !== binding.sheetRowNumber)
    ) {
      throw new S63RunError("baseline_binding_conflict");
    }
    if (baseline && !verifyTestSetBaselineHash(baseline)) {
      throw new S63RunError("baseline_hash_invalid");
    }
    const evidence = await listTestSetEvidence(runtime.actor, binding.leaseId, db);
    leases.push({
      leaseId: binding.leaseId,
      sheetRowNumber: binding.sheetRowNumber,
      endDateIso: baseline?.rentvineFacts.leaseEnd ?? null,
      baseline: {
        captured: baseline !== null,
        hash: baseline?.hash ?? null,
        capturedAt: baseline?.capturedAt ?? null,
      },
      evidence,
      verdict: evaluateTestSetVerdict(
        verdictInputFromRecords({ baseline, entries: evidence }),
      ),
      comparisonMode: humanComparisonMode(evidence),
    });
  }

  const report = buildTestSetReport({
    generatedAtIso: new Date().toISOString(),
    windowDescription: runtime.report.windowDescription,
    dailyOwner: runtime.report.dailyOwner,
    abortTrigger: runtime.report.abortTrigger,
    leases,
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, report, "utf8");
  console.log(
    formatTestSetReportSummary({
      runReference,
      caseCount: leases.length,
      baselineCount: leases.filter((lease) => lease.baseline.captured).length,
      evidenceCount: leases.reduce((count, lease) => count + lease.evidence.length, 0),
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      formatTestSetRefusal({
        operation: "report",
        code: safeTestSetFailureCode(error),
      }),
    );
    process.exitCode = 1;
  });
}
