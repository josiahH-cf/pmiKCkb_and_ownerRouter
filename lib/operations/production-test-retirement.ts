import { createHash } from "node:crypto";

import {
  PRODUCTION_TEST_RECORD_CATALOG,
  PRODUCTION_TEST_RECORD_CATALOG_VERSION,
  classifyProductionTestRecord,
  findProductionTestRecordDescriptor,
  type FirestoreRestFields,
  type ProductionTestRecordClassification,
} from "@/lib/operations/production-test-record-catalog";
import {
  PRODUCT_RECORD_RETENTION_POLICY,
  isProductRecordCollection,
  resolveProductRecordDeletionDisposition,
} from "@/lib/operations/product-record-retention";

/**
 * S56's v2 contract is intentionally named for DELETE semantics. The S40 v1 contract described a
 * move to Demo; that destination no longer exists. Changing this value is meant to invalidate every
 * old plan and proof rather than silently interpreting a migration plan as deletion authority.
 */
export const PRODUCTION_TEST_RETIREMENT_VERSION =
  "production-test-retirement:v2-delete" as const;
export const PRODUCTION_TEST_RETIREMENT_AUTHORITY =
  "owner-decision:S56-2026-08-01" as const;
/**
 * One document per destructive commit. Firestore's 10 MiB transaction accounting includes the
 * target document and its index entries, so request JSON size alone cannot prove a multi-document
 * delete fits even when every wire payload looks small.
 */
export const PRODUCTION_TEST_RETIREMENT_MAX_DELETE_BATCH_SIZE = 1 as const;
export const PRODUCTION_TEST_SOURCE_DATABASE =
  "projects/pmi-kc-kb-prod/databases/(default)" as const;
const PRODUCTION_TEST_DATABASE_PREFIX = "projects/pmi-kc-kb-prod/databases/" as const;

export type ProductionTestRetentionDisposition =
  | "owner_authorized"
  | "blocked_legal_hold"
  | "blocked_unknown_retention";

/**
 * Content-free projection of a Firestore document. The document fields are hashed and discarded;
 * neither the manifest nor its public count report carries customer data.
 */
export interface ProductionTestRecordSnapshot {
  readonly documentName: string;
  readonly collection: string;
  readonly id: string;
  readonly classification: ProductionTestRecordClassification;
  readonly markerPath?: string;
  readonly descriptorDigest: string;
  readonly updateTime: string;
  readonly recordHash: string;
  readonly retentionDisposition: ProductionTestRetentionDisposition;
  readonly retentionFingerprint: string;
  readonly snapshotDigest: string;
}

export interface ProductionTestBackupEvidence {
  /** Canonical identity derived from the named backup-clone resource and exact PITR snapshot. */
  readonly backupRef: string;
  /** Full Production database resource name that PITR reads from. */
  readonly sourceDatabase: string;
  /** Exact live source metadata read immediately before clone. */
  readonly sourceDatabaseUid: string;
  readonly sourcePitrEnablement: "POINT_IN_TIME_RECOVERY_ENABLED";
  readonly sourceDeleteProtectionState: "DELETE_PROTECTION_ENABLED";
  readonly sourceEarliestVersionTime: string;
  readonly snapshotTime: string;
  readonly verifiedAt: string;
  /** Both reachable services must serve their fenced revision before the PITR snapshot. */
  readonly intakeFences: readonly [
    Readonly<{
      readonly service: "pmi-kc-app";
      readonly revision: string;
      readonly trafficPercent: 100;
      readonly deployedAt: string;
    }>,
    Readonly<{
      readonly service: "pmi-kc-kb-demo";
      readonly revision: string;
      readonly trafficPercent: 100;
      readonly deployedAt: string;
    }>,
  ];
}

export interface ProductionTestPitrCloneEvidence {
  /** Full non-Production database resource name cloned at the named PITR snapshot. */
  readonly cloneDatabase: string;
  readonly sourceDatabase: string;
  readonly snapshotTime: string;
  readonly state: "READY";
  readonly operationRef: string;
  readonly lroDone: true;
  readonly lroMetadata: Readonly<{
    readonly operationState: "SUCCESSFUL";
    readonly destinationDatabase: string;
    readonly pitrSnapshot: Readonly<{
      readonly database: string;
      readonly databaseUid: string;
      readonly snapshotTime: string;
    }>;
  }>;
  readonly lroResponse: Readonly<{
    readonly database: string;
    readonly databaseUid: string;
  }>;
  readonly databaseReadback: Readonly<{
    readonly database: string;
    readonly databaseUid: string;
    readonly locationId: "us-central1";
    readonly type: "FIRESTORE_NATIVE";
    readonly deleteTime: null;
  }>;
  readonly verification: "manifest-record-hashes";
  readonly verifiedRecordCount: number;
  readonly verifiedAggregateHash: string;
  readonly verifiedAt: string;
}

export interface ProductionTestRetirementManifestRecord extends ProductionTestRecordSnapshot {
  readonly classification: "test";
}

export interface ProductionTestRetirementManifest {
  readonly version: typeof PRODUCTION_TEST_RETIREMENT_VERSION;
  readonly semantics: "delete";
  readonly authority: typeof PRODUCTION_TEST_RETIREMENT_AUTHORITY;
  readonly catalogVersion: typeof PRODUCTION_TEST_RECORD_CATALOG_VERSION;
  readonly catalogDigest: string;
  readonly phase: "counted" | "backup_verified";
  readonly countedAt: string;
  readonly backup: ProductionTestBackupEvidence | null;
  readonly clone: ProductionTestPitrCloneEvidence | null;
  readonly counts: readonly { readonly collection: string; readonly count: number }[];
  readonly totalTest: number;
  readonly records: readonly ProductionTestRetirementManifestRecord[];
  readonly manifestDigest: string;
}

export interface ProductionTestRestoreProof {
  readonly version: typeof PRODUCTION_TEST_RETIREMENT_VERSION;
  readonly status: "verified";
  readonly manifestDigest: string;
  readonly catalogDigest: string;
  readonly backupRef: string;
  readonly backupCloneDatabase: string;
  readonly restoreTargetDatabase: string;
  readonly sourceDocumentNameHash: string;
  readonly restoredDocumentNameHash: string;
  readonly sourceRecordHash: string;
  readonly restoredRecordHash: string;
  readonly restoredRecordCount: 1;
  readonly createPrecondition: "exists:false";
  readonly cleanupVerified: true;
  readonly verifiedAt: string;
  readonly cleanupVerifiedAt: string;
  readonly proofDigest: string;
}

export interface FirestoreRestDeleteWrite {
  readonly delete: string;
  readonly currentDocument: { readonly updateTime: string };
}

export interface FirestoreRestCreateWrite {
  readonly update: {
    readonly name: string;
    readonly fields: FirestoreRestFields;
  };
  readonly currentDocument: { readonly exists: false };
}

export interface FirestoreRestDeleteBatch {
  readonly writes: readonly FirestoreRestDeleteWrite[];
}

export class ProductionTestRetirementRefusal extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProductionTestRetirementRefusal";
  }
}

export function productionTestRecordCatalogDigest(): string {
  return sha256(canonicalJson(PRODUCTION_TEST_RECORD_CATALOG));
}

export function productionTestDocumentNameHash(documentName: string): string {
  return sha256(documentName);
}

export function productionTestPitrBackupRef(
  cloneDatabase: string,
  snapshotTime: string,
): string {
  assertS56DatabaseName(cloneDatabase, "PITR clone database");
  assertTimestamp(snapshotTime, "PITR snapshot timestamp");
  return `pitr-clone:${cloneDatabase}@${canonicalRfc3339Instant(snapshotTime)}`;
}

export function productionTestRecordAggregateHash(
  records: readonly Pick<ProductionTestRecordSnapshot, "documentName" | "recordHash">[],
): string {
  return sha256(
    canonicalJson(
      [...records]
        .map((record) => ({
          documentName: record.documentName,
          recordHash: record.recordHash,
        }))
        .sort((left, right) => left.documentName.localeCompare(right.documentName)),
    ),
  );
}

/** Build the bodyless snapshot that both the planning scan and the immediate pre-delete re-scan use. */
export function createProductionTestRecordSnapshot(input: {
  documentName: string;
  collection: string;
  id: string;
  updateTime: string;
  fields: FirestoreRestFields;
}): ProductionTestRecordSnapshot {
  assertDocumentIdentity(input.documentName, input.collection, input.id);
  assertTimestamp(input.updateTime, "Document updateTime");

  const descriptor = findProductionTestRecordDescriptor(input.collection);
  if (!descriptor) {
    refuse(
      "unknown_collection",
      `${input.collection} is not present in the governed Production Test record catalog.`,
    );
  }
  const marker = classifyProductionTestRecord(descriptor, input.fields);
  const retention = resolveRetention(input.collection, input.fields);
  const projection = {
    documentName: input.documentName,
    collection: input.collection,
    id: input.id,
    classification: marker.classification,
    ...(marker.markerPath ? { markerPath: marker.markerPath } : {}),
    descriptorDigest: sha256(canonicalJson(descriptor)),
    updateTime: input.updateTime,
    recordHash: sha256(canonicalJson(input.fields)),
    retentionDisposition: retention.disposition,
    retentionFingerprint: retention.fingerprint,
  };
  return Object.freeze({
    ...projection,
    snapshotDigest: sha256(canonicalJson(projection)),
  });
}

export function buildProductionTestRetirementManifest(input: {
  records: readonly ProductionTestRecordSnapshot[];
  backup?: ProductionTestBackupEvidence | null;
  clone?: ProductionTestPitrCloneEvidence | null;
  countedAt: string;
}): ProductionTestRetirementManifest {
  assertTimestamp(input.countedAt, "Count timestamp");

  const seen = new Set<string>();
  const candidates: ProductionTestRetirementManifestRecord[] = [];
  for (const record of input.records) {
    validateSnapshot(record);
    if (seen.has(record.documentName)) {
      refuse("duplicate_record", "The retirement scan contains a duplicate document.");
    }
    seen.add(record.documentName);
    if (record.classification === "refused") {
      refuse(
        "refused_classification",
        "A governed record has an ambiguous or invalid explicit Test marker.",
      );
    }
    if (record.classification !== "test") continue;
    candidates.push(record as ProductionTestRetirementManifestRecord);
  }
  candidates.sort(compareSnapshots);

  const countMap = new Map(
    PRODUCTION_TEST_RECORD_CATALOG.map((descriptor) => [descriptor.collection, 0]),
  );
  for (const record of candidates) {
    countMap.set(record.collection, (countMap.get(record.collection) ?? 0) + 1);
  }
  const counts = [...countMap]
    .map(([collection, count]) => Object.freeze({ collection, count }))
    .sort((left, right) => left.collection.localeCompare(right.collection));
  const backup = input.backup ?? null;
  const clone = input.clone ?? null;
  if ((backup === null) !== (clone === null)) {
    refuse(
      "partial_backup_evidence",
      "Count evidence may omit backup proof, but DELETE readiness requires both the named PITR identity and its verified clone.",
    );
  }
  if (backup && clone) {
    for (const record of candidates) assertRetentionAllowsS56Deletion(record);
    assertPitrCloneEvidence(backup, clone, candidates);
    if (!sameRfc3339Instant(backup.snapshotTime, input.countedAt)) {
      refuse(
        "backup_count_mismatch",
        "The named PITR snapshot must be the exact snapshot used for the recorded count.",
      );
    }
  }
  const body = {
    version: PRODUCTION_TEST_RETIREMENT_VERSION,
    semantics: "delete" as const,
    authority: PRODUCTION_TEST_RETIREMENT_AUTHORITY,
    catalogVersion: PRODUCTION_TEST_RECORD_CATALOG_VERSION,
    catalogDigest: productionTestRecordCatalogDigest(),
    phase: backup ? ("backup_verified" as const) : ("counted" as const),
    countedAt: input.countedAt,
    backup: backup ? Object.freeze({ ...backup }) : null,
    clone: clone ? Object.freeze({ ...clone }) : null,
    counts: Object.freeze(counts),
    totalTest: candidates.length,
    records: Object.freeze(candidates.map((record) => Object.freeze({ ...record }))),
  };
  return Object.freeze({
    ...body,
    manifestDigest: sha256(canonicalJson(body)),
  });
}

/** Re-validates every authority-bearing and tamper-evident field before an effect is built. */
export function validateProductionTestRetirementManifest(
  manifest: ProductionTestRetirementManifest,
): void {
  if (
    manifest.version !== PRODUCTION_TEST_RETIREMENT_VERSION ||
    manifest.semantics !== "delete"
  ) {
    refuse(
      "wrong_semantics",
      "Only the S56 v2 DELETE manifest is valid; an older move/migration plan is refused.",
    );
  }
  if (manifest.authority !== PRODUCTION_TEST_RETIREMENT_AUTHORITY) {
    refuse(
      "wrong_authority",
      "The manifest does not carry the exact S56 owner authority.",
    );
  }
  if (
    manifest.catalogVersion !== PRODUCTION_TEST_RECORD_CATALOG_VERSION ||
    manifest.catalogDigest !== productionTestRecordCatalogDigest()
  ) {
    refuse(
      "catalog_drift",
      "The governed record catalog changed after this plan was built.",
    );
  }
  assertTimestamp(manifest.countedAt, "Count timestamp");
  if (manifest.phase === "counted") {
    if (manifest.backup !== null || manifest.clone !== null) {
      refuse(
        "phase_evidence_mismatch",
        "A counted manifest cannot carry partial backup evidence.",
      );
    }
  } else if (manifest.phase === "backup_verified") {
    if (!manifest.backup || !manifest.clone) {
      refuse(
        "phase_evidence_mismatch",
        "A backup-verified manifest requires both PITR records.",
      );
    }
    assertPitrCloneEvidence(manifest.backup, manifest.clone, manifest.records);
    if (!sameRfc3339Instant(manifest.backup.snapshotTime, manifest.countedAt)) {
      refuse(
        "backup_count_mismatch",
        "The named PITR snapshot must be the exact snapshot used for the recorded count.",
      );
    }
  } else {
    refuse("invalid_phase", "The retirement manifest has an invalid phase.");
  }

  const seen = new Set<string>();
  for (const record of manifest.records) {
    validateSnapshot(record);
    if (record.classification !== "test") {
      refuse("manifest_live_record", "A DELETE manifest contains a non-Test record.");
    }
    if (seen.has(record.documentName)) {
      refuse("duplicate_record", "The DELETE manifest contains a duplicate document.");
    }
    seen.add(record.documentName);
    if (manifest.phase === "backup_verified") {
      assertRetentionAllowsS56Deletion(record);
    }
  }
  const expectedOrder = [...manifest.records].sort(compareSnapshots);
  if (!sameDocumentOrder(manifest.records, expectedOrder)) {
    refuse(
      "nondeterministic_manifest",
      "Manifest records are not deterministically sorted.",
    );
  }
  const expectedCounts = countsFor(manifest.records);
  if (
    manifest.totalTest !== manifest.records.length ||
    canonicalJson(manifest.counts) !== canonicalJson(expectedCounts)
  ) {
    refuse("count_drift", "Manifest counts do not equal its exact Test record set.");
  }

  const { manifestDigest, ...body } = manifest;
  if (manifestDigest !== sha256(canonicalJson(body))) {
    refuse(
      "manifest_tampered",
      "The retirement manifest digest does not match its body.",
    );
  }
}

/**
 * The pre-delete scan must be an exact set match, never an intersection. This refuses every stale
 * shape: a missing or newly-added candidate, reclassification, content/update drift, or retention
 * drift. The caller must pass the entire fresh governed scan, not only matching planned records.
 */
export function assertExactProductionTestCandidateSet(
  manifest: ProductionTestRetirementManifest,
  currentRecords: readonly ProductionTestRecordSnapshot[],
): void {
  validateProductionTestRetirementManifest(manifest);
  const current = new Map<string, ProductionTestRecordSnapshot>();
  for (const record of currentRecords) {
    validateSnapshot(record);
    if (current.has(record.documentName)) {
      refuse(
        "duplicate_current_record",
        "The pre-delete scan contains a duplicate document.",
      );
    }
    current.set(record.documentName, record);
    if (record.classification === "refused") {
      refuse(
        "refused_classification",
        "The pre-delete scan contains an ambiguous or invalid explicit Test marker.",
      );
    }
  }

  const plannedNames = new Set(manifest.records.map((record) => record.documentName));
  const drift: string[] = [];
  for (const planned of manifest.records) {
    const fresh = current.get(planned.documentName);
    if (!fresh) {
      drift.push("missing");
      continue;
    }
    if (
      fresh.classification !== "test" ||
      fresh.markerPath !== planned.markerPath ||
      fresh.descriptorDigest !== planned.descriptorDigest
    ) {
      drift.push("reclassified");
    }
    if (
      fresh.retentionDisposition !== planned.retentionDisposition ||
      fresh.retentionFingerprint !== planned.retentionFingerprint
    ) {
      drift.push("retention");
    }
    if (fresh.updateTime !== planned.updateTime) drift.push("updateTime");
    if (fresh.recordHash !== planned.recordHash) drift.push("hash");
  }
  for (const fresh of current.values()) {
    if (fresh.classification === "test" && !plannedNames.has(fresh.documentName)) {
      drift.push("extra");
    }
  }
  if (drift.length > 0) {
    refuse(
      "candidate_set_drift",
      `The pre-delete candidate set is not exact (${[...new Set(drift)]
        .sort()
        .join(", ")}); rebuild the count and manifest before deleting.`,
    );
  }
}

export function buildProductionTestRestoreProof(
  input: Omit<
    ProductionTestRestoreProof,
    "version" | "status" | "restoredRecordCount" | "createPrecondition" | "proofDigest"
  >,
): ProductionTestRestoreProof {
  const body = {
    version: PRODUCTION_TEST_RETIREMENT_VERSION,
    status: "verified" as const,
    manifestDigest: input.manifestDigest,
    catalogDigest: input.catalogDigest,
    backupRef: input.backupRef,
    backupCloneDatabase: input.backupCloneDatabase,
    restoreTargetDatabase: input.restoreTargetDatabase,
    sourceDocumentNameHash: input.sourceDocumentNameHash,
    restoredDocumentNameHash: input.restoredDocumentNameHash,
    sourceRecordHash: input.sourceRecordHash,
    restoredRecordHash: input.restoredRecordHash,
    restoredRecordCount: 1 as const,
    createPrecondition: "exists:false" as const,
    cleanupVerified: input.cleanupVerified,
    verifiedAt: input.verifiedAt,
    cleanupVerifiedAt: input.cleanupVerifiedAt,
  };
  return Object.freeze({ ...body, proofDigest: sha256(canonicalJson(body)) });
}

export function validateProductionTestRestoreProof(
  manifest: ProductionTestRetirementManifest,
  proof: ProductionTestRestoreProof,
): void {
  validateProductionTestRetirementManifest(manifest);
  if (manifest.phase !== "backup_verified" || !manifest.backup || !manifest.clone) {
    refuse(
      "missing_backup_clone",
      "A restore drill requires the named PITR identity and its verified backup clone.",
    );
  }
  if (
    proof.version !== PRODUCTION_TEST_RETIREMENT_VERSION ||
    proof.status !== "verified" ||
    proof.manifestDigest !== manifest.manifestDigest ||
    proof.catalogDigest !== manifest.catalogDigest ||
    proof.backupRef !== manifest.backup.backupRef ||
    proof.backupCloneDatabase !== manifest.clone.cloneDatabase
  ) {
    refuse(
      "restore_proof_mismatch",
      "Restore proof does not bind to this exact manifest and clone.",
    );
  }
  if (
    proof.restoreTargetDatabase === manifest.backup.sourceDatabase ||
    proof.restoreTargetDatabase === manifest.clone.cloneDatabase ||
    !proof.restoreTargetDatabase.trim()
  ) {
    refuse(
      "restore_target_not_isolated",
      "The one-record restore drill must use a disposable database distinct from Production and the PITR backup clone.",
    );
  }
  assertS56DatabaseName(proof.restoreTargetDatabase, "Restore drill database");
  if (
    proof.restoredRecordCount !== 1 ||
    proof.createPrecondition !== "exists:false" ||
    !proof.cleanupVerified
  ) {
    refuse(
      "restore_proof_incomplete",
      "Restore rehearsal must create exactly one absent record with exists:false and verify cleanup.",
    );
  }
  if (
    !isSha256(proof.sourceDocumentNameHash) ||
    !isSha256(proof.restoredDocumentNameHash) ||
    proof.sourceDocumentNameHash === proof.restoredDocumentNameHash ||
    !isSha256(proof.sourceRecordHash) ||
    proof.sourceRecordHash !== proof.restoredRecordHash
  ) {
    refuse(
      "restore_proof_content_mismatch",
      "Restore rehearsal does not prove an exact one-record round trip to an isolated target.",
    );
  }
  const restoredManifestRecord = manifest.records.find((record) => {
    const relativeName = record.documentName.slice(
      PRODUCTION_TEST_SOURCE_DATABASE.length,
    );
    const cloneName = `${manifest.clone!.cloneDatabase}${relativeName}`;
    const restoredName = `${proof.restoreTargetDatabase}${relativeName}`;
    return (
      productionTestDocumentNameHash(cloneName) === proof.sourceDocumentNameHash &&
      productionTestDocumentNameHash(restoredName) === proof.restoredDocumentNameHash &&
      record.recordHash === proof.sourceRecordHash
    );
  });
  if (!restoredManifestRecord) {
    refuse(
      "restore_proof_record_mismatch",
      "Restore proof does not identify one exact manifest record read from the backup clone and recreated in the disposable database.",
    );
  }
  assertTimestamp(proof.verifiedAt, "Restore proof verification timestamp");
  assertTimestamp(proof.cleanupVerifiedAt, "Restore proof cleanup timestamp");
  if (compareRfc3339Instants(proof.cleanupVerifiedAt, proof.verifiedAt) < 0) {
    refuse(
      "restore_cleanup_order",
      "Restore cleanup readback cannot predate the one-record restore verification.",
    );
  }
  const { proofDigest, ...body } = proof;
  if (proofDigest !== sha256(canonicalJson(body))) {
    refuse("restore_proof_tampered", "Restore proof digest does not match its body.");
  }
}

/** Firestore REST `documents:commit`/`documents:batchWrite` payloads with exact update-time CAS. */
export function buildProductionTestCasDeleteBatches(
  manifest: ProductionTestRetirementManifest,
  currentRecords: readonly ProductionTestRecordSnapshot[],
  proof: ProductionTestRestoreProof,
): readonly FirestoreRestDeleteBatch[] {
  assertExactProductionTestCandidateSet(manifest, currentRecords);
  validateProductionTestRestoreProof(manifest, proof);
  const writes = [...manifest.records].sort(compareSnapshots).map(
    (record): FirestoreRestDeleteWrite =>
      Object.freeze({
        delete: record.documentName,
        currentDocument: Object.freeze({ updateTime: record.updateTime }),
      }),
  );
  const batches: FirestoreRestDeleteBatch[] = [];
  for (
    let offset = 0;
    offset < writes.length;
    offset += PRODUCTION_TEST_RETIREMENT_MAX_DELETE_BATCH_SIZE
  ) {
    batches.push(
      Object.freeze({
        writes: Object.freeze(
          writes.slice(offset, offset + PRODUCTION_TEST_RETIREMENT_MAX_DELETE_BATCH_SIZE),
        ),
      }),
    );
  }
  return Object.freeze(batches);
}

/**
 * Build create-only restore writes. `exists:false` makes accidental overwrite impossible. Every
 * target must be a direct document in the caller's one explicit destination database; this supports
 * both the one-record drill and a reviewed bulk rollback without permitting a mixed/escaped target.
 */
export function buildProductionTestCreateOnlyRestoreWrites(
  records: readonly {
    readonly documentName: string;
    readonly fields: FirestoreRestFields;
  }[],
  expectedDestinationDatabase: string,
): readonly FirestoreRestCreateWrite[] {
  if (records.length < 1) {
    refuse(
      "restore_empty",
      "A create-only restore payload requires at least one record.",
    );
  }
  assertS56DatabaseName(expectedDestinationDatabase, "Restore destination database");
  const seen = new Set<string>();
  for (const record of records) {
    if (
      !isDirectDocumentInDatabase(record.documentName, expectedDestinationDatabase) ||
      seen.has(record.documentName)
    ) {
      refuse(
        "invalid_restore_target",
        "Every create-only restore target must be a unique direct document in the explicit destination database.",
      );
    }
    seen.add(record.documentName);
  }
  return Object.freeze(
    [...records]
      .sort((left, right) => left.documentName.localeCompare(right.documentName))
      .map((record) =>
        Object.freeze({
          update: Object.freeze({
            name: record.documentName,
            fields: record.fields,
          }),
          currentDocument: Object.freeze({ exists: false as const }),
        }),
      ),
  );
}

/** Public/operator rendering deliberately emits counts only: no ids, hashes, refs, or record data. */
export function formatProductionTestRetirementCounts(
  manifest: ProductionTestRetirementManifest,
): string {
  validateProductionTestRetirementManifest(manifest);
  return [
    `Production Test retirement count (${manifest.version}; DELETE semantics)`,
    `Total explicit Test records: ${manifest.totalTest}`,
    ...manifest.counts.map((entry) => `${entry.collection}: ${entry.count}`),
  ].join("\n");
}

function assertRetentionAllowsS56Deletion(record: ProductionTestRecordSnapshot): void {
  if (record.retentionDisposition === "blocked_legal_hold") {
    refuse("legal_hold", "A legal hold blocks S56 deletion.");
  }
  if (record.retentionDisposition === "blocked_unknown_retention") {
    refuse(
      "unknown_retention",
      "Unknown or malformed retention state blocks S56 deletion.",
    );
  }
  if (record.retentionDisposition !== "owner_authorized") {
    refuse("unknown_retention", "The record has no valid S56 deletion disposition.");
  }
}

function resolveRetention(
  collection: string,
  fields: FirestoreRestFields,
): {
  disposition: ProductionTestRetentionDisposition;
  fingerprint: string;
} {
  const legalHold = decodeFirestoreBoolean(fields.legal_hold);
  let disposition: ProductionTestRetentionDisposition;
  if (isProductRecordCollection(collection)) {
    const hasAnyStoredRetentionField = [
      fields.product_retention_policy,
      fields.product_retention_class,
      fields.legal_hold,
    ].some((value) => value !== undefined);
    const productFields = {
      product_retention_policy: decodeFirestoreString(fields.product_retention_policy),
      product_retention_class: decodeFirestoreString(fields.product_retention_class),
      legal_hold: legalHold,
    };
    if (!hasAnyStoredRetentionField) {
      // These are legacy Test-only rows created before D15 stamping. S56's exact owner decision
      // supplies the otherwise-manual deletion review for every Test record. This exception is
      // deliberately all-or-nothing: partial/malformed metadata still fails closed below.
      disposition = "owner_authorized";
    } else {
      const productDisposition = resolveProductRecordDeletionDisposition(productFields);
      disposition =
        productDisposition === "blocked_legal_hold"
          ? "blocked_legal_hold"
          : productDisposition === "blocked_unknown_retention"
            ? "blocked_unknown_retention"
            : "owner_authorized";
    }
  } else if (fields.legal_hold !== undefined && legalHold === undefined) {
    disposition = "blocked_unknown_retention";
  } else {
    disposition = legalHold ? "blocked_legal_hold" : "owner_authorized";
  }
  const retentionProjection = {
    authority: PRODUCTION_TEST_RETIREMENT_AUTHORITY,
    productPolicy: isProductRecordCollection(collection)
      ? PRODUCT_RECORD_RETENTION_POLICY
      : null,
    product_retention_policy: fields.product_retention_policy ?? null,
    product_retention_class: fields.product_retention_class ?? null,
    retention_policy_version: fields.retention_policy_version ?? null,
    retention_class: fields.retention_class ?? null,
    expires_at: fields.expires_at ?? null,
    expires_at_ms: fields.expires_at_ms ?? null,
    legal_hold: fields.legal_hold ?? null,
  };
  return {
    disposition,
    fingerprint: sha256(canonicalJson(retentionProjection)),
  };
}

function validateSnapshot(record: ProductionTestRecordSnapshot): void {
  assertDocumentIdentity(record.documentName, record.collection, record.id);
  assertTimestamp(record.updateTime, "Document updateTime");
  if (!isSha256(record.descriptorDigest) || !isSha256(record.recordHash)) {
    refuse(
      "invalid_record_hash",
      "A record snapshot has a malformed descriptor or record hash.",
    );
  }
  if (!isSha256(record.retentionFingerprint)) {
    refuse(
      "invalid_retention_hash",
      "A record snapshot has a malformed retention fingerprint.",
    );
  }
  const { snapshotDigest, ...body } = record;
  if (!isSha256(snapshotDigest) || snapshotDigest !== sha256(canonicalJson(body))) {
    refuse("snapshot_tampered", "A record snapshot digest does not match its body.");
  }
}

function assertPitrCloneEvidence(
  backup: ProductionTestBackupEvidence,
  clone: ProductionTestPitrCloneEvidence,
  records: readonly Pick<ProductionTestRecordSnapshot, "documentName" | "recordHash">[],
): void {
  if (!clone.lroMetadata?.pitrSnapshot || !clone.lroResponse || !clone.databaseReadback) {
    refuse(
      "missing_clone_identity",
      "Clone evidence is missing its LRO metadata, LRO response, or database readback.",
    );
  }
  const [primaryFence, rollbackFence] = backup.intakeFences ?? [];
  if (
    backup.intakeFences?.length !== 2 ||
    primaryFence?.service !== "pmi-kc-app" ||
    rollbackFence?.service !== "pmi-kc-kb-demo" ||
    primaryFence.trafficPercent !== 100 ||
    rollbackFence.trafficPercent !== 100
  ) {
    refuse(
      "incomplete_intake_fence",
      "Backup evidence must bind the exact 100% fenced revisions for pmi-kc-app and the reachable pmi-kc-kb-demo rollback service.",
    );
  }
  for (const [label, value] of [
    ["backup reference", backup.backupRef],
    ["source database", backup.sourceDatabase],
    ["source database uid", backup.sourceDatabaseUid],
    ["pmi-kc-app intake-fence revision", primaryFence.revision],
    ["pmi-kc-kb-demo intake-fence revision", rollbackFence.revision],
    ["clone database", clone.cloneDatabase],
    ["clone source database", clone.sourceDatabase],
    ["clone operation", clone.operationRef],
    ["LRO destination database", clone.lroMetadata.destinationDatabase],
    ["LRO PITR source database", clone.lroMetadata.pitrSnapshot.database],
    ["LRO PITR source database uid", clone.lroMetadata.pitrSnapshot.databaseUid],
    ["LRO response database", clone.lroResponse.database],
    ["LRO response database uid", clone.lroResponse.databaseUid],
    ["clone readback database", clone.databaseReadback.database],
    ["clone readback database uid", clone.databaseReadback.databaseUid],
  ] as const) {
    if (typeof value !== "string" || !value.trim()) {
      refuse("invalid_backup_evidence", `Missing ${label}.`);
    }
  }
  assertS56DatabaseName(backup.sourceDatabase, "PITR source database");
  assertS56DatabaseName(clone.sourceDatabase, "Clone source database");
  assertS56DatabaseName(clone.cloneDatabase, "PITR clone database");
  if (clone.state !== "READY") {
    refuse(
      "unready_backup_clone",
      "The named PITR backup clone must be read back READY.",
    );
  }
  if (
    backup.sourcePitrEnablement !== "POINT_IN_TIME_RECOVERY_ENABLED" ||
    backup.sourceDeleteProtectionState !== "DELETE_PROTECTION_ENABLED" ||
    clone.lroDone !== true ||
    clone.lroMetadata.operationState !== "SUCCESSFUL"
  ) {
    refuse(
      "pitr_not_verified",
      "The live source must read back PITR-enabled with delete protection, and the clone LRO must be complete and SUCCESSFUL.",
    );
  }
  if (backup.sourceDatabase !== PRODUCTION_TEST_SOURCE_DATABASE) {
    refuse(
      "wrong_source_database",
      "The S56 count and backup must target the pinned Production database.",
    );
  }
  if (
    backup.backupRef !==
    productionTestPitrBackupRef(clone.cloneDatabase, backup.snapshotTime)
  ) {
    refuse(
      "invalid_backup_reference",
      "The backup reference must canonically bind the named PITR clone and exact snapshot.",
    );
  }
  if (
    clone.sourceDatabase !== backup.sourceDatabase ||
    !sameRfc3339Instant(clone.snapshotTime, backup.snapshotTime)
  ) {
    refuse(
      "clone_source_mismatch",
      "The verified clone does not identify the exact named PITR source and snapshot.",
    );
  }
  if (clone.cloneDatabase === backup.sourceDatabase) {
    refuse(
      "production_restore_target",
      "Restore rehearsal may not target the Production database.",
    );
  }
  if (
    clone.lroMetadata.destinationDatabase !== clone.cloneDatabase ||
    clone.lroMetadata.pitrSnapshot.database !== backup.sourceDatabase ||
    clone.lroMetadata.pitrSnapshot.databaseUid !== backup.sourceDatabaseUid ||
    !sameRfc3339Instant(
      clone.lroMetadata.pitrSnapshot.snapshotTime,
      backup.snapshotTime,
    ) ||
    clone.lroResponse.database !== clone.cloneDatabase ||
    clone.databaseReadback.database !== clone.cloneDatabase ||
    clone.lroResponse.databaseUid !== clone.databaseReadback.databaseUid ||
    clone.lroResponse.databaseUid === backup.sourceDatabaseUid ||
    clone.databaseReadback.locationId !== "us-central1" ||
    clone.databaseReadback.type !== "FIRESTORE_NATIVE" ||
    clone.databaseReadback.deleteTime !== null
  ) {
    refuse(
      "clone_identity_mismatch",
      "The completed clone LRO and destination database readback do not preserve the exact source, snapshot, destination, UID, location, type, and non-deleted identity.",
    );
  }
  if (
    clone.verification !== "manifest-record-hashes" ||
    clone.verifiedRecordCount !== records.length ||
    clone.verifiedAggregateHash !== productionTestRecordAggregateHash(records)
  ) {
    refuse(
      "clone_verification_mismatch",
      "The named PITR clone was not full-field hash-verified against the exact manifest record set.",
    );
  }
  assertTimestamp(backup.snapshotTime, "Backup snapshot timestamp");
  assertTimestamp(
    backup.sourceEarliestVersionTime,
    "Source earliest PITR version timestamp",
  );
  assertTimestamp(backup.verifiedAt, "Backup verification timestamp");
  assertTimestamp(
    primaryFence.deployedAt,
    "pmi-kc-app intake-fence deployment timestamp",
  );
  assertTimestamp(
    rollbackFence.deployedAt,
    "pmi-kc-kb-demo intake-fence deployment timestamp",
  );
  assertTimestamp(clone.verifiedAt, "Clone verification timestamp");
  if (
    compareRfc3339Instants(backup.snapshotTime, primaryFence.deployedAt) < 0 ||
    compareRfc3339Instants(backup.snapshotTime, rollbackFence.deployedAt) < 0
  ) {
    refuse(
      "prefence_backup",
      "The named backup predates at least one serving Test-intake fence.",
    );
  }
  if (compareRfc3339Instants(backup.snapshotTime, backup.sourceEarliestVersionTime) < 0) {
    refuse(
      "snapshot_outside_pitr_window",
      "The named snapshot predates the source database's read-back PITR window.",
    );
  }
  if (
    compareRfc3339Instants(backup.verifiedAt, backup.snapshotTime) < 0 ||
    compareRfc3339Instants(clone.verifiedAt, backup.snapshotTime) < 0
  ) {
    refuse(
      "premature_backup_verification",
      "Backup and clone verification timestamps cannot predate the PITR snapshot.",
    );
  }
}

function countsFor(
  records: readonly ProductionTestRetirementManifestRecord[],
): readonly { readonly collection: string; readonly count: number }[] {
  const counts = new Map(
    PRODUCTION_TEST_RECORD_CATALOG.map((descriptor) => [descriptor.collection, 0]),
  );
  for (const record of records) {
    counts.set(record.collection, (counts.get(record.collection) ?? 0) + 1);
  }
  return [...counts]
    .map(([collection, count]) => ({ collection, count }))
    .sort((left, right) => left.collection.localeCompare(right.collection));
}

function compareSnapshots(
  left: Pick<ProductionTestRecordSnapshot, "documentName">,
  right: Pick<ProductionTestRecordSnapshot, "documentName">,
): number {
  return left.documentName.localeCompare(right.documentName);
}

function sameDocumentOrder(
  left: readonly Pick<ProductionTestRecordSnapshot, "documentName">[],
  right: readonly Pick<ProductionTestRecordSnapshot, "documentName">[],
): boolean {
  return left.every(
    (record, index) => record.documentName === right[index]?.documentName,
  );
}

function decodeFirestoreString(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const stringValue = (value as { stringValue?: unknown }).stringValue;
  return typeof stringValue === "string" ? stringValue : undefined;
}

function decodeFirestoreBoolean(value: unknown): boolean | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const booleanValue = (value as { booleanValue?: unknown }).booleanValue;
  return typeof booleanValue === "boolean" ? booleanValue : undefined;
}

function assertDocumentIdentity(
  documentName: string,
  collection: string,
  id: string,
): void {
  if (
    !isDirectDocumentInDatabase(documentName, PRODUCTION_TEST_SOURCE_DATABASE) ||
    !collection.trim() ||
    !id.trim() ||
    collection.includes("/") ||
    id.includes("/")
  ) {
    refuse(
      "invalid_document_identity",
      "A retirement record has an invalid document identity.",
    );
  }
  const expected = `${PRODUCTION_TEST_SOURCE_DATABASE}/documents/${collection}/${id}`;
  if (documentName !== expected) {
    refuse(
      "document_identity_mismatch",
      "The Firestore document name does not match its governed collection and opaque id.",
    );
  }
}

function assertS56DatabaseName(value: string, label: string): void {
  if (
    !value.startsWith(PRODUCTION_TEST_DATABASE_PREFIX) ||
    !/^projects\/pmi-kc-kb-prod\/databases\/[^/]+$/.test(value)
  ) {
    refuse(
      "invalid_database",
      `${label} is not a direct database in the pinned pmi-kc-kb-prod project.`,
    );
  }
}

function isDirectDocumentInDatabase(value: string, database: string): boolean {
  const prefix = `${database}/documents/`;
  if (!value.startsWith(prefix)) return false;
  const segments = value.slice(prefix.length).split("/");
  return segments.length === 2 && segments.every((segment) => segment.length > 0);
}

function assertTimestamp(value: string, label: string): void {
  parseRfc3339Nanoseconds(value, label);
}

function sameRfc3339Instant(left: string, right: string): boolean {
  return (
    parseRfc3339Nanoseconds(left, "Timestamp") ===
    parseRfc3339Nanoseconds(right, "Timestamp")
  );
}

function compareRfc3339Instants(left: string, right: string): number {
  const leftNs = parseRfc3339Nanoseconds(left, "Timestamp");
  const rightNs = parseRfc3339Nanoseconds(right, "Timestamp");
  return leftNs < rightNs ? -1 : leftNs > rightNs ? 1 : 0;
}

function canonicalRfc3339Instant(value: string): string {
  const match = parseRfc3339Parts(value, "Timestamp");
  return `${match.prefix}${match.seconds}.${match.fraction.padEnd(9, "0")}Z`;
}

function parseRfc3339Nanoseconds(value: string, label: string): bigint {
  const match = parseRfc3339Parts(value, label);
  const base = `${match.prefix}${match.seconds}Z`;
  const baseMs = Date.parse(base);
  if (!Number.isFinite(baseMs)) {
    refuse("invalid_timestamp", `${label} is not a valid RFC3339 timestamp.`);
  }
  const canonicalBase = new Date(baseMs).toISOString().slice(0, 19);
  if (canonicalBase !== `${match.prefix}${match.seconds}`) {
    refuse("invalid_timestamp", `${label} is not a valid RFC3339 timestamp.`);
  }
  return BigInt(baseMs) * 1_000_000n + BigInt(match.fraction.padEnd(9, "0"));
}

function parseRfc3339Parts(
  value: string,
  label: string,
): { prefix: string; seconds: string; fraction: string } {
  const match =
    typeof value === "string"
      ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:)(\d{2})(?:\.(\d{1,9}))?Z$/.exec(value)
      : null;
  if (!match) {
    refuse("invalid_timestamp", `${label} is not a valid RFC3339 nanosecond timestamp.`);
  }
  return { prefix: match[1], seconds: match[2], fraction: match[3] ?? "" };
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Cannot hash a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  throw new TypeError(`Cannot hash ${typeof value}.`);
}

function refuse(code: string, message: string): never {
  throw new ProductionTestRetirementRefusal(code, message);
}
