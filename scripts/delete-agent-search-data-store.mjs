import { v1 } from "@google-cloud/discoveryengine";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildDataStoreName } from "./import-agent-search-documents.mjs";

const DEFAULT_COLLECTION_ID = "default_collection";
const DEFAULT_LOCATION = "us";
const NOT_FOUND = 5;
const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function parseDeleteDataStoreArgs(
  argv = process.argv.slice(2),
  env = process.env,
  localEnv = readLocalEnv(),
) {
  const readArg = (name) => {
    const prefix = `${name}=`;
    const arg = argv.find((entry) => entry.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };
  const readEnv = (name) => env[name] ?? localEnv[name];

  return {
    collection: readArg("--collection") ?? DEFAULT_COLLECTION_ID,
    confirmDelete: readArg("--confirm-delete"),
    dataStore: readArg("--data-store"),
    dryRun: argv.includes("--dry-run"),
    location:
      readArg("--location") ?? readEnv("VERTEX_SEARCH_LOCATION") ?? DEFAULT_LOCATION,
    project:
      readArg("--project") ??
      readEnv("GCP_PROJECT_ID") ??
      readEnv("GOOGLE_CLOUD_PROJECT") ??
      readEnv("GCLOUD_PROJECT"),
    spaceDataStoreIds: readJsonMap(readEnv("SPACE_VERTEX_DATA_STORE_IDS")),
  };
}

export function buildDeleteDataStorePlan(args) {
  assertRequired(args.project, "project");
  assertRequired(args.dataStore, "data store");

  const activeSpaces = Object.entries(args.spaceDataStoreIds)
    .filter(([, dataStoreId]) => dataStoreId === args.dataStore)
    .map(([spaceId]) => spaceId);

  if (activeSpaces.length > 0) {
    throw new Error(
      `Refusing to delete active data store ${args.dataStore}; it is configured for Spaces: ${activeSpaces.join(", ")}.`,
    );
  }

  return {
    activeSpaces,
    name: buildDataStoreName({
      collection: args.collection,
      dataStore: args.dataStore,
      location: args.location,
      project: args.project,
    }),
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseDeleteDataStoreArgs(argv, env);
  const plan = buildDeleteDataStorePlan(args);

  if (args.dryRun) {
    console.log(JSON.stringify({ deleteRequest: { name: plan.name } }, null, 2));
    return;
  }

  if (args.confirmDelete !== args.dataStore) {
    throw new Error(
      `Refusing deletion without --confirm-delete=${args.dataStore}. Run with --dry-run first and verify no environment map references this data store.`,
    );
  }

  const client = new v1.DataStoreServiceClient({
    apiEndpoint: endpointFor(args.location),
  });

  try {
    await client.getDataStore({ name: plan.name });
  } catch (error) {
    if (error?.code === NOT_FOUND) {
      console.log(`data store already absent: ${plan.name}`);
      return;
    }

    throw error;
  }

  const [operation] = await client.deleteDataStore({ name: plan.name });
  console.log(`deleteDataStore operation=${operation.name}`);
  await operation.promise();
  console.log(`deleted data store: ${plan.name}`);
}

function endpointFor(location) {
  return location === "global"
    ? "discoveryengine.googleapis.com"
    : `${location}-discoveryengine.googleapis.com`;
}

function assertRequired(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${label}.`);
  }
}

function readJsonMap(value) {
  if (!value || !value.trim()) {
    return {};
  }

  const parsed = JSON.parse(value);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.values(parsed).some((entry) => typeof entry !== "string")
  ) {
    throw new Error(
      "Expected SPACE_VERTEX_DATA_STORE_IDS to be a JSON object with string values.",
    );
  }

  return parsed;
}

function readLocalEnv() {
  try {
    return Object.fromEntries(
      readFileSync(join(root, ".env.local"), "utf8")
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
