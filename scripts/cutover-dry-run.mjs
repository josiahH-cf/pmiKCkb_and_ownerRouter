import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCutoverReport, DEFAULT_CUTOVER_SERVICE } from "./build-cutover-report.mjs";

// Zero-cost rehearsal of the production cutover-readiness chain against synthetic golden
// fixtures. It runs the SAME `buildCutoverReport` the real `npm run cutover:report` runs — only
// the inputs are fake — so a green run proves the cutover gates compute the expected verdicts
// before any client GCP project or approved source exists. Pure computation: no gcloud, no
// network, no Application Default Credentials, no spend against the $10 cap. See
// docs/client-production-cutover.md ("Dry-run readiness rehearsal").

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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
  priorRevision = `${DEFAULT_CUTOVER_SERVICE}-00001-prior`,
} = {}) {
  const report = buildCutoverReport({
    argv: [
      `--env-file=${envFile}`,
      `--manifest=${manifest}`,
      `--project=${project}`,
      `--location=${location}`,
      `--prior-revision=${priorRevision}`,
    ],
    env: {},
    awayModeActive: false,
  });

  const gates = {
    productionEnv: report.production_env.ok,
    corpus: report.corpus.evaluated && report.corpus.readiness.ok,
    deploy: report.deploy.ok,
    rollback: report.rollback_ready === true,
    noBlockers: report.readiness.blockers.length === 0,
  };

  return {
    ok: Object.values(gates).every(Boolean),
    gates,
    blockers: report.readiness.blockers,
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
          blockers: result.blockers,
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
    console.log(formatGate("captured-revision rollback plan", result.gates.rollback));
    console.log(formatGate("zero readiness blockers", result.gates.noBlockers));
    console.log(
      `  corpus plan: ${corpusPlan.upload_commands} upload / ${corpusPlan.import_commands} import / ${corpusPlan.seed_commands} seed commands`,
    );

    if (result.ok) {
      console.log(
        "Dry-run passed: every local cutover gate is green; notification delivery remains disabled.",
      );
    } else {
      console.error("Dry-run FAILED. Blockers:");
      for (const blocker of result.blockers) {
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
