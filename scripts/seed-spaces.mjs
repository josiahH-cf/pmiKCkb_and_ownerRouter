import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function parseSeedSpacesArgs(argv = process.argv.slice(2)) {
  return {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
  };
}

export function readSpaceSeedDefinitions() {
  return JSON.parse(
    readFileSync(join(root, "scripts", "seed-data", "spaces.json"), "utf8"),
  );
}

export function buildSpaceRecords(
  spaces,
  { driveFolderIds = {}, vertexDataStoreIds = {}, now = new Date().toISOString() } = {},
) {
  return spaces.map((space) => ({
    collection: "spaces",
    id: space.id,
    data: {
      ...space,
      canonical_sop_id: `${space.id}-sop`,
      created_at: now,
      drive_folder_id: driveFolderIds[space.id] ?? "",
      vertex_data_store_id: vertexDataStoreIds[space.id] ?? "",
    },
  }));
}

export async function seedSpaces({
  db = getLiveFirestore(),
  driveFolderIds,
  vertexDataStoreIds,
  force = false,
  now = new Date().toISOString(),
} = {}) {
  const records = buildSpaceRecords(readSpaceSeedDefinitions(), {
    driveFolderIds,
    vertexDataStoreIds,
    now,
  });
  const results = [];

  for (const record of records) {
    const ref = db.collection(record.collection).doc(record.id);
    const snapshot = await ref.get();

    if (snapshot.exists && !force) {
      results.push({ ...record, action: "skipped" });
      continue;
    }

    await ref.set(
      snapshot.exists
        ? { ...record.data, created_at: snapshot.data()?.created_at ?? now }
        : record.data,
      { merge: true },
    );

    results.push({ ...record, action: snapshot.exists ? "updated" : "created" });
  }

  return results;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseSeedSpacesArgs(argv);
  const localEnv = readLocalEnv();
  const readEnv = (name) => process.env[name] || localEnv[name];
  const driveFolderIds = readJsonMap(readEnv("SPACE_DRIVE_FOLDER_IDS"));
  const vertexDataStoreIds = readJsonMap(readEnv("SPACE_VERTEX_DATA_STORE_IDS"));

  if (args.dryRun) {
    const records = buildSpaceRecords(readSpaceSeedDefinitions(), {
      driveFolderIds,
      vertexDataStoreIds,
    });
    console.log(JSON.stringify(records, null, 2));
    return;
  }

  const results = await seedSpaces({
    driveFolderIds,
    vertexDataStoreIds,
    force: args.force,
  });

  for (const result of results) {
    console.log(`${result.action}: ${result.collection}/${result.id}`);
  }
}

export function readJsonMap(value) {
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
    throw new Error("Expected a JSON object with string values.");
  }

  return parsed;
}

function getLiveFirestore() {
  const localEnv = readLocalEnv();
  const readEnv = (name) => process.env[name] || localEnv[name];
  const projectId =
    readEnv("FIREBASE_PROJECT_ID") ||
    readEnv("GCP_PROJECT_ID") ||
    readEnv("GOOGLE_CLOUD_PROJECT") ||
    readEnv("GCLOUD_PROJECT");

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }

  return getFirestore();
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
