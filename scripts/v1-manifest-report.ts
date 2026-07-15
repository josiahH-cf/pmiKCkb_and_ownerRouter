import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  buildCurrentPreV1Manifest,
  verifyV1ReleaseManifest,
  V1_REQUIRED_ACTION_KEYS,
} from "../lib/release/manifest";

export interface LocalV1ManifestReport {
  reportVersion: "v1-local-manifest-report:1.0";
  label: "Pre-V1 local readiness report — no deployment or live authority";
  bodyless: true;
  releaseAccepted: false;
  state: "pre-v1";
  stage: string;
  environment: "local";
  commit: string;
  revision: string;
  registryHash: string;
  suiteStates: Record<string, string>;
  actionProofs: {
    required: number;
    accepted: number;
    productionAllowed: number;
  };
  issueCount: number;
  gateCounts: {
    releaseIdentityAndPins: number;
    suiteAcceptance: number;
    actionProductionProof: number;
    releaseEvidence: number;
    namedAcceptance: number;
  };
}

function summarizeGates(issues: readonly string[]) {
  const gateCounts: LocalV1ManifestReport["gateCounts"] = {
    releaseIdentityAndPins: 0,
    suiteAcceptance: 0,
    actionProductionProof: 0,
    releaseEvidence: 0,
    namedAcceptance: 0,
  };

  for (const issue of issues) {
    if (/^S2[0-6]\b/.test(issue)) gateCounts.suiteAcceptance += 1;
    else if (
      /^(?:Required action|Unexpected manifest action|Manifest actions|Action Registry)/.test(
        issue,
      )
    ) {
      gateCounts.actionProductionProof += 1;
    } else if (
      /^(?:Release monitoring|Release rollback|Browser acceptance|Release smoke cases|Release migrations)/.test(
        issue,
      )
    ) {
      gateCounts.releaseEvidence += 1;
    } else if (/^(?:Dan business|Josiah technical)/.test(issue)) {
      gateCounts.namedAcceptance += 1;
    } else gateCounts.releaseIdentityAndPins += 1;
  }

  return gateCounts;
}

export function readHeadCommit() {
  try {
    const commit = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^[0-9a-f]{7,40}$/.test(commit) ? commit : "0000000";
  } catch {
    return "0000000";
  }
}

export function buildLocalV1ManifestReport(
  commit = readHeadCommit(),
): LocalV1ManifestReport {
  const manifest = buildCurrentPreV1Manifest(commit);
  const verification = verifyV1ReleaseManifest(manifest);

  if (
    verification.ok ||
    verification.state !== "pre-v1" ||
    manifest.environment !== "local" ||
    manifest.stage === "v1"
  ) {
    throw new Error(
      "The local manifest report boundary was violated; refusing to emit a release result.",
    );
  }

  return {
    reportVersion: "v1-local-manifest-report:1.0",
    label: "Pre-V1 local readiness report — no deployment or live authority",
    bodyless: true,
    releaseAccepted: false,
    state: "pre-v1",
    stage: manifest.stage,
    environment: "local",
    commit: manifest.commit,
    revision: manifest.revision,
    registryHash: manifest.registryHash,
    suiteStates: Object.fromEntries(
      Object.entries(manifest.suites).map(([suite, proof]) => [suite, proof.state]),
    ),
    actionProofs: {
      required: V1_REQUIRED_ACTION_KEYS.length,
      accepted: manifest.actions.filter((proof) => proof.state === "Accepted").length,
      productionAllowed: manifest.actions.filter((proof) => proof.productionAllowed)
        .length,
    },
    issueCount: verification.issues.length,
    gateCounts: summarizeGates(verification.issues),
  };
}

export function formatLocalV1ManifestReport(report: LocalV1ManifestReport, json = false) {
  if (json) return JSON.stringify(report, null, 2);

  return [
    report.label,
    `Release accepted: no; state: ${report.state}; stage: ${report.stage}; environment: ${report.environment}`,
    `Commit: ${report.commit}; revision: ${report.revision}`,
    `Required action proofs: ${report.actionProofs.required}; accepted: ${report.actionProofs.accepted}; production allowed: ${report.actionProofs.productionAllowed}`,
    `Open V1 gates: ${report.issueCount}`,
    `Gate counts — release identity/pins: ${report.gateCounts.releaseIdentityAndPins}; suites: ${report.gateCounts.suiteAcceptance}; action proofs: ${report.gateCounts.actionProductionProof}; release evidence: ${report.gateCounts.releaseEvidence}; named acceptance: ${report.gateCounts.namedAcceptance}`,
  ].join("\n");
}

export function main(
  argv = process.argv.slice(2),
  write: (output: string) => void = console.log,
) {
  const unknown = argv.filter((arg) => arg !== "--json");
  if (unknown.length > 0) {
    throw new Error(`Unknown argument: ${unknown[0]}`);
  }

  const report = buildLocalV1ManifestReport();
  write(formatLocalV1ManifestReport(report, argv.includes("--json")));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
