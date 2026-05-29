import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  CHEAP_LIVE_MODEL,
  readLiveCostConfig,
  readLocalEnv,
  validateLiveCostConfig,
} from "./check-live-cost.mjs";

const DEFAULT_PROJECT_ID = "pmikckb-test";
const DEFAULT_REGION = "us-central1";
const DEFAULT_SERVICE = "pmi-kc-kb-demo";
const DEFAULT_SEARCH_LOCATION = "us";

export function parseDeployArgs(argv = process.argv.slice(2)) {
  const readArg = (name) => {
    const prefix = `${name}=`;
    const arg = argv.find((entry) => entry.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };

  return {
    budgetConfirmed: argv.includes("--budget-confirmed"),
    dryRun: argv.includes("--dry-run"),
    project: readArg("--project"),
    region: readArg("--region"),
    service: readArg("--service"),
    serviceAccount: readArg("--service-account"),
    searchLocation: readArg("--search-location"),
  };
}

export function buildDemoDeployCommand({
  argv = [],
  env = process.env,
  localEnv = readLocalEnv(),
} = {}) {
  const args = parseDeployArgs(argv);
  const readEnv = (name) => env[name] ?? localEnv[name];
  const project = args.project ?? readEnv("GCP_PROJECT_ID") ?? DEFAULT_PROJECT_ID;
  const region = args.region ?? readEnv("VERTEX_AI_LOCATION") ?? DEFAULT_REGION;
  const searchLocation =
    args.searchLocation ?? readEnv("VERTEX_SEARCH_LOCATION") ?? DEFAULT_SEARCH_LOCATION;
  const service = args.service ?? DEFAULT_SERVICE;
  const mergedEnv = {
    ...localEnv,
    ...env,
    ASK_DEMO_MODE: "false",
    GCP_PROJECT_ID: project,
    GEMINI_MODEL_ANSWER: CHEAP_LIVE_MODEL,
    LOCAL_DEMO_AUTH: "false",
    VERTEX_AI_LOCATION: region,
    VERTEX_SEARCH_LOCATION: searchLocation,
  };
  const liveCostConfig = readLiveCostConfig(mergedEnv, {});
  const liveCostResult = validateLiveCostConfig(liveCostConfig);
  const errors = [...liveCostResult.errors];
  const buildEnv = readRequiredBuildEnv(mergedEnv, errors);
  const runtimeEnv = readRuntimeEnv(mergedEnv, project, region, searchLocation);
  const commandArgs = [
    "run",
    "deploy",
    service,
    "--source=.",
    `--project=${project}`,
    `--region=${region}`,
    "--allow-unauthenticated",
    "--min-instances=0",
    "--max-instances=1",
    "--memory=512Mi",
    "--cpu=1",
    "--concurrency=10",
    "--timeout=60",
    "--quiet",
    formatGcloudMapFlag("--set-build-env-vars", buildEnv),
    formatGcloudMapFlag("--set-env-vars", runtimeEnv),
  ];
  const serviceAccount =
    args.serviceAccount ?? readEnv("CLOUD_RUN_SERVICE_ACCOUNT") ?? undefined;

  if (serviceAccount) {
    commandArgs.push(`--service-account=${serviceAccount}`);
  }

  return {
    args: commandArgs,
    command: "gcloud",
    errors,
    ok: errors.length === 0,
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseDeployArgs(argv);

  if (!args.budgetConfirmed) {
    throw new Error(
      "Refusing demo deploy until --budget-confirmed is provided after the $10 project budget alert exists.",
    );
  }

  const command = buildDemoDeployCommand({ argv, env });

  if (!command.ok) {
    throw new Error(`Demo deploy preflight failed:\n- ${command.errors.join("\n- ")}`);
  }

  if (args.dryRun) {
    console.log([command.command, ...command.args].join(" "));
    return;
  }

  await run(command.command, command.args);
}

export function formatGcloudMapFlag(flagName, values) {
  const delimiter = pickDelimiter(Object.values(values));
  const entries = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  return `${flagName}=^${delimiter}^${entries.join(delimiter)}`;
}

function readRequiredBuildEnv(env, errors) {
  const names = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ];
  const values = {};

  for (const name of names) {
    const value = readString(env[name]);

    if (!value) {
      errors.push(`${name} must be set for the Cloud Run build.`);
      continue;
    }

    values[name] = value;
  }

  return values;
}

function readRuntimeEnv(env, project, region, searchLocation) {
  const withDefault = (name, value) => readString(env[name]) ?? value;

  return {
    ALLOWED_HD: withDefault("ALLOWED_HD", "pmikcmetro.com"),
    ASK_DEMO_MODE: "false",
    AUTH_SESSION_COOKIE: withDefault("AUTH_SESSION_COOKIE", "__session"),
    FIREBASE_PROJECT_ID: withDefault("FIREBASE_PROJECT_ID", project),
    FIRESTORE_DATABASE_ID: withDefault("FIRESTORE_DATABASE_ID", "(default)"),
    GCP_PROJECT_ID: project,
    GEMINI_MODEL_ANSWER: CHEAP_LIVE_MODEL,
    GEMINI_MODEL_CLASSIFY: withDefault("GEMINI_MODEL_CLASSIFY", "gemini-2.5-flash"),
    GROUNDING_CONFIDENCE_THRESHOLD: withDefault("GROUNDING_CONFIDENCE_THRESHOLD", "0.65"),
    KB_APPROVAL_LABEL: withDefault("KB_APPROVAL_LABEL", "KB Approval"),
    LOCAL_DEMO_AUTH: "false",
    NEXT_PUBLIC_FIREBASE_API_KEY: readString(env.NEXT_PUBLIC_FIREBASE_API_KEY),
    NEXT_PUBLIC_FIREBASE_APP_ID: readString(env.NEXT_PUBLIC_FIREBASE_APP_ID),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: readString(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: readString(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    SPACE_DRIVE_FOLDER_IDS: readString(env.SPACE_DRIVE_FOLDER_IDS) ?? "{}",
    SPACE_VERTEX_DATA_STORE_IDS: readString(env.SPACE_VERTEX_DATA_STORE_IDS) ?? "{}",
    VERTEX_AI_LOCATION: region,
    VERTEX_SEARCH_LOCATION: searchLocation,
  };
}

function pickDelimiter(values) {
  for (const delimiter of ["|", "~", "%", "^"]) {
    if (values.every((value) => !String(value).includes(delimiter))) {
      return delimiter;
    }
  }

  throw new Error("Environment values contain every supported gcloud delimiter.");
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}.`));
      }
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
