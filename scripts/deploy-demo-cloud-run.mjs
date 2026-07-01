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

// Live cheap-live target: the prod project `pmi-kc-kb-prod` running the Cloud Run service
// historically named `pmi-kc-kb-demo` (https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app). The
// legacy `pmikckb-test` demo project is retired; an explicit --project / GCP_PROJECT_ID still
// overrides this default.
const DEFAULT_PROJECT_ID = "pmi-kc-kb-prod";
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
  const errors = [];
  const publicBuildEnv = resolvePublicBuildEnv(localEnv, env, errors);
  const mergedEnv = {
    ...localEnv,
    ...env,
    ...publicBuildEnv,
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
  errors.push(...liveCostResult.errors);
  const buildEnv = readRequiredBuildEnv(mergedEnv, errors);
  const runtimeEnv = readRuntimeEnv(mergedEnv, project, region, searchLocation);
  const runtimeSecrets = readRuntimeSecrets(mergedEnv);
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
    ...(Object.keys(runtimeSecrets).length > 0
      ? [formatGcloudMapFlag("--set-secrets", runtimeSecrets)]
      : []),
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

const PUBLIC_BUILD_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

// `.env.local` is authoritative for the NEXT_PUBLIC_* Firebase build config: these values are
// inlined into the client bundle and identify the Firebase project. A stale ambient process.env
// value must not silently override the project config file, so if both are present and disagree
// we fail the deploy loudly instead of shipping a mismatched bundle.
function resolvePublicBuildEnv(localEnv, env, errors) {
  const resolved = {};

  for (const key of PUBLIC_BUILD_KEYS) {
    const local = readString(localEnv[key]);
    const ambient = readString(env[key]);

    if (local && ambient && local !== ambient) {
      errors.push(
        `${key} mismatch: .env.local has "${local}" but the process environment has "${ambient}". ` +
          `Unset or fix the ambient ${key}; it would poison the client build.`,
      );
    }

    const value = local ?? ambient;

    if (value) {
      resolved[key] = value;
    }
  }

  return resolved;
}

function readRequiredBuildEnv(env, errors) {
  const names = PUBLIC_BUILD_KEYS;
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
    // Defense in depth: pin NODE_ENV so the production demo-auth lockout does not rely on
    // `next start` setting it. lib/config/server.ts gates localDemoAuth on NODE_ENV !== "production".
    NODE_ENV: "production",
    NEXT_PUBLIC_FIREBASE_API_KEY: readString(env.NEXT_PUBLIC_FIREBASE_API_KEY),
    NEXT_PUBLIC_FIREBASE_APP_ID: readString(env.NEXT_PUBLIC_FIREBASE_APP_ID),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: readString(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: readString(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    SPACE_DRIVE_FOLDER_IDS: readString(env.SPACE_DRIVE_FOLDER_IDS) ?? "{}",
    SPACE_VERTEX_DATA_STORE_IDS: readString(env.SPACE_VERTEX_DATA_STORE_IDS) ?? "{}",
    // Forward the maintenance photo Drive folder so the prod-forced Drive image store has a target.
    // Empty when unset → the runtime falls back to SPACE_DRIVE_FOLDER_IDS["maintenance-work-order-intake"].
    MAINTENANCE_PHOTO_DRIVE_FOLDER_ID: withDefault(
      "MAINTENANCE_PHOTO_DRIVE_FOLDER_ID",
      "",
    ),
    // Dev↔prod parity (S12): forward the live-connection identifiers so the deployed service reaches
    // RentVine (read) + the renewal sheet (keyless domain-wide delegation) exactly as local does.
    // These are NON-SECRET identifiers; the RentVine key/secret are delivered separately via Secret
    // Manager (readRuntimeSecrets → --set-secrets), never inlined here. Empty when unset → the live
    // review degrades to a clear "not connected" panel instead of throwing.
    RENTVINE_API_BASE_URL: withDefault("RENTVINE_API_BASE_URL", ""),
    RENEWAL_SHEET_ID: withDefault("RENEWAL_SHEET_ID", ""),
    SHEETS_IMPERSONATE_SA: withDefault("SHEETS_IMPERSONATE_SA", ""),
    SHEETS_DWD_SUBJECT: withDefault("SHEETS_DWD_SUBJECT", ""),
    VERTEX_AI_LOCATION: region,
    VERTEX_SEARCH_LOCATION: searchLocation,
  };
}

// RentVine credentials reach Cloud Run via Secret Manager (--set-secrets), never inlined into the
// service's plaintext env config (the no-secrets rule). Wired only when RentVine is configured for
// this deploy — its non-secret base URL is present — so the demo-only deploy path is unchanged. The
// Secret Manager secret id defaults to the env var name and is overridable per-secret via
// <NAME>_SECRET_ID; the version via <NAME>_SECRET_VERSION (default "latest"). Before a redeploy the
// owner must create these secrets and grant the Cloud Run runtime SA
// roles/secretmanager.secretAccessor (see docs/client-production-cutover.md). To deploy without
// RentVine, leave RENTVINE_API_BASE_URL unset in the deploy env.
const RENTVINE_RUNTIME_SECRETS = ["RENTVINE_API_KEY", "RENTVINE_API_SECRET"];

function readRuntimeSecrets(env) {
  const bindings = {};

  if (!readString(env.RENTVINE_API_BASE_URL)) {
    return bindings;
  }

  for (const name of RENTVINE_RUNTIME_SECRETS) {
    const secretId = readString(env[`${name}_SECRET_ID`]) ?? name;
    const version = readString(env[`${name}_SECRET_VERSION`]) ?? "latest";
    bindings[name] = `${secretId}:${version}`;
  }

  return bindings;
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
