import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    allowMultipleSpaces: argv.includes("--allow-multiple-spaces"),
    budgetConfirmed: argv.includes("--budget-confirmed"),
    dryRun: argv.includes("--dry-run"),
    project: readArg("--project"),
    region: readArg("--region"),
    service: readArg("--service"),
    serviceAccount: readArg("--service-account"),
    searchLocation: readArg("--search-location"),
    skipAllowUnauthenticated:
      argv.includes("--skip-allow-unauthenticated") ||
      argv.includes("--no-allow-unauthenticated"),
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
  const liveCostResult = validateLiveCostConfig(liveCostConfig, {
    allowMultipleSpaces: args.allowMultipleSpaces,
  });
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

  if (!args.skipAllowUnauthenticated) {
    commandArgs.push("--allow-unauthenticated");
  }

  return {
    args: commandArgs,
    command: resolveGcloudCommand(env),
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
  const entries = Object.entries(values).map(
    ([key, value]) => `${key}=${escapeGcloudMapValue(value)}`,
  );
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
    APP_BASE_URL: withDefault("APP_BASE_URL", ""),
    ASK_DEMO_MODE: "false",
    AUTH_SESSION_COOKIE: withDefault("AUTH_SESSION_COOKIE", "__session"),
    FIREBASE_PROJECT_ID: withDefault("FIREBASE_PROJECT_ID", project),
    FIRESTORE_DATABASE_ID: withDefault("FIRESTORE_DATABASE_ID", "(default)"),
    GCP_PROJECT_ID: project,
    GEMINI_MODEL_ANSWER: CHEAP_LIVE_MODEL,
    GEMINI_MODEL_CLASSIFY: withDefault("GEMINI_MODEL_CLASSIFY", "gemini-2.5-flash"),
    GROUNDING_CONFIDENCE_THRESHOLD: withDefault("GROUNDING_CONFIDENCE_THRESHOLD", "0.65"),
    KB_APPROVAL_LABEL: withDefault("KB_APPROVAL_LABEL", "KB Approval"),
    KB_APPROVAL_NOTIFICATIONS_ENABLED: withDefault(
      "KB_APPROVAL_NOTIFICATIONS_ENABLED",
      "false",
    ),
    KB_APPROVAL_RECIPIENTS: withDefault("KB_APPROVAL_RECIPIENTS", ""),
    KB_APPROVAL_SENDER: withDefault("KB_APPROVAL_SENDER", ""),
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
  for (const delimiter of ["~", "|", "%", "^"]) {
    if (values.every((value) => !String(value).includes(delimiter))) {
      return delimiter;
    }
  }

  throw new Error("Environment values contain every supported gcloud delimiter.");
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function escapeGcloudMapValue(value) {
  return String(value).replace(/"/g, '\\"');
}

function resolveGcloudCommand(env) {
  return (
    readString(env.GCLOUD_BIN) ?? (process.platform === "win32" ? "gcloud.ps1" : "gcloud")
  );
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const cleanup = [];
    const child =
      process.platform === "win32"
        ? spawnPowerShellCommand(command, args, cleanup)
        : spawn(command, args, { stdio: "inherit" });

    child.on("error", reject);
    child.on("exit", (code) => {
      for (const path of cleanup) {
        rmSync(path, { force: true, recursive: true });
      }

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}.`));
      }
    });
  });
}

function spawnPowerShellCommand(command, args, cleanup) {
  const dir = mkdtempSync(join(tmpdir(), "pmi-kc-kb-deploy-"));
  const scriptPath = join(dir, "run-gcloud.ps1");
  cleanup.push(dir);
  writeFileSync(
    scriptPath,
    [
      "$ErrorActionPreference = 'Stop'",
      "$gcloudArgs = @(",
      ...args.map((arg) => `  '${escapePowerShell(arg)}'`),
      ")",
      `& '${escapePowerShell(command)}' @gcloudArgs`,
      "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
      "",
    ].join("\n"),
    "utf8",
  );

  return spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    { stdio: "inherit" },
  );
}

function escapePowerShell(value) {
  return String(value).replace(/'/g, "''");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
