import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { demoRecords } from "./demo-firestore.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const localEnv = readLocalEnv();

const projectId =
  readEnv("FIREBASE_PROJECT_ID") ||
  readEnv("GCP_PROJECT_ID") ||
  readEnv("GOOGLE_CLOUD_PROJECT") ||
  readEnv("GCLOUD_PROJECT");

if (!projectId) {
  throw new Error("Set FIREBASE_PROJECT_ID, GCP_PROJECT_ID, or GOOGLE_CLOUD_PROJECT.");
}

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

const db = getFirestore();
const now = new Date().toISOString();
const seedActor = "setup-seed";

for (const record of demoRecords) {
  const ref = db.collection(record.collection).doc(record.id);
  const snapshot = await ref.get();

  if (snapshot.exists) {
    console.log(`existing ${record.collection}: ${record.id}`);
    continue;
  }

  await ref.set({
    id: record.id,
    ...record.data,
    created_at: now,
    updated_at: now,
  });

  await db
    .collection("change_log")
    .doc(`seed-${record.id}`)
    .set({
      id: `seed-${record.id}`,
      action: "create",
      created_at: now,
      editor_uid: seedActor,
      entity_id: record.id,
      entity_type: entityTypeFor(record.collection),
      note: "Created from safe four-workflow demo seed.",
    });

  console.log(`seeded ${record.collection}: ${record.id}`);
}

function entityTypeFor(collection) {
  if (collection === "sops") {
    return "sop";
  }

  if (collection === "templates") {
    return "template";
  }

  if (collection === "placeholders") {
    return "placeholder";
  }

  return "tool";
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
