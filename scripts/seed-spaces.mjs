import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const spaces = JSON.parse(
  readFileSync(join(root, "scripts", "seed-data", "spaces.json"), "utf8"),
);
const localEnv = readLocalEnv();
const driveFolderIds = readJsonMap(readEnv("SPACE_DRIVE_FOLDER_IDS"));
const vertexDataStoreIds = readJsonMap(readEnv("SPACE_VERTEX_DATA_STORE_IDS"));
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

const db = getFirestore();
const now = new Date().toISOString();

for (const space of spaces) {
  await db
    .collection("spaces")
    .doc(space.id)
    .set(
      {
        ...space,
        canonical_sop_id: `${space.id}-sop`,
        created_at: now,
        drive_folder_id: driveFolderIds[space.id] ?? "",
        vertex_data_store_id: vertexDataStoreIds[space.id] ?? "",
      },
      { merge: true },
    );
  console.log(`seeded space: ${space.id}`);
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
    throw new Error("Expected a JSON object with string values.");
  }

  return parsed;
}

function readEnv(name) {
  return process.env[name] || localEnv[name];
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
