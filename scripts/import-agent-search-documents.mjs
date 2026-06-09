import { v1 } from "@google-cloud/discoveryengine";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_COLLECTION_ID = "default_collection";
const DEFAULT_BRANCH_ID = "default_branch";
const DEFAULT_LOCATION = "us";
const DEFAULT_DATA_SCHEMA = "content";
const NOT_FOUND = 5;
const ALREADY_EXISTS = 6;
const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function parseImportArgs(argv = process.argv.slice(2), env = process.env) {
  const localEnv = readLocalEnv();
  const readArg = (name) => {
    const prefix = `${name}=`;
    const arg = argv.find((entry) => entry.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };
  const readRepeated = (...names) =>
    argv.flatMap((entry) => {
      const name = names.find((candidate) => entry.startsWith(`${candidate}=`));
      return name ? [entry.slice(name.length + 1)] : [];
    });
  const readEnv = (name) => env[name] ?? localEnv[name];

  return {
    collection: readArg("--collection") ?? DEFAULT_COLLECTION_ID,
    createDataStore: argv.includes("--create-data-store"),
    dataSchema: readArg("--data-schema") ?? DEFAULT_DATA_SCHEMA,
    dataStore: readArg("--data-store"),
    displayName: readArg("--display-name"),
    dryRun: argv.includes("--dry-run"),
    gcsUris: readRepeated("--source-id", "--gcs-uri"),
    location:
      readArg("--location") ?? readEnv("VERTEX_SEARCH_LOCATION") ?? DEFAULT_LOCATION,
    project: readArg("--project") ?? readEnv("GCP_PROJECT_ID"),
  };
}

export function buildDataStoreName({
  collection = DEFAULT_COLLECTION_ID,
  dataStore,
  location = DEFAULT_LOCATION,
  project,
}) {
  assertRequired(project, "project");
  assertRequired(dataStore, "data store");

  return `projects/${project}/locations/${location}/collections/${collection}/dataStores/${dataStore}`;
}

export function buildBranchPath(input) {
  return `${buildDataStoreName(input)}/branches/${DEFAULT_BRANCH_ID}`;
}

export function buildCreateDataStoreRequest({
  collection = DEFAULT_COLLECTION_ID,
  dataStore,
  displayName,
  location = DEFAULT_LOCATION,
  project,
}) {
  assertRequired(displayName, "display name");

  return {
    dataStore: {
      contentConfig: "CONTENT_REQUIRED",
      displayName,
      industryVertical: "GENERIC",
      solutionTypes: ["SOLUTION_TYPE_SEARCH"],
    },
    dataStoreId: dataStore,
    parent: `projects/${project}/locations/${location}/collections/${collection}`,
  };
}

export function buildImportDocumentsRequest({
  collection = DEFAULT_COLLECTION_ID,
  dataSchema = DEFAULT_DATA_SCHEMA,
  dataStore,
  gcsUris,
  location = DEFAULT_LOCATION,
  project,
}) {
  if (!Array.isArray(gcsUris) || gcsUris.length === 0) {
    throw new Error("Provide at least one --source-id=gs://... value.");
  }

  return {
    forceRefreshContent: true,
    gcsSource: {
      dataSchema,
      inputUris: gcsUris,
    },
    parent: buildBranchPath({ collection, dataStore, location, project }),
    reconciliationMode: "INCREMENTAL",
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseImportArgs(argv, env);
  assertRequired(args.project, "project");
  assertRequired(args.dataStore, "data store");

  const importRequest = buildImportDocumentsRequest(args);
  const createRequest = args.createDataStore
    ? buildCreateDataStoreRequest(args)
    : undefined;

  if (args.dryRun) {
    console.log(JSON.stringify({ createRequest, importRequest }, null, 2));
    return;
  }

  if (createRequest) {
    await ensureDataStore(createRequest, args);
  }

  const documentClient = new v1.DocumentServiceClient({
    apiEndpoint: endpointFor(args.location),
  });
  const [operation] = await documentClient.importDocuments(importRequest);
  console.log(`operation=${operation.name}`);
  const [response, metadata] = await operation.promise();
  console.log(JSON.stringify({ response, metadata }, null, 2));
}

async function ensureDataStore(createRequest, args) {
  const dataStoreClient = new v1.DataStoreServiceClient({
    apiEndpoint: endpointFor(args.location),
  });
  const name = buildDataStoreName(args);

  try {
    await dataStoreClient.getDataStore({ name });
    console.log(`data store exists: ${name}`);
    return;
  } catch (error) {
    if (error?.code !== NOT_FOUND) {
      throw error;
    }
  }

  try {
    const [operation] = await dataStoreClient.createDataStore(createRequest);
    console.log(`createDataStore operation=${operation.name}`);
    await operation.promise();
  } catch (error) {
    if (error?.code !== ALREADY_EXISTS) {
      throw error;
    }

    console.log(`data store already exists: ${name}`);
  }
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

function readLocalEnv(envPath = join(root, ".env.local")) {
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
