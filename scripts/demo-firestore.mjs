import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DRAFT_BANNER = "Draft \u2014 Review before sending";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const localEnv = readLocalEnv();

export const demoRecords = [
  {
    collection: "sops",
    deleteFields: ["last_reviewed_at"],
    id: "demo-lease-renewals-sop",
    data: {
      body_md:
        "# Lease Renewals Demo SOP\n\n1. Check the current lease and renewal status.\n2. Confirm owner direction before sending owner-facing commitments.\n3. Use approved renewal follow-up wording when the source is verified.\n4. Create a placeholder when timing, fee, or approval details are not documented.",
      owner_uid: "local-demo-admin",
      sensitivity: "Low",
      source_state_hint: "Verified Source",
      space_id: "lease-renewals",
      status: "In Review",
      title: "Lease Renewals Demo SOP",
    },
  },
  {
    collection: "templates",
    deleteFields: ["approved_by_uid", "last_reviewed_at"],
    id: "demo-owner-renewal-follow-up",
    data: {
      audience: "Owner",
      body: `${DRAFT_BANNER}\n\nHi [Owner Name],\n\nWe are checking the renewal status and will confirm the recommended next step once the documented renewal details are verified.\n\nThank you,`,
      channel: "Gmail",
      name: "Owner Renewal Follow-Up",
      space_id: "lease-renewals",
      status: "In Review",
    },
  },
  {
    collection: "tools",
    deleteFields: [],
    id: "demo-rentvine",
    data: {
      integration_status: "Link only",
      name: "RentVine",
      primary_owner_uid: "local-demo-admin",
      purpose: "Check lease and renewal context. No API write path exists in the KB.",
      sensitivity: "Medium",
      url: "https://example.com/rentvine",
    },
  },
  {
    collection: "placeholders",
    deleteFields: ["resolution"],
    id: "demo-placeholder-renewal-timing",
    data: {
      due_date: "2026-06-15",
      missing_detail: "Confirm the exact renewal follow-up timing for edge cases.",
      owner_uid: "local-demo-admin",
      priority: "P1",
      space_id: "lease-renewals",
      status: "Open",
    },
  },
];

export async function resetDemoRecords({
  note = "Reset safe Lease Renewals demo records.",
} = {}) {
  const db = getDemoFirestore();
  const now = new Date().toISOString();

  for (const record of demoRecords) {
    const ref = db.collection(record.collection).doc(record.id);
    const snapshot = await ref.get();

    const resetData = {
      id: record.id,
      ...record.data,
      created_at: snapshot.exists ? (snapshot.data()?.created_at ?? now) : now,
      updated_at: now,
    };

    await ref.set(
      snapshot.exists ? { ...resetData, deleted_at: FieldValue.delete() } : resetData,
      { merge: true },
    );

    if (record.deleteFields.length > 0) {
      await ref.update(
        Object.fromEntries(
          record.deleteFields.map((fieldName) => [fieldName, FieldValue.delete()]),
        ),
      );
    }

    const changeLogId = `demo-reset-${Date.now()}-${record.id}`;

    await db
      .collection("change_log")
      .doc(changeLogId)
      .set({
        id: changeLogId,
        action: snapshot.exists ? "update" : "create",
        created_at: now,
        editor_uid: "demo-reset",
        entity_id: record.id,
        entity_type: entityTypeFor(record.collection),
        note,
      });
  }
}

function getDemoFirestore() {
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

  return getFirestore();
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
