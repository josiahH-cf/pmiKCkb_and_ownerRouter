// S63 report generator (AC-S63-7). Generates the four-lease test-set report FROM the Firestore
// evidence records and frozen baselines — never hand-authored — and writes it OUTSIDE git, under
// the gitignored temp/ tree (same boundary as the golden-data captures), because the report
// contains client data. Read-only against every external system; its only writes are the local
// report file.
//
//   npm run testset:report                 # writes temp/test-set/report-<timestamp>.md
//   npm run testset:report -- --out temp/test-set/custom.md

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { AuthenticatedUser } from "../lib/auth/session";
import { getTestSetBaseline } from "../lib/firestore/test-set-baseline";
import {
  humanComparisonMode,
  listTestSetEvidence,
} from "../lib/firestore/test-set-evidence";
import {
  buildTestSetReport,
  type TestSetReportLease,
} from "../lib/lease-renewal/test-set-report";
import {
  evaluateTestSetVerdict,
  verdictInputFromRecords,
} from "../lib/lease-renewal/test-set-verdict";

const REPORT_DEFAULT_DIR = "temp/test-set";

// The resolved cohort (lease ids, Sheet rows, end dates are deliberately committable).
const COHORT: ReadonlyArray<{ leaseId: string; sheetRow: number; endDate: string }> = [
  { leaseId: "278", sheetRow: 507, endDate: "2026-09-30" },
  { leaseId: "279", sheetRow: 508, endDate: "2026-09-30" },
  { leaseId: "280", sheetRow: 509, endDate: "2026-09-30" },
  { leaseId: "297", sheetRow: 510, endDate: "2026-10-10" },
];

const REPORT_ACTOR: AuthenticatedUser = {
  uid: "script:generate-test-set-report",
  email: "ops@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

function loadLocalEnv(root: string): void {
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && match[1] && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  } catch {
    // Fall back to ambient env.
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

  const outArgIndex = process.argv.indexOf("--out");
  const outPath = resolve(
    root,
    outArgIndex >= 0 && process.argv[outArgIndex + 1]
      ? process.argv[outArgIndex + 1]!
      : join(
          REPORT_DEFAULT_DIR,
          `report-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
        ),
  );
  // The report contains client data: refuse any destination outside the gitignored temp/ tree.
  const relOut = relative(resolve(root, "temp"), outPath);
  if (relOut.startsWith("..")) {
    throw new Error(
      `Refusing to write the report outside the gitignored temp/ tree: ${outPath}`,
    );
  }

  const db = getLiveFirestore();
  const leases: TestSetReportLease[] = [];
  for (const member of COHORT) {
    const baseline = await getTestSetBaseline(REPORT_ACTOR, member.leaseId, db);
    const evidence = await listTestSetEvidence(REPORT_ACTOR, member.leaseId, db);
    const verdict = evaluateTestSetVerdict(
      verdictInputFromRecords({ baseline, entries: evidence }),
    );
    leases.push({
      leaseId: member.leaseId,
      sheetRowNumber: member.sheetRow,
      endDateIso: baseline?.rentvineFacts.leaseEnd ?? member.endDate,
      baseline: {
        captured: baseline !== null,
        hash: baseline?.hash ?? null,
        capturedAt: baseline?.capturedAt ?? null,
      },
      evidence,
      verdict,
      comparisonMode: humanComparisonMode(evidence),
    });
  }

  const humanSends = leases.reduce(
    (count, lease) =>
      count + lease.evidence.filter((entry) => entry.kind === "human_send").length,
    0,
  );
  const report = buildTestSetReport({
    generatedAtIso: new Date().toISOString(),
    windowDescription:
      "Two to four weeks per D08, starting when the test set opens. Human reviewed sends recorded: " +
      `${humanSends}.`,
    dailyOwner: "Bailey (fallback: Josiah)",
    abortTrigger:
      "Any Sev-1 the runtime suspend cannot contain, or a second Sev-1 with the same cause.",
    leases,
    // Renewal/maintenance client sends stay Registry-closed under D33; the application has no
    // path that sends a client notice, so the checked count is the number of application-send
    // evidence entries, which the evidence model does not even define a kind for.
    applicationInitiatedClientSends: 0,
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, report, "utf8");
  console.log(`test-set report written: ${relative(root, outPath)}`);
  console.log(
    `leases: ${leases.length}; baselines captured: ${leases.filter((lease) => lease.baseline.captured).length}; evidence entries: ${leases.reduce((count, lease) => count + lease.evidence.length, 0)}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
