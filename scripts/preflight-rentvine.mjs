import { pathToFileURL } from "node:url";
import { readLocalEnv } from "./check-live-cost.mjs";

// Read-only readiness check for connecting to RentVine (the property-management system of record).
// It NEVER calls RentVine and NEVER prints secret values — it only reports which pieces are present
// so the owner can see what is left to wire. RentVine's API is the owner's own account, not a Google
// service, so reading from it does not spend against the $10 GCP budget. This script makes no
// network call at all; it only inspects local configuration.

export const RENTVINE_ENV_VARS = {
  baseUrl: "RENTVINE_API_BASE_URL",
  apiKey: "RENTVINE_API_KEY",
  apiSecret: "RENTVINE_API_SECRET",
};

// Pieces that cannot be environment variables — they come from RentVine's API documentation and
// must be confirmed before a real client can be written. Tracked here so the readiness report is
// honest about what code alone cannot resolve. See docs/products/rentvine-connection-setup.md.
export const RENTVINE_DOC_UNKNOWNS = [
  "Auth scheme: exactly how the key + secret are presented on a request (header name and format).",
  "Lease-read endpoint: the path and query params for listing renewal candidates.",
  "Lease response shape: the JSON fields a lease record returns, so we can map renewal date, current rent, tenant, and property/unit.",
  "Rate limits / polling cadence guidance.",
];

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
    // Even with all three env vars set, a real read still needs the doc unknowns resolved before a
    // client can be written, so this stays false until that build lands.
    connection_ready: false,
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const readiness = summarizeRentVineReadiness(readRentVineConfig(env));

  if (argv.includes("--json")) {
    console.log(JSON.stringify(readiness, null, 2));
    return readiness;
  }

  console.log(
    "RentVine connection readiness (read-only; never calls RentVine, never prints secrets)",
  );
  console.log(
    readiness.env_configured
      ? "Credentials/base URL: all three environment variables are set."
      : `Credentials/base URL: still missing ${readiness.missing_env.join(", ")}. The saved API key and secret live in secrets/rentvine-api-credentials.local.md; move them into env vars (or Secret Manager) and add the base URL.`,
  );
  console.log("Still needed from RentVine's API docs before a real read can be built:");
  for (const item of readiness.doc_unknowns) {
    console.log(`  - ${item}`);
  }
  console.log(
    "See docs/products/rentvine-connection-setup.md for the full checklist and what gets built once these arrive.",
  );

  return readiness;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
