import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  evaluateBudgetGuard,
  readAwayModeStatus,
  readBudgetGuardConfig,
} from "./check-budget-guard.mjs";
import { readProductionPreflightEnv } from "./preflight-production-cutover.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Keep in sync with the `gcloud services enable` block in
// docs/client-production-cutover.md §2. A doc-sync unit test enforces this.
export const REQUIRED_GCP_APIS = [
  "aiplatform.googleapis.com",
  "discoveryengine.googleapis.com",
  "storage.googleapis.com",
  "firestore.googleapis.com",
  "datastore.googleapis.com",
  "firebase.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "run.googleapis.com",
  "iam.googleapis.com",
  "iamcredentials.googleapis.com",
  "logging.googleapis.com",
  "monitoring.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "serviceusage.googleapis.com",
  "cloudbilling.googleapis.com",
  "speech.googleapis.com",
];

export function parseGcpSetupArgs(argv = process.argv.slice(2)) {
  const readArg = (name) => {
    const match = argv.find((arg) => arg.startsWith(`--${name}=`));
    return match ? match.slice(name.length + 3) : undefined;
  };

  return {
    envFile: readArg("env-file"),
    json: argv.includes("--json"),
    live: argv.includes("--live"),
    project: readArg("project"),
  };
}

export function buildEnableApisCommand(projectId) {
  return `gcloud services enable ${REQUIRED_GCP_APIS.join(" ")} --project=${projectId}`;
}

export function readDefinedIndexCount(
  indexesPath = join(root, "firestore.indexes.json"),
) {
  const parsed = JSON.parse(readFileSync(indexesPath, "utf8"));
  return Array.isArray(parsed.indexes) ? parsed.indexes.length : 0;
}

export function evaluateEnabledApis(
  enabledServiceNames,
  requiredApis = REQUIRED_GCP_APIS,
) {
  const enabledSet = new Set(enabledServiceNames);

  return {
    enabled: requiredApis.filter((api) => enabledSet.has(api)),
    missing: requiredApis.filter((api) => !enabledSet.has(api)),
  };
}

export function evaluateFirestoreDatabase(database) {
  if (!database) {
    return { exists: false };
  }

  return {
    exists: true,
    location: database.locationId,
    type: database.type,
    native_mode: database.type === "FIRESTORE_NATIVE",
  };
}

export function buildGcpSetupPlan({
  projectId,
  env = {},
  awayModeActive = false,
  rulesFileExists = existsSync(join(root, "firestore.rules")),
  definedIndexCount = readDefinedIndexCount(),
} = {}) {
  const blockers = [];
  const warnings = [];
  const project = projectId?.trim() || undefined;

  if (!project) {
    blockers.push(
      "No target project id. Pass --project=<client-project-id> or set GCP_PROJECT_ID/FIREBASE_PROJECT_ID.",
    );
  }

  const placeholder = project ? `--project=${project}` : "--project=<client-project-id>";
  const projectFlag = project ?? "<client-project-id>";

  const apis = {
    required: REQUIRED_GCP_APIS,
    enable_command: buildEnableApisCommand(projectFlag),
  };

  const firebase = {
    expected_web_app: "PMI KC KB Production Web",
    expected_auth_provider: "google.com",
    setup_commands: [
      `npm run firebase:setup -- ${placeholder} --web-app-name="PMI KC KB Production Web"`,
      `npm run firebase:setup-auth -- ${placeholder} --authorized-domain=<production-host>`,
    ],
  };

  if (!rulesFileExists) {
    blockers.push("firestore.rules is missing from the repository.");
  }

  const firestore = {
    expected_database: "(default)",
    expected_location: "us-central1",
    expected_type: "FIRESTORE_NATIVE",
    rules_file_exists: rulesFileExists,
    defined_index_count: definedIndexCount,
    create_command: `gcloud firestore databases create --database='(default)' --location=us-central1 --type=firestore-native ${placeholder} --quiet`,
    deploy_rules_command: `npm exec firebase -- deploy --only firestore:rules,firestore:indexes --project ${projectFlag}`,
    seed_commands: ["npm run seed:spaces -- --dry-run", "npm run seed:spaces"],
  };

  const budgetConfig = readBudgetGuardConfig(env, {});
  const budgetResult = evaluateBudgetGuard(budgetConfig, { awayModeActive });
  const budget = {
    away_mode_active: awayModeActive,
    cap_usd: budgetConfig.budgetCapUsd,
    posture: budgetConfig.askDemoMode ? "demo" : "live",
    ok: budgetResult.ok,
    errors: budgetResult.errors,
    warnings: budgetResult.warnings,
  };

  blockers.push(...budgetResult.errors);
  warnings.push(...budgetResult.warnings);

  return {
    project: { id: project ?? null },
    apis,
    firebase,
    firestore,
    budget,
    blockers,
    warnings,
  };
}

export function buildReadiness({ blockers, warnings }) {
  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
  };
}

// Live read-only inspection. Each section degrades to a structured blocker instead of
// throwing, so the report stays usable without credentials. Never mutates anything.
export async function fetchLiveState(projectId, { authFactory } = {}) {
  const state = {
    credentials_available: false,
    enabled_services: null,
    firestore_database: null,
    firebase_project: null,
    errors: [],
  };

  let client;

  try {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = authFactory
      ? authFactory()
      : new GoogleAuth({
          scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        });
    client = await auth.getClient();
    state.credentials_available = true;
  } catch (error) {
    state.errors.push(
      `Application Default Credentials unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return state;
  }

  const read = async (label, url, apply) => {
    try {
      const response = await client.request({ url });
      apply(response.data);
    } catch (error) {
      state.errors.push(
        `${label} read failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  await read(
    "Service Usage",
    `https://serviceusage.googleapis.com/v1/projects/${projectId}/services?filter=state:ENABLED&pageSize=200`,
    (data) => {
      state.enabled_services = (data.services ?? []).map((service) =>
        service.name?.split("/").pop(),
      );
    },
  );

  await read(
    "Firestore",
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`,
    (data) => {
      state.firestore_database = data;
    },
  );

  await read(
    "Firebase",
    `https://firebase.googleapis.com/v1beta1/projects/${projectId}`,
    (data) => {
      state.firebase_project = data;
    },
  );

  return state;
}

export function applyLiveState(plan, liveState) {
  const blockers = [...plan.blockers];
  const warnings = [...plan.warnings];
  const live = {
    credentials_available: liveState.credentials_available,
    errors: liveState.errors,
  };

  if (!liveState.credentials_available) {
    blockers.push(
      "Live mode requested but Application Default Credentials are unavailable. Run `gcloud auth application-default login` (owner machine) and rerun.",
    );
    return { ...plan, live, blockers, warnings };
  }

  blockers.push(...liveState.errors);

  if (liveState.enabled_services) {
    const apiCheck = evaluateEnabledApis(liveState.enabled_services);
    live.apis = apiCheck;

    if (apiCheck.missing.length > 0) {
      blockers.push(
        `Missing required APIs: ${apiCheck.missing.join(", ")}. Run the printed enable command.`,
      );
    }
  }

  const databaseCheck = evaluateFirestoreDatabase(liveState.firestore_database);
  live.firestore = databaseCheck;

  if (liveState.firestore_database && !databaseCheck.native_mode) {
    blockers.push("Firestore database exists but is not in Native mode.");
  }

  if (liveState.firebase_project) {
    live.firebase = {
      project_id: liveState.firebase_project.projectId,
      display_name: liveState.firebase_project.displayName,
      state: liveState.firebase_project.state,
    };
  }

  return { ...plan, live, blockers, warnings };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseGcpSetupArgs(argv);
  const mergedEnv = readProductionPreflightEnv({ env, envFile: args.envFile });
  const projectId =
    args.project || mergedEnv.GCP_PROJECT_ID || mergedEnv.FIREBASE_PROJECT_ID;
  const awayModeActive = readAwayModeStatus() === "ACTIVE";

  let report = buildGcpSetupPlan({ projectId, env: mergedEnv, awayModeActive });

  if (args.live) {
    if (report.project.id) {
      const liveState = await fetchLiveState(report.project.id);
      report = applyLiveState(report, liveState);
    }
  } else {
    report.warnings = [
      ...report.warnings,
      "Plan mode only: live GCP/Firebase state was not verified. Rerun with --live and Application Default Credentials for read-only verification.",
    ];
  }

  const readiness = buildReadiness(report);
  const output = {
    mode: args.live ? "live-read-only" : "plan",
    ...report,
    readiness,
    next_steps: readiness.ok
      ? [
          "Run the printed API enable, Firebase setup, and Firestore create/deploy commands in order.",
          "Then run `npm run preflight:production -- --env-file=.env.production.local` before any deploy.",
        ]
      : ["Resolve the readiness blockers, then rerun this preflight."],
  };

  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    printHumanReport(output);
  }

  if (!readiness.ok) {
    process.exitCode = 1;
  }

  return output;
}

function printHumanReport(output) {
  console.log(
    `GCP setup preflight (${output.mode}) for project: ${output.project.id ?? "<unset>"}`,
  );
  console.log(`- Required APIs: ${output.apis.required.length}`);
  console.log(`- Enable command: ${output.apis.enable_command}`);

  for (const command of output.firebase.setup_commands) {
    console.log(`- Firebase: ${command}`);
  }

  console.log(`- Firestore create: ${output.firestore.create_command}`);
  console.log(
    `- Firestore rules/indexes deploy: ${output.firestore.deploy_rules_command}`,
  );
  console.log(
    `- Rules file present: ${output.firestore.rules_file_exists}; defined indexes: ${output.firestore.defined_index_count}`,
  );
  console.log(
    `- Budget posture: ${output.budget.posture}; away mode: ${output.budget.away_mode_active ? "active" : "inactive"}; cap: $${output.budget.cap_usd}`,
  );

  if (output.live) {
    console.log(`- Live credentials available: ${output.live.credentials_available}`);

    if (output.live.apis) {
      console.log(
        `- Live APIs: ${output.live.apis.enabled.length} enabled, ${output.live.apis.missing.length} missing`,
      );
    }

    if (output.live.firestore) {
      console.log(
        `- Live Firestore: ${output.live.firestore.exists ? `exists (${output.live.firestore.location}, ${output.live.firestore.type})` : "not found"}`,
      );
    }
  }

  for (const warning of output.readiness.warnings) {
    console.warn(`WARNING: ${warning}`);
  }

  if (output.readiness.ok) {
    console.log("GCP setup preflight passed with no blockers.");
  } else {
    for (const blocker of output.readiness.blockers) {
      console.error(`BLOCKER: ${blocker}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
