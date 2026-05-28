import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const spaces = JSON.parse(
  readFileSync(join(root, "scripts", "seed-data", "spaces.json"), "utf8"),
);
const driveFolderIds = readJsonMap(process.env.SPACE_DRIVE_FOLDER_IDS);
const vertexDataStoreIds = readJsonMap(process.env.SPACE_VERTEX_DATA_STORE_IDS);
const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCP_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT;

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
