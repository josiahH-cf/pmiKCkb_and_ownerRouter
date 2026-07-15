import { cloudStorageContentDocumentId } from "./source-doc-id.mjs";

/**
 * Pure source-corpus validation and readiness evaluation. No filesystem, network, or SDK
 * imports: scripts/source-corpus-manifest.mjs re-exports these for the CLI, and the Admin
 * migration console imports them directly so bundling the console never traces the CLI's
 * file operations.
 */

const approvalStatuses = new Set([
  "Unreviewed",
  "Transcript-derived",
  "Approved",
  "Deprecated",
]);
const sensitivities = new Set(["Low", "Medium", "High"]);
const PLACEHOLDER_VALUE_PATTERN = /<[^>]+>|\b(change-me|changeme|replace-me|todo)\b/i;
const SAFE_RESOURCE_ID_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const SAFE_SOURCE_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const SAFE_GCS_URI_PATTERN =
  /^gs:\/\/[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function validateSourceManifest(value) {
  if (!Array.isArray(value)) {
    throw new Error("Source corpus manifest must be a JSON array.");
  }

  return value.map((entry, index) => validateEntry(entry, index));
}

export function buildSourceCorpusReadiness(entries) {
  const blockers = [];
  const warnings = [];
  const duplicateGcsUris = duplicateValues(entries, (entry) => entry.gcs_uri);
  const duplicateDocumentIds = duplicateValues(
    entries,
    (entry) => entry.document_id ?? cloudStorageContentDocumentId(entry.gcs_uri),
  );

  if (entries.length === 0) {
    blockers.push("Manifest must contain at least one approved source before import.");
  }

  entries.forEach((entry, index) => {
    const label = `Manifest entry ${index} (${entry.space_id})`;

    for (const fieldName of ["space_id", "source_path", "gcs_uri", "data_store_id"]) {
      if (PLACEHOLDER_VALUE_PATTERN.test(entry[fieldName])) {
        blockers.push(
          `${label} ${fieldName} must be replaced with a real production value.`,
        );
      }
    }

    if (entry.approval_status !== "Approved") {
      blockers.push(
        `${label} approval_status is ${entry.approval_status}; production import requires Approved source metadata.`,
      );
    }

    if (entry.sensitivity === "High") {
      blockers.push(
        `${label} is High sensitivity and must not be imported for retrieval.`,
      );
    } else if (entry.sensitivity === "Medium") {
      warnings.push(
        `${label} is Medium sensitivity; confirm it is approved for KB retrieval before import.`,
      );
    }

    if (/^(?:docs[\\/])?context_and_calls[\\/]/i.test(entry.source_path)) {
      blockers.push(
        `${label} source_path points at raw context/call material; use an approved client-safe summary instead.`,
      );
    }
  });

  for (const value of duplicateGcsUris) {
    blockers.push(`Duplicate gcs_uri in manifest: ${value}.`);
  }

  for (const value of duplicateDocumentIds) {
    blockers.push(`Duplicate derived document_id in manifest: ${value}.`);
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    counts: {
      dataStores: countBy(entries, (entry) => entry.data_store_id),
      entries: entries.length,
      approvalStatus: countBy(entries, (entry) => entry.approval_status),
      sensitivity: countBy(entries, (entry) => entry.sensitivity),
      spaces: countBy(entries, (entry) => entry.space_id),
    },
  };
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

  assertSafeResourceId(record.space_id, index, "space_id");
  assertSafeResourceId(record.data_store_id, index, "data_store_id");
  assertSafeSourcePath(record.source_path, index);
  assertSafeGcsUri(record.gcs_uri, index);

  if (!approvalStatuses.has(record.approval_status)) {
    throw new Error(`Manifest entry ${index} has invalid approval_status.`);
  }

  if (!sensitivities.has(record.sensitivity)) {
    throw new Error(`Manifest entry ${index} has invalid sensitivity.`);
  }

  return record;
}

function assertSafeResourceId(value, index, fieldName) {
  const normalized = normalizePlaceholders(value);
  if (!SAFE_RESOURCE_ID_PATTERN.test(normalized)) {
    throw new Error(
      `Manifest entry ${index} ${fieldName} must be a lowercase letters/digits/hyphens resource id.`,
    );
  }
}

function assertSafeSourcePath(value, index) {
  const normalized = normalizePlaceholders(value);
  const segments = normalized.split("/");
  if (
    !SAFE_SOURCE_PATH_PATTERN.test(normalized) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(
      `Manifest entry ${index} source_path must be a safe workspace-relative path.`,
    );
  }
}

function assertSafeGcsUri(value, index) {
  const normalized = normalizePlaceholders(value);
  const objectPath = normalized
    .slice(normalized.indexOf("/") + 2)
    .split("/")
    .slice(1);
  if (
    !SAFE_GCS_URI_PATTERN.test(normalized) ||
    objectPath.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(
      `Manifest entry ${index} gcs_uri must be a shell-safe gs://bucket/object resource.`,
    );
  }
}

function normalizePlaceholders(value) {
  return value
    .replace(/<[^<>]+>/g, "placeholder")
    .replace(/\b(change-me|changeme|replace-me|todo)\b/gi, "placeholder");
}

function duplicateValues(entries, valueFor) {
  const counts = countBy(entries, valueFor);
  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

function countBy(entries, keyFor) {
  const counts = {};

  for (const entry of entries) {
    const key = keyFor(entry);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function readRequired(value, index, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Manifest entry ${index} missing ${fieldName}.`);
  }

  return value.trim();
}
