import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEMO_PROJECT_IDS = new Set(["pmikckb-test", "pmikckb-test-8f927"]);
const DEMO_VALUE_PATTERNS = [
  "pmikckb-test",
  "pmi-kc-kb-demo",
  "lease-renewals-686407",
  "800237451321",
];
const PLACEHOLDER_VALUE_PATTERN = /<[^>]+>|\b(change-me|changeme|replace-me|todo)\b/i;
const REQUIRED_FIREBASE_PUBLIC = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

export function parseProductionPreflightArgs(argv = process.argv.slice(2)) {
  const readArg = (name) => {
    const prefix = `${name}=`;
    const arg = argv.find((entry) => entry.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };

  return {
    envFile: readArg("--env-file"),
    json: argv.includes("--json"),
  };
}

export function readProductionPreflightEnv({ env = process.env, envFile } = {}) {
  const fileEnv = envFile ? readEnvFile(resolve(root, envFile)) : readEnvFileIfPresent();

  return envFile
    ? {
        ...env,
        ...fileEnv,
      }
    : {
        ...fileEnv,
        ...env,
      };
}

export function validateProductionCutoverConfig(env) {
  const errors = [];
  const warnings = [];
  const gcpProjectId = readString(env.GCP_PROJECT_ID);
  const firebaseProjectId = readString(env.FIREBASE_PROJECT_ID);
  const firebaseAuthDomain = readString(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
  const firebasePublicProjectId = readString(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const appBaseUrl = readString(env.APP_BASE_URL);
  const sourceTargets = readJsonMapSafe(
    env.SPACE_DRIVE_FOLDER_IDS,
    "SPACE_DRIVE_FOLDER_IDS",
    errors,
  );
  const dataStores = readJsonMapSafe(
    env.SPACE_VERTEX_DATA_STORE_IDS,
    "SPACE_VERTEX_DATA_STORE_IDS",
    errors,
  );

  requireValue(gcpProjectId, "GCP_PROJECT_ID", errors);
  requireValue(firebaseProjectId, "FIREBASE_PROJECT_ID", errors);
  requireValue(appBaseUrl, "APP_BASE_URL", errors);

  for (const [label, value] of [
    ["GCP_PROJECT_ID", gcpProjectId],
    ["FIREBASE_PROJECT_ID", firebaseProjectId],
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", firebasePublicProjectId],
  ]) {
    if (value && DEMO_PROJECT_IDS.has(value)) {
      errors.push(`${label} must not point at demo project ${value}.`);
    }

    assertNoPlaceholderString(label, value, errors);
  }

  if (readBoolean(env.ASK_DEMO_MODE, true)) {
    errors.push("ASK_DEMO_MODE must be false for client-production.");
  }

  if (readBoolean(env.LOCAL_DEMO_AUTH, false)) {
    errors.push("LOCAL_DEMO_AUTH must be false for client-production.");
  }

  if ((readString(env.ALLOWED_HD) ?? "").toLowerCase() !== "pmikcmetro.com") {
    errors.push("ALLOWED_HD must be pmikcmetro.com for client-production.");
  }

  if (appBaseUrl && isLocalUrl(appBaseUrl)) {
    errors.push("APP_BASE_URL must be the deployed production URL, not localhost.");
  }

  if (appBaseUrl) {
    requireHttpsUrl(appBaseUrl, "APP_BASE_URL", errors);
  }

  for (const name of REQUIRED_FIREBASE_PUBLIC) {
    const value = readString(env[name]);
    requireValue(value, name, errors);
    assertNoPlaceholderString(name, value, errors);
  }

  requireMatchingProjectIds(
    {
      firebaseProjectId,
      firebasePublicProjectId,
      gcpProjectId,
    },
    errors,
  );
  assertNoDemoString("APP_BASE_URL", appBaseUrl, errors);
  assertNoPlaceholderString("APP_BASE_URL", appBaseUrl, errors);
  assertNoDemoString("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", firebaseAuthDomain, errors);
  assertNoDemoString(
    "CLOUD_RUN_SERVICE_ACCOUNT",
    readString(env.CLOUD_RUN_SERVICE_ACCOUNT),
    errors,
  );
  assertNoPlaceholderString(
    "CLOUD_RUN_SERVICE_ACCOUNT",
    readString(env.CLOUD_RUN_SERVICE_ACCOUNT),
    errors,
  );
  assertConfiguredMaps(sourceTargets, dataStores, errors);
  assertNoDemoValues("SPACE_DRIVE_FOLDER_IDS", sourceTargets, errors);
  assertNoDemoValues("SPACE_VERTEX_DATA_STORE_IDS", dataStores, errors);
  assertNoPlaceholderValues("SPACE_DRIVE_FOLDER_IDS", sourceTargets, errors);
  assertNoPlaceholderValues("SPACE_VERTEX_DATA_STORE_IDS", dataStores, errors);

  if (!readBoolean(env.KB_APPROVAL_NOTIFICATIONS_ENABLED, false)) {
    errors.push("KB_APPROVAL_NOTIFICATIONS_ENABLED must be true for client-production.");
  }

  const approvalSender = readString(env.KB_APPROVAL_SENDER);
  const approvalRecipients = readString(env.KB_APPROVAL_RECIPIENTS);
  requireValue(approvalSender, "KB_APPROVAL_SENDER", errors);
  requireValue(approvalRecipients, "KB_APPROVAL_RECIPIENTS", errors);
  assertNoPlaceholderString("KB_APPROVAL_SENDER", approvalSender, errors);
  assertNoPlaceholderString("KB_APPROVAL_RECIPIENTS", approvalRecipients, errors);
  assertPmikcmetroEmailList("KB_APPROVAL_SENDER", approvalSender, errors);
  assertPmikcmetroEmailList("KB_APPROVAL_RECIPIENTS", approvalRecipients, errors);

  if (!readString(env.CLOUD_RUN_SERVICE_ACCOUNT)) {
    warnings.push(
      "CLOUD_RUN_SERVICE_ACCOUNT is not set; deploy will use the project default compute identity unless --service-account is provided.",
    );
  }

  return {
    errors,
    ok: errors.length === 0,
    warnings,
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseProductionPreflightArgs(argv);
  const mergedEnv = readProductionPreflightEnv({ env, envFile: args.envFile });
  const result = validateProductionCutoverConfig(mergedEnv);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning}`);
    }

    if (result.ok) {
      console.log("Production cutover preflight passed.");
    } else {
      console.error("Production cutover preflight failed:");
      for (const error of result.errors) {
        console.error(`- ${error}`);
      }
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

function assertConfiguredMaps(sourceTargets, dataStores, errors) {
  const sourceSpaceIds = configuredKeys(sourceTargets);
  const dataStoreSpaceIds = configuredKeys(dataStores);

  if (sourceSpaceIds.length === 0) {
    errors.push(
      "SPACE_DRIVE_FOLDER_IDS must contain at least one production source target.",
    );
  }

  if (dataStoreSpaceIds.length === 0) {
    errors.push(
      "SPACE_VERTEX_DATA_STORE_IDS must contain at least one production Agent Search data store.",
    );
  }

  for (const spaceId of sourceSpaceIds) {
    if (!dataStores[spaceId]?.trim()) {
      errors.push(`Missing production Agent Search data store for Space "${spaceId}".`);
    }
  }

  for (const spaceId of dataStoreSpaceIds) {
    if (!sourceTargets[spaceId]?.trim()) {
      errors.push(`Missing production source target for Space "${spaceId}".`);
    }
  }
}

function requireMatchingProjectIds(
  { firebaseProjectId, firebasePublicProjectId, gcpProjectId },
  errors,
) {
  if (gcpProjectId && firebaseProjectId && gcpProjectId !== firebaseProjectId) {
    errors.push("GCP_PROJECT_ID and FIREBASE_PROJECT_ID must match for cutover.");
  }

  if (
    firebaseProjectId &&
    firebasePublicProjectId &&
    firebaseProjectId !== firebasePublicProjectId
  ) {
    errors.push(
      "FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_PROJECT_ID must match for cutover.",
    );
  }
}

function assertNoDemoString(name, value, errors) {
  if (!value) {
    return;
  }

  const normalized = value.toLowerCase();

  if (DEMO_VALUE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    errors.push(`${name} must not reference demo resource ${value}.`);
  }
}

function assertNoPlaceholderString(name, value, errors) {
  if (!value) {
    return;
  }

  if (PLACEHOLDER_VALUE_PATTERN.test(value)) {
    errors.push(`${name} must be replaced with a real production value.`);
  }
}

function assertPmikcmetroEmailList(name, value, errors) {
  if (!value) {
    return;
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    return;
  }

  for (const entry of entries) {
    if (!/^[^@\s]+@pmikcmetro\.com$/i.test(entry)) {
      errors.push(`${name} must use only pmikcmetro.com email addresses.`);
      return;
    }
  }
}

function assertNoDemoValues(name, values, errors) {
  for (const [key, value] of Object.entries(values)) {
    if (DEMO_VALUE_PATTERNS.some((pattern) => value.toLowerCase().includes(pattern))) {
      errors.push(`${name}.${key} must not reference demo resource ${value}.`);
    }
  }
}

function assertNoPlaceholderValues(name, values, errors) {
  for (const [key, value] of Object.entries(values)) {
    if (PLACEHOLDER_VALUE_PATTERN.test(value)) {
      errors.push(`${name}.${key} must be replaced with a real production value.`);
    }
  }
}

function configuredKeys(map) {
  return Object.entries(map)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key]) => key)
    .sort();
}

function readJsonMapSafe(value, name, errors) {
  try {
    const parsed = JSON.parse(value || "{}");

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.values(parsed).some((entry) => typeof entry !== "string")
    ) {
      throw new Error(`${name} must be a JSON object with string values.`);
    }

    return parsed;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : `${name} is invalid JSON.`);
    return {};
  }
}

function requireValue(value, name, errors) {
  if (!value) {
    errors.push(`${name} must be set for client-production.`);
  }
}

function isLocalUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function requireHttpsUrl(value, name, errors) {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      errors.push(`${name} must be an https URL.`);
    }
  } catch {
    errors.push(`${name} must be a valid URL.`);
  }
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized !== "false" && normalized !== "0";
}

function readEnvFileIfPresent() {
  const path = join(root, ".env.local");
  return existsSync(path) ? readEnvFile(path) : {};
}

function readEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");

        if (separator === -1) {
          return null;
        }

        const key = line.slice(0, separator).trim();
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^"|"$/g, "");
        return [key, value];
      })
      .filter(Boolean),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
