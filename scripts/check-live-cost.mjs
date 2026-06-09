import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CHEAP_LIVE_SPACE_ID = "lease-renewals";
export const CHEAP_LIVE_MODEL = "gemini-2.5-flash";
export const PRO_MODEL = "gemini-2.5-pro";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function readLiveCostConfig(env = process.env, localEnv = readLocalEnv()) {
  const readEnv = (name) => env[name] ?? localEnv[name];

  return {
    askDemoMode: readBoolean(readEnv("ASK_DEMO_MODE"), true),
    gcpProjectId: readString(readEnv("GCP_PROJECT_ID")),
    geminiAnswerModel: readString(readEnv("GEMINI_MODEL_ANSWER")) ?? PRO_MODEL,
    spaceDriveFolderIds: readJsonMap(
      readEnv("SPACE_DRIVE_FOLDER_IDS") ?? "{}",
      "SPACE_DRIVE_FOLDER_IDS",
    ),
    spaceVertexDataStoreIds: readJsonMap(
      readEnv("SPACE_VERTEX_DATA_STORE_IDS") ?? "{}",
      "SPACE_VERTEX_DATA_STORE_IDS",
    ),
  };
}

export function validateLiveCostConfig(config, options = {}) {
  const errors = [];
  const warnings = [];
  const driveSpaceIds = configuredKeys(config.spaceDriveFolderIds);
  const dataStoreSpaceIds = configuredKeys(config.spaceVertexDataStoreIds);

  if (!config.gcpProjectId) {
    errors.push("GCP_PROJECT_ID must be set for live Google calls.");
  }

  if (config.askDemoMode) {
    errors.push("ASK_DEMO_MODE must be false for live Ask smoke and demo deploy.");
  }

  if (config.geminiAnswerModel !== CHEAP_LIVE_MODEL) {
    if (options.allowPro && config.geminiAnswerModel === PRO_MODEL) {
      warnings.push(
        `${PRO_MODEL} is allowed only because --allow-pro was provided; ${CHEAP_LIVE_MODEL} is the cheap default.`,
      );
    } else {
      errors.push(
        `GEMINI_MODEL_ANSWER must be ${CHEAP_LIVE_MODEL}; current value is ${config.geminiAnswerModel}.`,
      );
    }
  }

  if (!options.allowMultipleSpaces) {
    assertSingleLeaseRenewalsEntry(driveSpaceIds, "SPACE_DRIVE_FOLDER_IDS", errors);
    assertSingleLeaseRenewalsEntry(
      dataStoreSpaceIds,
      "SPACE_VERTEX_DATA_STORE_IDS",
      errors,
    );
  } else if (driveSpaceIds.length === 0 || dataStoreSpaceIds.length === 0) {
    errors.push(
      "SPACE_DRIVE_FOLDER_IDS and SPACE_VERTEX_DATA_STORE_IDS must both contain at least one configured entry.",
    );
  }

  for (const spaceId of driveSpaceIds) {
    if (!config.spaceVertexDataStoreIds[spaceId]?.trim()) {
      errors.push(`Missing Agent Search data store ID for Space "${spaceId}".`);
    }
  }

  for (const spaceId of dataStoreSpaceIds) {
    if (!config.spaceDriveFolderIds[spaceId]?.trim()) {
      errors.push(`Missing source target for Space "${spaceId}".`);
    }
  }

  return {
    errors,
    ok: errors.length === 0,
    warnings,
  };
}

export function readJsonMap(value, name = "JSON map") {
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
}

export function readLocalEnv(envPath = join(root, ".env.local")) {
  try {
    return Object.fromEntries(
      readFileSync(envPath, "utf8")
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
  } catch {
    return {};
  }
}

export function parseLiveCostArgs(argv = process.argv.slice(2)) {
  return {
    allowMultipleSpaces: argv.includes("--allow-multiple-spaces"),
    allowPro: argv.includes("--allow-pro"),
    json: argv.includes("--json"),
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseLiveCostArgs(argv);
  const config = readLiveCostConfig(env);
  const result = validateLiveCostConfig(config, options);

  if (options.json) {
    console.log(JSON.stringify({ config, result }, null, 2));
  } else {
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning}`);
    }

    if (result.ok) {
      const configuredSpaces = configuredKeys(config.spaceVertexDataStoreIds);
      console.log(
        `Live cost preflight passed for ${configuredSpaces.join(", ")} using ${config.geminiAnswerModel}.`,
      );
    } else {
      console.error("Live cost preflight failed:");
      for (const error of result.errors) {
        console.error(`- ${error}`);
      }
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

function assertSingleLeaseRenewalsEntry(spaceIds, envName, errors) {
  if (spaceIds.length !== 1 || spaceIds[0] !== CHEAP_LIVE_SPACE_ID) {
    errors.push(
      `${envName} must contain exactly one entry for "${CHEAP_LIVE_SPACE_ID}" unless --allow-multiple-spaces is provided.`,
    );
  }
}

function configuredKeys(map) {
  return Object.entries(map)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key]) => key)
    .sort();
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
