import { pathToFileURL } from "node:url";
import { readLocalEnv } from "./check-live-cost.mjs";

// Local RentVine configuration-presence check. It NEVER calls RentVine and NEVER prints secret
// values. Production reads use Secret Manager bindings and are verified separately; this utility
// reports only whether a direct-env local process has all three names available.

export const RENTVINE_ENV_VARS = {
  baseUrl: "RENTVINE_API_BASE_URL",
  apiKey: "RENTVINE_API_KEY",
  apiSecret: "RENTVINE_API_SECRET",
};

// Compatibility export retained for callers of the old preflight shape. Existing read auth,
// endpoints, pagination, and lease mapping are implemented; there are no remaining read-doc gaps.
export const RENTVINE_DOC_UNKNOWNS = [];

// Returns presence booleans only — never the secret values themselves.
export function readRentVineConfig(env = process.env, localEnv = readLocalEnv()) {
  const read = (name) => {
    const value = env[name] ?? localEnv[name];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  const baseUrlSet = Boolean(read(RENTVINE_ENV_VARS.baseUrl));
  const apiKeySet = Boolean(read(RENTVINE_ENV_VARS.apiKey));
  const apiSecretSet = Boolean(read(RENTVINE_ENV_VARS.apiSecret));

  const missing = [];
  if (!baseUrlSet) missing.push(RENTVINE_ENV_VARS.baseUrl);
  if (!apiKeySet) missing.push(RENTVINE_ENV_VARS.apiKey);
  if (!apiSecretSet) missing.push(RENTVINE_ENV_VARS.apiSecret);

  return {
    base_url_set: baseUrlSet,
    api_key_set: apiKeySet,
    api_secret_set: apiSecretSet,
    missing,
    env_configured: missing.length === 0,
  };
}

export function summarizeRentVineReadiness(config) {
  return {
    env_configured: config.env_configured,
    missing_env: config.missing,
    doc_unknowns: RENTVINE_DOC_UNKNOWNS,
    local_config_ready: config.env_configured,
    connection_verified: false,
    production_read_status: "verified-separately",
    write_authorized: false,
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const readiness = summarizeRentVineReadiness(readRentVineConfig(env));

  if (argv.includes("--json")) {
    console.log(JSON.stringify(readiness, null, 2));
    return readiness;
  }

  console.log(
    "RentVine local config presence (never calls RentVine; never prints secrets)",
  );
  console.log(
    readiness.env_configured
      ? "Local direct-env config: all three names are set."
      : `Local direct-env config: missing ${readiness.missing_env.join(", ")}. Production Secret Manager bindings are not inspected by this command.`,
  );
  console.log(
    "Production read integration is implemented and verified separately. Renewal write authority remains closed; see docs/products/rentvine-connection-setup.md.",
  );

  return readiness;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
