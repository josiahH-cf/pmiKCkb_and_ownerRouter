import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCutoverReport } from "./build-cutover-report.mjs";

// Zero-cost rehearsal of the production cutover-readiness chain against synthetic golden
// fixtures. It runs the SAME `buildCutoverReport` the real `npm run cutover:report` runs — only
// the inputs are fake — so a green run proves the cutover gates compute the expected verdicts
// before any client GCP project or approved source exists. Pure computation: no gcloud, no
// network, no Application Default Credentials, no spend against the $10 cap. See
// docs/client-production-cutover.md ("Dry-run readiness rehearsal").

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// The production preflight REQUIRES KB_APPROVAL_NOTIFICATIONS_ENABLED=true, but the budget guard
// inside the report evaluates without --allow-notifications, so it always emits this one blocker.
// It is the documented, expected residual: live Gmail notification sends are externally visible
// and stay approval-gated; a dry rehearsal intentionally does not clear them. Every OTHER gate
// must be green. Keep this string byte-identical to scripts/check-budget-guard.mjs (prefixed
// `gcp: ` by scripts/build-cutover-report.mjs); a unit test pins the interaction.
export const EXPECTED_RESIDUAL_BLOCKER =
  "gcp: KB approval Gmail notifications are enabled (KB_APPROVAL_NOTIFICATIONS_ENABLED=true). " +
  "Gmail send is approval-gated; pass --allow-notifications only after explicit approval.";

export const GOLDEN_ENV_FILE = join(
  root,
  "tests/fixtures/cutover/golden-production.env.fixture",
);
export const GOLDEN_MANIFEST_FILE = join(
  root,
  "tests/fixtures/cutover/golden-production-source-manifest.json",
);

// Absolute fixture paths keep the rehearsal correct regardless of CWD: readProductionPreflightEnv
// resolves the env file against the repo root, while readSourceManifest resolves the manifest
// against process.cwd(); passing absolutes satisfies both.
export function runCutoverDryRun({
  envFile = GOLDEN_ENV_FILE,
  manifest = GOLDEN_MANIFEST_FILE,
  project = "sample-kb-fixture-prod",
  location = "us",
} = {}) {
  const report = buildCutoverReport({
    argv: [
      `--env-file=${envFile}`,
      `--manifest=${manifest}`,
      `--project=${project}`,
      `--location=${location}`,
    ],
    env: {},
    awayModeActive: false,
  });

  const residualBlockers = report.readiness.blockers.filter(
    (blocker) => blocker !== EXPECTED_RESIDUAL_BLOCKER,
  );

  const gates = {
    productionEnv: report.production_env.ok,
    corpus: report.corpus.evaluated && report.corpus.readiness.ok,
    deploy: report.deploy.ok,
    onlyExpectedResidual:
      residualBlockers.length === 0 &&
      report.readiness.blockers.includes(EXPECTED_RESIDUAL_BLOCKER),
  };

  return {
    ok: Object.values(gates).every(Boolean),
    gates,
    residualBlockers,
    report,
  };
}

function formatGate(label, ok) {
  return `  [${ok ? "ok" : "FAIL"}] ${label}`;
}

export async function main(argv = process.argv.slice(2)) {
  const result = runCutoverDryRun();
  const { report } = result;
  const corpusPlan = {
    upload_commands: report.corpus.upload_commands?.length ?? 0,
    import_commands: report.corpus.import_commands?.length ?? 0,
    seed_commands: report.corpus.seed_commands?.length ?? 0,
  };

  if (argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          ok: result.ok,
          gates: result.gates,
          residual_blockers: result.residualBlockers,
          expected_residual_blocker: EXPECTED_RESIDUAL_BLOCKER,
          corpus_plan: corpusPlan,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("Cutover dry-run rehearsal (golden fixtures, no cloud cost)");
    console.log(formatGate("production env preflight", result.gates.productionEnv));
    console.log(formatGate("source corpus readiness", result.gates.corpus));
    console.log(formatGate("deploy command preview", result.gates.deploy));
    console.log(
      formatGate(
        "GCP infra ready (only the approval-gated notification send remains)",
        result.gates.onlyExpectedResidual,
      ),
    );
    console.log(
      `  corpus plan: ${corpusPlan.upload_commands} upload / ${corpusPlan.import_commands} import / ${corpusPlan.seed_commands} seed commands`,
    );

    if (result.ok) {
      console.log(
        "Dry-run passed: every cutover gate is green except the expected, approval-gated live notification send.",
      );
    } else {
      console.error("Dry-run FAILED. Unexpected blockers:");
      for (const blocker of result.residualBlockers) {
        console.error(`- ${blocker}`);
      }
      for (const error of report.production_env.errors) {
        console.error(`- env: ${error}`);
      }
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
  }

  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
