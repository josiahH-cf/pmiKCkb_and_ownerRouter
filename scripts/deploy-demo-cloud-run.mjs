import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CHEAP_LIVE_MODEL,
  readLiveCostConfig,
  readLocalEnv,
  validateLiveCostConfig,
} from "./check-live-cost.mjs";
import { validateProductionCutoverConfig } from "./preflight-production-cutover.mjs";
import { resolveMaintenanceIntakeSecretBindings } from "./runtime-secret-bindings.mjs";

// Live cheap-live target: the prod project `pmi-kc-kb-prod` running the Cloud Run service
// historically named `pmi-kc-kb-demo` (https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app). The
// legacy `pmikckb-test` demo project is retired; an explicit --project / GCP_PROJECT_ID still
// overrides this default.
const DEFAULT_PROJECT_ID = "pmi-kc-kb-prod";
const DEFAULT_REGION = "us-central1";
const DEFAULT_SERVICE = "pmi-kc-kb-demo";
const DEFAULT_SEARCH_LOCATION = "us";
const DEFAULT_PRODUCTION_ENV_FILE = ".env.production.local";
const CLOUD_RUN_MAX_REVISION_NAME_LENGTH = 63;
const CLOUD_RUN_NAME_PATTERN = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function createDeployRevisionSuffix({
  nowMs = Date.now(),
  entropy = randomBytes(6).toString("hex"),
} = {}) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error("Revision timestamp must be a non-negative safe integer.");
  }
  if (!/^[0-9a-f]{12}$/i.test(entropy)) {
    throw new Error("Revision entropy must contain exactly 12 hexadecimal characters.");
  }

  // The timestamp makes the suffix operationally sortable; 48 random bits prevent two deploy
  // invocations in the same millisecond from silently targeting the same revision.
  return `r${nowMs.toString(36)}-${entropy.toLowerCase()}`;
}

function buildRevisionIdentity(service, revisionSuffix, errors) {
  if (!CLOUD_RUN_NAME_PATTERN.test(service)) {
    errors.push(
      "Cloud Run service must use lowercase letters, digits, and hyphens, start with a letter, and end with a letter or digit.",
    );
  }
  if (!CLOUD_RUN_NAME_PATTERN.test(revisionSuffix)) {
    errors.push("Cloud Run revision suffix is invalid.");
  }

  const revision = `${service}-${revisionSuffix}`;
  if (revision.length > CLOUD_RUN_MAX_REVISION_NAME_LENGTH) {
    errors.push(
      `Cloud Run revision name must be at most ${CLOUD_RUN_MAX_REVISION_NAME_LENGTH} characters; got ${revision.length}.`,
    );
  }

  return { revision, revisionSuffix };
}

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
    envFile: readArg("--env-file") ?? DEFAULT_PRODUCTION_ENV_FILE,
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
  localEnv,
  revisionSuffix = createDeployRevisionSuffix(),
} = {}) {
  const args = parseDeployArgs(argv);
  const errors = [];
  const fileBacked = localEnv === undefined;
  const reviewedEnv = localEnv ?? readProductionDeployEnv(args.envFile, errors);
  const readEnv = (name) =>
    fileBacked ? reviewedEnv[name] : (env[name] ?? reviewedEnv[name]);
  const project = args.project ?? readEnv("GCP_PROJECT_ID") ?? DEFAULT_PROJECT_ID;
  const region = args.region ?? readEnv("VERTEX_AI_LOCATION") ?? DEFAULT_REGION;
  const searchLocation =
    args.searchLocation ?? readEnv("VERTEX_SEARCH_LOCATION") ?? DEFAULT_SEARCH_LOCATION;
  const service = args.service ?? DEFAULT_SERVICE;
  const revisionIdentity = buildRevisionIdentity(service, revisionSuffix, errors);
  const publicBuildEnv = resolvePublicBuildEnv(reviewedEnv, env, errors, {
    allowAmbientFallback: !fileBacked,
  });
  const mergedEnv = {
    ...(fileBacked ? {} : env),
    ...reviewedEnv,
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
  const runtimeSecrets = readRuntimeSecrets(mergedEnv, errors);
  const serviceAccount =
    args.serviceAccount ?? readEnv("CLOUD_RUN_SERVICE_ACCOUNT") ?? undefined;
  errors.push(
    ...validateProductionCutoverConfig(
      {
        ...mergedEnv,
        ...runtimeEnv,
        CLOUD_RUN_SERVICE_ACCOUNT: serviceAccount,
      },
      { maintenanceIntakeSource: "deploy" },
    ).errors,
  );
  const commandArgs = [
    "run",
    "deploy",
    service,
    "--source=.",
    `--project=${project}`,
    `--region=${region}`,
    `--revision-suffix=${revisionIdentity.revisionSuffix}`,
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
      : ["--clear-secrets"]),
  ];
  if (serviceAccount) {
    commandArgs.push(`--service-account=${serviceAccount}`);
  }

  if (!args.skipAllowUnauthenticated) {
    // This managed project intentionally exposes the sign-in shell by disabling Cloud Run's
    // invoker IAM check. That is the supported org-policy-safe path when an allUsers IAM binding
    // is unavailable; application authentication and authorization still protect every route.
    commandArgs.push("--no-invoker-iam-check");
  }

  const uniqueErrors = [...new Set(errors)];
  return {
    args: commandArgs,
    command: resolveGcloudCommand(env),
    envFile: args.envFile,
    errors: uniqueErrors,
    ok: uniqueErrors.length === 0,
    ...revisionIdentity,
  };
}

export function buildRevisionTrafficCommand({
  argv = [],
  env = process.env,
  localEnv,
  revision,
} = {}) {
  const args = parseDeployArgs(argv);
  const reviewedEnv = localEnv ?? readLocalEnv(resolve(root, args.envFile));
  const readEnv = (name) =>
    localEnv === undefined ? reviewedEnv[name] : (env[name] ?? reviewedEnv[name]);
  const project = args.project ?? readEnv("GCP_PROJECT_ID") ?? DEFAULT_PROJECT_ID;
  const region = args.region ?? readEnv("VERTEX_AI_LOCATION") ?? DEFAULT_REGION;
  const service = args.service ?? DEFAULT_SERVICE;
  if (
    typeof revision !== "string" ||
    !CLOUD_RUN_NAME_PATTERN.test(revision) ||
    revision.length > CLOUD_RUN_MAX_REVISION_NAME_LENGTH ||
    !revision.startsWith(`${service}-`)
  ) {
    throw new Error("Exact Cloud Run revision does not match the deploy target service.");
  }

  return {
    args: [
      "run",
      "services",
      "update-traffic",
      service,
      `--project=${project}`,
      `--region=${region}`,
      `--to-revisions=${revision}=100`,
      "--quiet",
    ],
    command: resolveGcloudCommand(env),
  };
}

export async function executeDemoDeployPlan(
  deployCommand,
  revisionTrafficCommand,
  runCommand = run,
) {
  await runCommand(deployCommand.command, deployCommand.args);
  await runCommand(revisionTrafficCommand.command, revisionTrafficCommand.args);
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

  // A rollback can leave traffic pinned to a named revision. Promote only the collision-resistant
  // revision created by this invocation; a floating LATEST target could race another deployment.
  // This traffic-only command does not change the service's invoker/IAM configuration.
  const revisionTrafficCommand = buildRevisionTrafficCommand({
    argv,
    env,
    revision: command.revision,
  });

  if (args.dryRun) {
    console.log([command.command, ...command.args].join(" "));
    console.log(
      [revisionTrafficCommand.command, ...revisionTrafficCommand.args].join(" "),
    );
    return;
  }

  await executeDemoDeployPlan(command, revisionTrafficCommand);
}

function readProductionDeployEnv(envFile, errors) {
  const envPath = resolve(root, envFile);
  if (!existsSync(envPath)) {
    errors.push(
      `${envFile}: reviewed production deploy env file not found; run npm run prepare:production-env or pass --env-file=<reviewed-file>.`,
    );
    return {};
  }

  return readLocalEnv(envPath);
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

// The reviewed deploy env is authoritative for NEXT_PUBLIC_* Firebase build config: these values are
// inlined into the client bundle and identify the Firebase project. A stale ambient process.env value
// must not silently override the reviewed file, so if both are present and disagree we fail loudly.
function resolvePublicBuildEnv(
  reviewedEnv,
  env,
  errors,
  { allowAmbientFallback = true } = {},
) {
  const resolved = {};

  for (const key of PUBLIC_BUILD_KEYS) {
    const local = readString(reviewedEnv[key]);
    const ambient = readString(env[key]);

    if (local && ambient && local !== ambient) {
      errors.push(
        `${key} mismatch: the reviewed deploy env has "${local}" but the process environment has "${ambient}". ` +
          `Unset or fix the ambient ${key}; it would poison the client build.`,
      );
    }

    const value = local ?? (allowAmbientFallback ? ambient : undefined);

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
    CONSOLE_TEST_DEPLOYMENT_NAME: "",
    // This wrapper targets the existing Production service. Force the server-owned descriptor
    // instead of inheriting a Demo-valued .env.local or falling back to the legacy NODE_ENV bridge.
    DATA_CONTEXT: "live",
    ENVIRONMENT_KIND: "production",
    FIREBASE_PROJECT_ID: withDefault("FIREBASE_PROJECT_ID", project),
    FIRESTORE_DATABASE_ID: withDefault("FIRESTORE_DATABASE_ID", "(default)"),
    GCP_PROJECT_ID: project,
    GEMINI_MODEL_ANSWER: CHEAP_LIVE_MODEL,
    GEMINI_MODEL_CLASSIFY: withDefault("GEMINI_MODEL_CLASSIFY", "gemini-2.5-flash"),
    GMAIL_DWD_SA: withDefault("GMAIL_DWD_SA", ""),
    GMAIL_PUBSUB_AUDIENCE: withDefault("GMAIL_PUBSUB_AUDIENCE", ""),
    GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT: withDefault(
      "GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT",
      "",
    ),
    GMAIL_PUBSUB_TOPIC: withDefault("GMAIL_PUBSUB_TOPIC", ""),
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
    // Optional D31 override. Empty is intentional: the runtime then reuses the dedicated maintenance
    // photo folder, while an explicit value survives this wrapper's replacing --set-env-vars map.
    RENEWAL_COMP_DRIVE_FOLDER_ID: withDefault("RENEWAL_COMP_DRIVE_FOLDER_ID", ""),
    // Optional AC-S53-13 boundary. Empty means subject-owned My Drive only; a configured value is the
    // one exact Shared Drive id the runtime may accept.
    RENEWAL_COMP_SHARED_DRIVE_ID: withDefault("RENEWAL_COMP_SHARED_DRIVE_ID", ""),
    // S36 remains owner/IAM/cost-gated. Forward the reviewed runtime value, but default closed so a
    // missing variable can never turn provisioning on.
    SPACE_PROVISIONING_ENABLED: withDefault("SPACE_PROVISIONING_ENABLED", "false"),
    // Dev↔prod parity (S12): forward the live-connection identifiers so the deployed service reaches
    // RentVine (read) + the renewal sheet (keyless domain-wide delegation) exactly as local does.
    // These are NON-SECRET identifiers; the RentVine key/secret are delivered separately via Secret
    // Manager (readRuntimeSecrets → --set-secrets), never inlined here. Empty when unset → the live
    // review degrades to a clear "not connected" panel instead of throwing.
    RENTVINE_API_BASE_URL: withDefault("RENTVINE_API_BASE_URL", ""),
    RENEWAL_SHEET_ID: withDefault("RENEWAL_SHEET_ID", ""),
    SHEETS_IMPERSONATE_SA: withDefault("SHEETS_IMPERSONATE_SA", ""),
    SHEETS_DWD_SUBJECT: withDefault("SHEETS_DWD_SUBJECT", ""),
    // Phase C: the live append-only Sheet write-back stays OFF unless this is explicitly "true" (and the
    // SA's domain-wide-delegation grant carries the read/WRITE Sheets scope). Default off → deploying the
    // code writes nothing to the operational sheet until an admin turns it on.
    LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED: withDefault(
      "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED",
      "false",
    ),
    VERTEX_AI_LOCATION: region,
    VERTEX_SEARCH_LOCATION: searchLocation,
  };
}

// Runtime credentials reach Cloud Run via one complete --set-secrets map, never through plaintext
// --set-env-vars. RentVine uses its base URL as the activation signal and defaults ids to the env names.
// Maintenance intake uses an explicit paired *_SECRET_ID signal because token-only activation is unsafe.
// When no group is configured the command emits --clear-secrets so stale bindings cannot survive.
// Before a redeploy the owner creates the referenced secrets and grants the Cloud Run runtime SA
// roles/secretmanager.secretAccessor (see docs/client-production-cutover.md).
const RENTVINE_RUNTIME_SECRETS = ["RENTVINE_API_KEY", "RENTVINE_API_SECRET"];

function readRuntimeSecrets(env, errors) {
  const bindings = {};

  if (readString(env.RENTVINE_API_BASE_URL)) {
    for (const name of RENTVINE_RUNTIME_SECRETS) {
      const secretId = readString(env[`${name}_SECRET_ID`]) ?? name;
      const version = readString(env[`${name}_SECRET_VERSION`]) ?? "latest";
      bindings[name] = `${secretId}:${version}`;
    }
  }

  const intake = resolveMaintenanceIntakeSecretBindings(env);
  errors.push(...intake.errors);
  Object.assign(bindings, intake.bindings);

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
