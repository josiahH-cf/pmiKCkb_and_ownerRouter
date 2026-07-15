import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  buildCurrentV1CandidateManifest,
  PROVIDER_ACTIVATION_STATES,
  verifyV1ReleaseManifest,
  V1_REQUIRED_ACTION_KEYS,
  type ProviderActivationState,
} from "../lib/release/manifest";

export interface LocalV1ManifestReport {
  reportVersion: "v1-local-manifest-report:2.2";
  label: "Local V1 evidence inventory — deployment verdict intentionally not assessed";
  bodyless: true;
  productionVerdictAssessed: false;
  state: "local-evidence-inventory";
  stage: string;
  environment: "local";
  commit: string;
  revision: string;
  registryHash: string;
  suiteStates: Record<string, string>;
  applicationWorkflow: {
    required: number;
    covered: number;
    productionTest: number;
    live: number;
    oneAttemptVerified: number;
    idempotencyVerified: number;
    correctionVerified: number;
  };
  providerActivation: {
    advisory: true;
    counts: Record<ProviderActivationState, number>;
    integrityIssueCount: number;
  };
  advisorySignoffs: {
    complete: boolean;
    danBusiness: "pending" | "accepted" | "invalid";
    josiahTechnical: "pending" | "accepted" | "invalid";
    issueCount: number;
  };
  issueCount: number;
  gateCounts: {
    releaseIdentityAndPins: number;
    suiteWorkflowAcceptance: number;
    applicationWorkflow: number;
    coreProductionEvidence: number;
  };
}

function summarizeGates(issues: readonly string[]) {
  const gateCounts: LocalV1ManifestReport["gateCounts"] = {
    releaseIdentityAndPins: 0,
    suiteWorkflowAcceptance: 0,
    applicationWorkflow: 0,
    coreProductionEvidence: 0,
  };

  for (const issue of issues) {
    if (/^S2[0-6]\b/.test(issue)) gateCounts.suiteWorkflowAcceptance += 1;
    else if (
      /(?:required actions|covered actions|one-attempt|idempotency|correction\/rollback|claims (?:live_|enabled|suspended)|includes Live proof fields|Manifest actions|Unexpected manifest action)/.test(
        issue,
      )
    ) {
      gateCounts.applicationWorkflow += 1;
    } else if (
      /^(?:Production deployment|Production build|Production authentication|Production safety|Release monitoring|Release rollback|Browser acceptance|Release smoke case|Release migrations)/.test(
        issue,
      )
    ) {
      gateCounts.coreProductionEvidence += 1;
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
  const manifest = buildCurrentV1CandidateManifest(commit);
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

  const activationCounts = Object.fromEntries(
    PROVIDER_ACTIVATION_STATES.map((state) => [
      state,
      manifest.actions.filter((proof) => proof.activation === state).length,
    ]),
  ) as Record<ProviderActivationState, number>;

  return {
    reportVersion: "v1-local-manifest-report:2.2",
    label: "Local V1 evidence inventory — deployment verdict intentionally not assessed",
    bodyless: true,
    productionVerdictAssessed: false,
    state: "local-evidence-inventory",
    stage: manifest.stage,
    environment: "local",
    commit: manifest.commit,
    revision: manifest.revision,
    registryHash: manifest.registryHash,
    suiteStates: Object.fromEntries(
      Object.entries(manifest.suites).map(([suite, proof]) => [suite, proof.state]),
    ),
    applicationWorkflow: {
      required: V1_REQUIRED_ACTION_KEYS.length,
      covered: manifest.actions.filter(
        (proof) => proof.applicationCoverage !== "unverified",
      ).length,
      productionTest: manifest.actions.filter(
        (proof) => proof.applicationCoverage === "production_test",
      ).length,
      live: manifest.actions.filter((proof) => proof.applicationCoverage === "live")
        .length,
      oneAttemptVerified: manifest.actions.filter((proof) => proof.oneAttemptVerified)
        .length,
      idempotencyVerified: manifest.actions.filter((proof) => proof.idempotencyVerified)
        .length,
      correctionVerified: manifest.actions.filter((proof) => proof.correctionVerified)
        .length,
    },
    providerActivation: {
      advisory: true,
      counts: activationCounts,
      integrityIssueCount: verification.activation.issues.length,
    },
    advisorySignoffs: {
      complete: verification.signoff.complete,
      danBusiness: verification.signoff.statuses.danBusiness,
      josiahTechnical: verification.signoff.statuses.josiahTechnical,
      issueCount: verification.signoff.issues.length,
    },
    issueCount: verification.issues.length,
    gateCounts: summarizeGates(verification.issues),
  };
}

export function formatLocalV1ManifestReport(report: LocalV1ManifestReport, json = false) {
  if (json) return JSON.stringify(report, null, 2);

  const activation = PROVIDER_ACTIVATION_STATES.map(
    (state) => `${state}: ${report.providerActivation.counts[state]}`,
  ).join("; ");

  return [
    report.label,
    `Inventory state: ${report.state}; candidate stage: ${report.stage}; environment: ${report.environment}`,
    "This local command has no deployed revision or signed-in production observations, so it does not label the application Pre-V1 or V1.",
    `Commit: ${report.commit}; revision: ${report.revision}`,
    `Application workflow coverage: ${report.applicationWorkflow.covered}/${report.applicationWorkflow.required}; production Test: ${report.applicationWorkflow.productionTest}; Live: ${report.applicationWorkflow.live}`,
    `Safety checks — one-attempt: ${report.applicationWorkflow.oneAttemptVerified}; idempotency: ${report.applicationWorkflow.idempotencyVerified}; correction/rollback: ${report.applicationWorkflow.correctionVerified}`,
    `Advisory provider status — ${activation}`,
    `Advisory signoffs — Dan: ${report.advisorySignoffs.danBusiness}; Josiah: ${report.advisorySignoffs.josiahTechnical}; issues: ${report.advisorySignoffs.issueCount}`,
    `Open local evidence placeholders: ${report.issueCount}; activation-integrity issues: ${report.providerActivation.integrityIssueCount}`,
    `Evidence inventory — release identity/pins: ${report.gateCounts.releaseIdentityAndPins}; suites: ${report.gateCounts.suiteWorkflowAcceptance}; workflows: ${report.gateCounts.applicationWorkflow}; core production evidence: ${report.gateCounts.coreProductionEvidence}`,
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
