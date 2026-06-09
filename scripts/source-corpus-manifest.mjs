import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cloudStorageContentDocumentId } from "./seed-source-meta.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultManifest = join(
  root,
  "docs",
  "source-corpus",
  "demo-live-source-manifest.json",
);
const DEFAULT_PROJECT = "pmikckb-test";
const DEFAULT_LOCATION = "us";
const approvalStatuses = new Set([
  "Unreviewed",
  "Transcript-derived",
  "Approved",
  "Deprecated",
]);
const sensitivities = new Set(["Low", "Medium", "High"]);

export function parseCorpusArgs(argv = process.argv.slice(2)) {
  const readArg = (name) => {
    const prefix = `${name}=`;
    const arg = argv.find((entry) => entry.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };

  return {
    dryRun: argv.includes("--dry-run"),
    location:
      readArg("--location") ?? process.env.VERTEX_SEARCH_LOCATION ?? DEFAULT_LOCATION,
    manifest: readArg("--manifest") ?? defaultManifest,
    project: readArg("--project") ?? process.env.GCP_PROJECT_ID ?? DEFAULT_PROJECT,
    tempDir: readArg("--temp-dir") ?? join(root, "temp", "source-corpus"),
    writeTemp: argv.includes("--write-temp"),
  };
}

export function readSourceManifest(manifestPath) {
  const parsed = JSON.parse(readFileSync(resolve(manifestPath), "utf8"));
  return validateSourceManifest(parsed);
}

export function validateSourceManifest(value) {
  if (!Array.isArray(value)) {
    throw new Error("Source corpus manifest must be a JSON array.");
  }

  return value.map((entry, index) => validateEntry(entry, index));
}

export function buildSourceCorpusPlan(entries, options = {}) {
  const config = typeof options === "string" ? { tempDir: options } : options;
  const tempDir = config.tempDir ?? "temp/source-corpus";
  const project = config.project ?? DEFAULT_PROJECT;
  const location = config.location ?? DEFAULT_LOCATION;
  const preparedEntries = entries.map((entry) => {
    const tempPath = join(tempDir, entry.space_id, basenameAsTxt(entry.source_path));
    return {
      ...entry,
      document_id: cloudStorageContentDocumentId(entry.gcs_uri),
      temp_path: tempPath,
    };
  });
  const importsByDataStore = groupBy(preparedEntries, (entry) => entry.data_store_id);

  return {
    entries: preparedEntries,
    importCommands: Array.from(importsByDataStore.entries()).map(
      ([dataStoreId, dataStoreEntries]) =>
        [
          "npm run import:agent-search --",
          `--project=${project}`,
          `--location=${location}`,
          `--data-store=${dataStoreId}`,
          "--create-data-store",
          ...dataStoreEntries.map((entry) => `--source-id=${entry.gcs_uri}`),
        ].join(" "),
    ),
    seedCommands: preparedEntries.map((entry) =>
      [
        "npm run seed:source-meta --",
        `--space-id=${entry.space_id}`,
        `--source-id=${entry.gcs_uri}`,
        `--approval-status=${entry.approval_status}`,
        `--sensitivity=${entry.sensitivity}`,
      ].join(" "),
    ),
    uploadCommands: preparedEntries.map(
      (entry) => `gcloud storage cp "${entry.temp_path}" "${entry.gcs_uri}"`,
    ),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseCorpusArgs(argv);
  const entries = readSourceManifest(args.manifest);
  const plan = buildSourceCorpusPlan(entries, args);

  if (args.writeTemp) {
    writeTempCopies(plan.entries);
  }

  console.log(JSON.stringify(plan, null, 2));
}

function writeTempCopies(entries) {
  for (const entry of entries) {
    const sourcePath = resolve(root, entry.source_path);

    if (!existsSync(sourcePath)) {
      throw new Error(`Missing source file: ${entry.source_path}`);
    }

    mkdirSync(dirname(entry.temp_path), { recursive: true });
    writeFileSync(entry.temp_path, readFileSync(sourcePath, "utf8"), "utf8");
  }
}

function validateEntry(entry, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Manifest entry ${index} must be an object.`);
  }

  const record = {
    approval_status: readRequired(entry.approval_status, index, "approval_status"),
    data_store_id: readRequired(entry.data_store_id, index, "data_store_id"),
    gcs_uri: readRequired(entry.gcs_uri, index, "gcs_uri"),
    sensitivity: readRequired(entry.sensitivity, index, "sensitivity"),
    source_path: readRequired(entry.source_path, index, "source_path"),
    space_id: readRequired(entry.space_id, index, "space_id"),
  };

  if (!record.gcs_uri.startsWith("gs://")) {
    throw new Error(`Manifest entry ${index} gcs_uri must start with gs://.`);
  }

  if (!approvalStatuses.has(record.approval_status)) {
    throw new Error(`Manifest entry ${index} has invalid approval_status.`);
  }

  if (!sensitivities.has(record.sensitivity)) {
    throw new Error(`Manifest entry ${index} has invalid sensitivity.`);
  }

  return record;
}

function basenameAsTxt(path) {
  return path
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, ".txt");
}

function groupBy(entries, keyFor) {
  const groups = new Map();

  for (const entry of entries) {
    const key = keyFor(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return groups;
}

function readRequired(value, index, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Manifest entry ${index} missing ${fieldName}.`);
  }

  return value.trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
