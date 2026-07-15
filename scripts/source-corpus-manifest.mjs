import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cloudStorageContentDocumentId } from "./source-doc-id.mjs";
import {
  buildSourceCorpusReadiness,
  validateSourceManifest,
} from "./source-corpus-readiness.mjs";

export { buildSourceCorpusReadiness, validateSourceManifest };

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultManifest = join(
  root,
  "docs",
  "source-corpus",
  "demo-live-source-manifest.json",
);
const DEFAULT_PROJECT = "pmi-kc-kb-prod";
const DEFAULT_LOCATION = "us";
const SAFE_PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const SAFE_LOCATION_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const PLACEHOLDER_VALUE_PATTERN = /<[^>]+>|\b(change-me|changeme|replace-me|todo)\b/i;

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

export function buildSourceCorpusPlan(entries, options = {}) {
  const config = typeof options === "string" ? { tempDir: options } : options;
  const tempDir = config.tempDir ?? "temp/source-corpus";
  const project = config.project ?? DEFAULT_PROJECT;
  const location = config.location ?? DEFAULT_LOCATION;
  assertSafePlanOption(project, "project", SAFE_PROJECT_PATTERN);
  assertSafePlanOption(location, "location", SAFE_LOCATION_PATTERN);
  assertSafeTempDir(tempDir);
  const validatedEntries = validateSourceManifest(entries);
  const commandInputsReady = !validatedEntries.some((entry) =>
    [entry.space_id, entry.source_path, entry.gcs_uri, entry.data_store_id].some(
      (value) => PLACEHOLDER_VALUE_PATTERN.test(value),
    ),
  );
  const preparedEntries = validatedEntries.map((entry) => {
    const tempPath = join(tempDir, entry.space_id, basenameAsTxt(entry.source_path));
    return {
      ...entry,
      document_id: cloudStorageContentDocumentId(entry.gcs_uri),
      temp_path: tempPath,
    };
  });
  const importsByDataStore = groupBy(preparedEntries, (entry) => entry.data_store_id);
  const readiness = buildSourceCorpusReadiness(preparedEntries);
  const commandsReady = commandInputsReady && readiness.ok;

  return {
    entries: preparedEntries,
    readiness,
    importCommands: commandsReady
      ? Array.from(importsByDataStore.entries()).map(([dataStoreId, dataStoreEntries]) =>
          [
            "npm run import:agent-search --",
            `--project=${project}`,
            `--location=${location}`,
            `--data-store=${dataStoreId}`,
            "--create-data-store",
            ...dataStoreEntries.map((entry) => `--source-id=${entry.gcs_uri}`),
          ].join(" "),
        )
      : [],
    seedCommands: commandsReady
      ? preparedEntries.map((entry) =>
          [
            "npm run seed:source-meta --",
            `--space-id=${entry.space_id}`,
            `--source-id=${entry.gcs_uri}`,
            `--approval-status=${entry.approval_status}`,
            `--sensitivity=${entry.sensitivity}`,
          ].join(" "),
        )
      : [],
    uploadCommands: commandsReady
      ? preparedEntries.map(
          (entry) => `gcloud storage cp "${entry.temp_path}" "${entry.gcs_uri}"`,
        )
      : [],
  };
}

function assertSafePlanOption(value, name, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`Source corpus ${name} is not a safe command value.`);
  }
}

function assertSafeTempDir(value) {
  const allowedRoot = resolve(root, "temp");
  const resolved = typeof value === "string" ? resolve(root, value) : "";
  const relativePath = resolved ? relative(allowedRoot, resolved) : "";
  const segments = relativePath.split(/[\\/]/);
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativePath) ||
    segments.some((segment) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment))
  ) {
    throw new Error("Source corpus tempDir must be a safe workspace-relative path.");
  }
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
