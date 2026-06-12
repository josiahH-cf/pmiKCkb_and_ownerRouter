import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cloudStorageContentDocumentId } from "./source-doc-id.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const approvalStatuses = ["Unreviewed", "Transcript-derived", "Approved", "Deprecated"];
const sensitivities = ["Low", "Medium", "High"];

export function normalizeSourceId(value) {
  const trimmed = readRequired(value, "source ID");

  try {
    const url = new URL(trimmed);

    if (url.protocol === "gs:") {
      return cloudStorageContentDocumentId(trimmed);
    }

    const queryId = url.searchParams.get("id");

    if (queryId) {
      return decodeURIComponent(queryId);
    }

    const match = url.pathname.match(
      /\/(?:file|document|spreadsheets|presentation)\/d\/([^/]+)/,
    );

    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {
    // Plain source IDs are accepted below.
  }

  if (/[/?#]/.test(trimmed)) {
    throw new Error(
      "Expected a source ID, Google Drive file URL, or gs:// Cloud Storage URI.",
    );
  }

  return trimmed;
}

export function normalizeDriveFileId(value) {
  return normalizeSourceId(value);
}

export { cloudStorageContentDocumentId };

export function buildSourceMetaRecord(input, now = new Date().toISOString()) {
  const driveFileId = normalizeSourceId(
    input.drive_file_id ?? input.driveFileId ?? input.driveFileUrl,
  );
  const approvalStatus = input.approval_status ?? input.approvalStatus ?? "Approved";
  const sensitivity = input.sensitivity ?? "Low";
  const spaceId = input.space_id ?? input.spaceId ?? "lease-renewals";
  const reviewerUid = input.reviewer_uid ?? input.reviewerUid;
  const lastReviewedAt = input.last_reviewed_at ?? input.lastReviewedAt ?? now;

  assertOneOf(approvalStatus, approvalStatuses, "approval_status");
  assertOneOf(sensitivity, sensitivities, "sensitivity");

  return removeUndefined({
    approval_status: approvalStatus,
    drive_file_id: driveFileId,
    last_reviewed_at: lastReviewedAt,
    reviewer_uid: readOptional(reviewerUid),
    sensitivity,
    space_id: readRequired(spaceId, "space_id"),
  });
}

export function parseSourceMetaArgs(argv = process.argv.slice(2)) {
  const readArg = (name) => {
    const prefix = `${name}=`;
    const arg = argv.find((entry) => entry.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };

  return {
    approvalStatus: readArg("--approval-status"),
    driveFileId: readArg("--drive-file-id"),
    dryRun: argv.includes("--dry-run"),
    file: readArg("--file"),
    lastReviewedAt: readArg("--last-reviewed-at"),
    reviewerUid: readArg("--reviewer-uid"),
    sensitivity: readArg("--sensitivity"),
    spaceId: readArg("--space-id"),
    sourceId: readArg("--source-id"),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseSourceMetaArgs(argv);
  const records = readRecords(args);

  if (args.dryRun) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }

  const db = getLiveFirestore();

  for (const record of records) {
    await db
      .collection("sources_meta")
      .doc(record.drive_file_id)
      .set(record, { merge: true });
    console.log(`seeded sources_meta: ${record.drive_file_id}`);
  }
}

function readRecords(args) {
  if (args.file) {
    const parsed = JSON.parse(readFileSync(resolve(args.file), "utf8"));

    if (!Array.isArray(parsed)) {
      throw new Error("--file must point to a JSON array of source metadata entries.");
    }

    return parsed.map((entry) => buildSourceMetaRecord(entry));
  }

  const sourceId = args.sourceId ?? args.driveFileId;

  if (!sourceId) {
    throw new Error(
      "Provide --source-id=<source ID, Drive file URL, or gs:// URI> or --file=<json>. Legacy --drive-file-id is also accepted.",
    );
  }

  return [
    buildSourceMetaRecord({
      approvalStatus: args.approvalStatus,
      driveFileId: sourceId,
      lastReviewedAt: args.lastReviewedAt,
      reviewerUid: args.reviewerUid,
      sensitivity: args.sensitivity,
      spaceId: args.spaceId,
    }),
  ];
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

function assertOneOf(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}.`);
  }
}

function readRequired(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }

  return value.trim();
}

function readOptional(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function removeUndefined(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
