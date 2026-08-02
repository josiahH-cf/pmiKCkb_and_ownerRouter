import { describe, expect, it } from "vitest";

import {
  PRODUCTION_TEST_RECORD_CATALOG,
  type FirestoreRestFields,
} from "@/lib/operations/production-test-record-catalog";
import {
  PRODUCTION_TEST_RETIREMENT_AUTHORITY,
  PRODUCTION_TEST_RETIREMENT_MAX_DELETE_BATCH_SIZE,
  PRODUCTION_TEST_RETIREMENT_VERSION,
  PRODUCTION_TEST_SOURCE_DATABASE,
  assertExactProductionTestCandidateSet,
  buildProductionTestCasDeleteBatches,
  buildProductionTestCreateOnlyRestoreWrites,
  buildProductionTestRestoreProof,
  buildProductionTestRetirementManifest,
  createProductionTestRecordSnapshot,
  formatProductionTestRetirementCounts,
  productionTestDocumentNameHash,
  productionTestPitrBackupRef,
  productionTestRecordAggregateHash,
  validateProductionTestRestoreProof,
  validateProductionTestRetirementManifest,
  type ProductionTestBackupEvidence,
  type ProductionTestPitrCloneEvidence,
  type ProductionTestRecordSnapshot,
  type ProductionTestRestoreProof,
  type ProductionTestRetirementManifest,
} from "@/lib/operations/production-test-retirement";

const SOURCE_DATABASE = PRODUCTION_TEST_SOURCE_DATABASE;
const BACKUP_CLONE_DATABASE = "projects/pmi-kc-kb-prod/databases/s56-backup-clone";
const RESTORE_DRILL_DATABASE = "projects/pmi-kc-kb-prod/databases/s56-restore-drill";
const FENCE_AT = "2026-08-01T12:00:00.000Z";
const SNAPSHOT_AT = "2026-08-01T13:00:00.000Z";
const COUNTED_AT = SNAPSHOT_AT;
const VERIFIED_AT = "2026-08-01T15:00:00.000Z";
const SOURCE_DATABASE_UID = "source-database-uid";
const CLONE_DATABASE_UID = "clone-database-uid";

const BACKUP: ProductionTestBackupEvidence = {
  backupRef: productionTestPitrBackupRef(BACKUP_CLONE_DATABASE, SNAPSHOT_AT),
  sourceDatabase: SOURCE_DATABASE,
  sourceDatabaseUid: SOURCE_DATABASE_UID,
  sourcePitrEnablement: "POINT_IN_TIME_RECOVERY_ENABLED",
  sourceDeleteProtectionState: "DELETE_PROTECTION_ENABLED",
  sourceEarliestVersionTime: "2026-07-30T00:00:00.000Z",
  snapshotTime: SNAPSHOT_AT,
  verifiedAt: VERIFIED_AT,
  intakeFences: [
    {
      service: "pmi-kc-app",
      revision: "pmi-kc-app-fenced-revision",
      trafficPercent: 100,
      deployedAt: FENCE_AT,
    },
    {
      service: "pmi-kc-kb-demo",
      revision: "pmi-kc-kb-demo-fenced-revision",
      trafficPercent: 100,
      deployedAt: "2026-08-01T12:30:00.000Z",
    },
  ],
};

const CLONE_BASE = {
  cloneDatabase: BACKUP_CLONE_DATABASE,
  sourceDatabase: SOURCE_DATABASE,
  snapshotTime: SNAPSHOT_AT,
  state: "READY",
  operationRef: "projects/pmi-kc-kb-prod/databases/s56-backup-clone/operations/clone",
  lroDone: true,
  lroMetadata: {
    operationState: "SUCCESSFUL",
    destinationDatabase: BACKUP_CLONE_DATABASE,
    pitrSnapshot: {
      database: SOURCE_DATABASE,
      databaseUid: SOURCE_DATABASE_UID,
      snapshotTime: SNAPSHOT_AT,
    },
  },
  lroResponse: {
    database: BACKUP_CLONE_DATABASE,
    databaseUid: CLONE_DATABASE_UID,
  },
  databaseReadback: {
    database: BACKUP_CLONE_DATABASE,
    databaseUid: CLONE_DATABASE_UID,
    locationId: "us-central1",
    type: "FIRESTORE_NATIVE",
    deleteTime: null,
  },
  verification: "manifest-record-hashes",
  verifiedAt: VERIFIED_AT,
} as const;

function laneFields(
  mode: "live" | "test",
  extra: FirestoreRestFields = {},
): FirestoreRestFields {
  return { data_mode: { stringValue: mode }, ...extra };
}

function productLaneFields(
  mode: "live" | "test",
  legalHold = false,
  extra: FirestoreRestFields = {},
): FirestoreRestFields {
  return laneFields(mode, {
    product_retention_policy: { stringValue: "product-record-retention:v1.0" },
    product_retention_class: { stringValue: "indefinite" },
    legal_hold: { booleanValue: legalHold },
    ...extra,
  });
}

function snapshot(
  collection: string,
  id: string,
  fields: FirestoreRestFields,
  updateTime = "2026-08-01T13:30:00.000Z",
): ProductionTestRecordSnapshot {
  return createProductionTestRecordSnapshot({
    documentName: `${SOURCE_DATABASE}/documents/${collection}/${id}`,
    collection,
    id,
    updateTime,
    fields,
  });
}

function manifest(
  records: readonly ProductionTestRecordSnapshot[],
  backup: ProductionTestBackupEvidence = BACKUP,
  clone?: ProductionTestPitrCloneEvidence,
): ProductionTestRetirementManifest {
  const verifiedClone: ProductionTestPitrCloneEvidence = clone ?? {
    ...CLONE_BASE,
    verifiedRecordCount: records.filter((record) => record.classification === "test")
      .length,
    verifiedAggregateHash: productionTestRecordAggregateHash(
      records.filter((record) => record.classification === "test"),
    ),
  };
  return buildProductionTestRetirementManifest({
    records,
    backup,
    clone: verifiedClone,
    countedAt: COUNTED_AT,
  });
}

function proof(
  plan: ProductionTestRetirementManifest,
  overrides: Partial<
    Omit<ProductionTestRestoreProof, "version" | "status" | "proofDigest">
  > = {},
): ProductionTestRestoreProof {
  const record = plan.records[0];
  if (!record || !plan.clone) throw new Error("Test proof needs a backed-up record.");
  const relativeName = record.documentName.slice(SOURCE_DATABASE.length);
  return buildProductionTestRestoreProof({
    manifestDigest: plan.manifestDigest,
    catalogDigest: plan.catalogDigest,
    backupRef: plan.backup!.backupRef,
    backupCloneDatabase: plan.clone!.cloneDatabase,
    restoreTargetDatabase: RESTORE_DRILL_DATABASE,
    sourceDocumentNameHash: productionTestDocumentNameHash(
      `${plan.clone.cloneDatabase}${relativeName}`,
    ),
    restoredDocumentNameHash: productionTestDocumentNameHash(
      `${RESTORE_DRILL_DATABASE}${relativeName}`,
    ),
    sourceRecordHash: record.recordHash,
    restoredRecordHash: record.recordHash,
    cleanupVerified: true,
    verifiedAt: VERIFIED_AT,
    cleanupVerifiedAt: "2026-08-01T15:01:00.000Z",
    ...overrides,
  });
}

describe("S56 v2 DELETE manifest", () => {
  it("binds the exact owner decision, catalog, post-fence PITR clone, and all zero counts", () => {
    const testRecord = snapshot(
      "approval_queue_items",
      "opaque-test-id",
      productLaneFields("test"),
    );
    const liveRecord = snapshot(
      "maintenance_tickets",
      "opaque-live-id",
      productLaneFields("live"),
    );
    const mixedUnmarked = snapshot(
      "maintenance_unverified_intake_activity",
      "opaque-mixed-id",
      {},
    );
    const plan = manifest([liveRecord, mixedUnmarked, testRecord]);

    expect(plan.version).toBe(PRODUCTION_TEST_RETIREMENT_VERSION);
    expect(plan.semantics).toBe("delete");
    expect(plan.authority).toBe(PRODUCTION_TEST_RETIREMENT_AUTHORITY);
    expect(plan.records).toEqual([testRecord]);
    expect(plan.totalTest).toBe(1);
    expect(plan.counts).toHaveLength(PRODUCTION_TEST_RECORD_CATALOG.length);
    expect(plan.counts).toContainEqual({ collection: "approval_queue_items", count: 1 });
    expect(plan.counts).toContainEqual({ collection: "vendors", count: 0 });
    expect(() => validateProductionTestRetirementManifest(plan)).not.toThrow();
  });

  it("allows count evidence before backup but refuses to treat partial evidence as ready", () => {
    const record = snapshot("vendors", "v1", laneFields("test"));
    const counted = buildProductionTestRetirementManifest({
      records: [record],
      countedAt: COUNTED_AT,
    });
    expect(counted.phase).toBe("counted");
    expect(counted.backup).toBeNull();
    expect(counted.clone).toBeNull();
    expect(() => validateProductionTestRetirementManifest(counted)).not.toThrow();
    expect(() =>
      buildProductionTestRetirementManifest({
        records: [record],
        countedAt: COUNTED_AT,
        backup: BACKUP,
      }),
    ).toThrow(/both the named PITR identity and its verified clone/);
  });

  it("counts held and legacy Test rows before refusing only the legal hold", () => {
    const legacyWithoutRetention = snapshot(
      "approval_queue_items",
      "unknown",
      laneFields("test"),
    );
    const held = snapshot("maintenance_tickets", "held", productLaneFields("test", true));
    const counted = buildProductionTestRetirementManifest({
      records: [legacyWithoutRetention, held],
      countedAt: COUNTED_AT,
    });

    expect(counted.totalTest).toBe(2);
    expect(formatProductionTestRetirementCounts(counted)).toContain(
      "Total explicit Test records: 2",
    );
    expect(legacyWithoutRetention.retentionDisposition).toBe("owner_authorized");
    expect(() => manifest([legacyWithoutRetention, held])).toThrow(/legal hold/);
  });

  it("refuses malformed classification rather than defaulting or partially planning", () => {
    const unclassified = snapshot("vendors", "v1", {
      data_mode: { stringValue: "demo" },
    });

    expect(unclassified.classification).toBe("refused");
    expect(() => manifest([unclassified])).toThrow(
      /ambiguous or invalid explicit Test marker/,
    );
  });

  it("authorizes fully absent legacy retention but refuses partial metadata and every hold", () => {
    const legacyWithoutRetention = snapshot(
      "approval_queue_items",
      "legacy",
      laneFields("test"),
    );
    const partialRetention = snapshot(
      "approval_queue_items",
      "partial",
      laneFields("test", {
        product_retention_policy: {
          stringValue: "product-record-retention:v1.0",
        },
      }),
    );
    const held = snapshot("maintenance_tickets", "m1", productLaneFields("test", true));

    expect(() => manifest([legacyWithoutRetention])).not.toThrow();
    expect(() => manifest([partialRetention])).toThrow(/Unknown or malformed retention/);
    expect(() => manifest([held])).toThrow(/legal hold/);
  });

  it("refuses old semantics, altered authority, catalog drift, and manifest tampering", () => {
    const plan = manifest([snapshot("vendors", "v1", laneFields("test"))]);
    expect(() =>
      validateProductionTestRetirementManifest({
        ...plan,
        semantics: "move" as "delete",
      }),
    ).toThrow(/v2 DELETE/);
    expect(() =>
      validateProductionTestRetirementManifest({
        ...plan,
        authority: "owner-decision:other" as typeof PRODUCTION_TEST_RETIREMENT_AUTHORITY,
      }),
    ).toThrow(/exact S56 owner authority/);
    expect(() =>
      validateProductionTestRetirementManifest({
        ...plan,
        catalogDigest: "0".repeat(64),
      }),
    ).toThrow(/catalog changed/);
    expect(() =>
      validateProductionTestRetirementManifest({ ...plan, totalTest: 99 }),
    ).toThrow(/counts/);
  });

  it("refuses a pre-fence snapshot, wrong clone source, and a Production clone target", () => {
    const record = snapshot("vendors", "v1", laneFields("test"));
    expect(() =>
      manifest(
        record ? [record] : [],
        {
          ...BACKUP,
          backupRef: productionTestPitrBackupRef(
            BACKUP_CLONE_DATABASE,
            "2026-08-01T11:59:59.000Z",
          ),
          snapshotTime: "2026-08-01T11:59:59.000Z",
        },
        {
          ...CLONE_BASE,
          verifiedRecordCount: 1,
          verifiedAggregateHash: productionTestRecordAggregateHash([record]),
          snapshotTime: "2026-08-01T11:59:59.000Z",
          lroMetadata: {
            ...CLONE_BASE.lroMetadata,
            pitrSnapshot: {
              ...CLONE_BASE.lroMetadata.pitrSnapshot,
              snapshotTime: "2026-08-01T11:59:59.000Z",
            },
          },
        },
      ),
    ).toThrow(/predates/);
    expect(() =>
      manifest([record], BACKUP, {
        ...CLONE_BASE,
        sourceDatabase: "projects/pmi-kc-kb-prod/databases/other",
        verifiedRecordCount: 1,
        verifiedAggregateHash: productionTestRecordAggregateHash([record]),
      }),
    ).toThrow(/exact named PITR source/);
    expect(() =>
      manifest(
        [record],
        {
          ...BACKUP,
          backupRef: productionTestPitrBackupRef(SOURCE_DATABASE, SNAPSHOT_AT),
        },
        {
          ...CLONE_BASE,
          cloneDatabase: SOURCE_DATABASE,
          verifiedRecordCount: 1,
          verifiedAggregateHash: productionTestRecordAggregateHash([record]),
        },
      ),
    ).toThrow(/Production database/);
  });

  it("refuses an unbound backup name, another project, and pre-snapshot verification", () => {
    const record = snapshot("vendors", "v1", laneFields("test"));
    const clone = {
      ...CLONE_BASE,
      verifiedRecordCount: 1,
      verifiedAggregateHash: productionTestRecordAggregateHash([record]),
    };
    expect(() =>
      manifest([record], { ...BACKUP, backupRef: "arbitrary" }, clone),
    ).toThrow(/canonically bind/);
    expect(() =>
      manifest([record], BACKUP, {
        ...clone,
        cloneDatabase: "projects/other/databases/s56-backup-clone",
      }),
    ).toThrow(/pinned pmi-kc-kb-prod project/);
    expect(() =>
      manifest([record], { ...BACKUP, verifiedAt: "2026-08-01T12:59:59.000Z" }, clone),
    ).toThrow(/cannot predate/);
  });

  it("requires both currently reachable services to be 100% fenced before the snapshot", () => {
    const record = snapshot("vendors", "v1", laneFields("test"));
    const clone = {
      ...CLONE_BASE,
      verifiedRecordCount: 1,
      verifiedAggregateHash: productionTestRecordAggregateHash([record]),
    };
    expect(() =>
      manifest(
        [record],
        {
          ...BACKUP,
          intakeFences: [
            BACKUP.intakeFences[0],
          ] as unknown as ProductionTestBackupEvidence["intakeFences"],
        },
        clone,
      ),
    ).toThrow(/pmi-kc-app and the reachable pmi-kc-kb-demo/);
    expect(() =>
      manifest(
        [record],
        {
          ...BACKUP,
          intakeFences: [
            BACKUP.intakeFences[0],
            {
              ...BACKUP.intakeFences[1],
              trafficPercent: 99 as 100,
            },
          ],
        },
        clone,
      ),
    ).toThrow(/exact 100% fenced revisions/);
    expect(() =>
      manifest(
        [record],
        {
          ...BACKUP,
          intakeFences: [
            BACKUP.intakeFences[0],
            {
              ...BACKUP.intakeFences[1],
              deployedAt: "2026-08-01T13:00:01.000Z",
            },
          ],
        },
        clone,
      ),
    ).toThrow(/predates at least one serving/);
  });

  it("binds source PITR metadata, LRO snapshot identity, response UID, and GET readback", () => {
    const record = snapshot("vendors", "v1", laneFields("test"));
    const clone = {
      ...CLONE_BASE,
      verifiedRecordCount: 1,
      verifiedAggregateHash: productionTestRecordAggregateHash([record]),
    };
    expect(() =>
      manifest(
        [record],
        {
          ...BACKUP,
          sourcePitrEnablement:
            "POINT_IN_TIME_RECOVERY_DISABLED" as "POINT_IN_TIME_RECOVERY_ENABLED",
        },
        clone,
      ),
    ).toThrow(/PITR-enabled/);
    expect(() =>
      manifest(
        [record],
        {
          ...BACKUP,
          sourceDeleteProtectionState:
            "DELETE_PROTECTION_DISABLED" as "DELETE_PROTECTION_ENABLED",
        },
        clone,
      ),
    ).toThrow(/delete protection/);
    expect(() =>
      manifest([record], BACKUP, {
        ...clone,
        lroMetadata: {
          ...clone.lroMetadata,
          operationState: "FAILED" as "SUCCESSFUL",
        },
      }),
    ).toThrow(/complete and SUCCESSFUL/);
    expect(() =>
      manifest([record], BACKUP, {
        ...clone,
        lroMetadata: {
          ...clone.lroMetadata,
          pitrSnapshot: {
            ...clone.lroMetadata.pitrSnapshot,
            databaseUid: "wrong-source-uid",
          },
        },
      }),
    ).toThrow(/exact source, snapshot, destination, UID/);
    expect(() =>
      manifest([record], BACKUP, {
        ...clone,
        databaseReadback: {
          ...clone.databaseReadback,
          databaseUid: "different-destination-uid",
        },
      }),
    ).toThrow(/exact source, snapshot, destination, UID/);
    expect(() =>
      manifest(
        [record],
        {
          ...BACKUP,
          sourceEarliestVersionTime: "2026-08-01T13:00:01.000Z",
        },
        clone,
      ),
    ).toThrow(/PITR window/);
  });

  it("compares RFC3339 snapshot instants at nanosecond precision", () => {
    const record = snapshot("vendors", "v1", laneFields("test"));
    const base = {
      ...CLONE_BASE,
      verifiedRecordCount: 1,
      verifiedAggregateHash: productionTestRecordAggregateHash([record]),
    };
    expect(
      productionTestPitrBackupRef(BACKUP_CLONE_DATABASE, "2026-08-01T13:00:00Z"),
    ).toBe(
      productionTestPitrBackupRef(BACKUP_CLONE_DATABASE, "2026-08-01T13:00:00.000Z"),
    );
    expect(
      productionTestPitrBackupRef(
        BACKUP_CLONE_DATABASE,
        "2026-08-01T13:00:00.000000001Z",
      ),
    ).not.toBe(BACKUP.backupRef);
    expect(() =>
      manifest([record], BACKUP, {
        ...base,
        snapshotTime: "2026-08-01T13:00:00Z",
        lroMetadata: {
          ...base.lroMetadata,
          pitrSnapshot: {
            ...base.lroMetadata.pitrSnapshot,
            snapshotTime: "2026-08-01T13:00:00Z",
          },
        },
      }),
    ).not.toThrow();
    expect(() =>
      manifest([record], BACKUP, {
        ...base,
        snapshotTime: "2026-08-01T13:00:00.000000001Z",
        lroMetadata: {
          ...base.lroMetadata,
          pitrSnapshot: {
            ...base.lroMetadata.pitrSnapshot,
            snapshotTime: "2026-08-01T13:00:00.000000001Z",
          },
        },
      }),
    ).toThrow(/exact named PITR source and snapshot/);
  });
});

describe("exact immediate pre-delete set", () => {
  const planned = snapshot("vendors", "v1", laneFields("test"));
  const plan = manifest([planned]);

  it("accepts only the exact unchanged candidate set", () => {
    expect(() => assertExactProductionTestCandidateSet(plan, [planned])).not.toThrow();
  });

  it("refuses missing and extra candidates instead of accepting their intersection", () => {
    expect(() => assertExactProductionTestCandidateSet(plan, [])).toThrow(/missing/);
    const extra = snapshot("vendors", "v2", laneFields("test"));
    expect(() => assertExactProductionTestCandidateSet(plan, [planned, extra])).toThrow(
      /extra/,
    );
  });

  it("refuses reclassification, updateTime drift, record hash drift, and retention drift", () => {
    const reclassified = snapshot("vendors", "v1", laneFields("live"));
    expect(() => assertExactProductionTestCandidateSet(plan, [reclassified])).toThrow(
      /reclassified/,
    );

    const updated = snapshot(
      "vendors",
      "v1",
      laneFields("test"),
      "2026-08-01T13:31:00.000Z",
    );
    expect(() => assertExactProductionTestCandidateSet(plan, [updated])).toThrow(
      /updateTime/,
    );

    const changed = snapshot(
      "vendors",
      "v1",
      laneFields("test", { harmless_version: { integerValue: "2" } }),
    );
    expect(() => assertExactProductionTestCandidateSet(plan, [changed])).toThrow(/hash/);

    const productPlanned = snapshot(
      "approval_queue_items",
      "a1",
      productLaneFields("test"),
    );
    const productPlan = manifest([productPlanned]);
    const retentionChanged = snapshot(
      "approval_queue_items",
      "a1",
      productLaneFields("test", true),
    );
    expect(() =>
      assertExactProductionTestCandidateSet(productPlan, [retentionChanged]),
    ).toThrow(/retention/);
  });
});

describe("restore drill and effect payloads", () => {
  it("requires a digest-bound exact one-record restore into an isolated disposable database", () => {
    const plan = manifest([snapshot("vendors", "v1", laneFields("test"))]);
    const verified = proof(plan);

    expect(() => validateProductionTestRestoreProof(plan, verified)).not.toThrow();
    expect(() =>
      validateProductionTestRestoreProof(
        plan,
        proof(plan, { restoreTargetDatabase: SOURCE_DATABASE }),
      ),
    ).toThrow(/disposable database/);
    expect(() =>
      validateProductionTestRestoreProof(
        plan,
        proof(plan, { restoredRecordHash: "d".repeat(64) }),
      ),
    ).toThrow(/exact one-record round trip/);
    expect(() =>
      validateProductionTestRestoreProof(
        plan,
        proof(plan, { sourceDocumentNameHash: "a".repeat(64) }),
      ),
    ).toThrow(/one exact manifest record/);
    expect(() =>
      validateProductionTestRestoreProof(
        plan,
        proof(plan, {
          restoreTargetDatabase: "projects/other/databases/s56-restore-drill",
        }),
      ),
    ).toThrow(/pinned pmi-kc-kb-prod project/);
    expect(() =>
      validateProductionTestRestoreProof(plan, {
        ...verified,
        cleanupVerified: false as true,
      }),
    ).toThrow(/verify cleanup/);
  });

  it("refuses a phase bypass even when a counted manifest is paired with a forged proof", () => {
    const record = snapshot("vendors", "v1", laneFields("test"));
    const counted = buildProductionTestRetirementManifest({
      records: [record],
      countedAt: COUNTED_AT,
    });
    const forged = buildProductionTestRestoreProof({
      manifestDigest: counted.manifestDigest,
      catalogDigest: counted.catalogDigest,
      backupRef: BACKUP.backupRef,
      backupCloneDatabase: BACKUP_CLONE_DATABASE,
      restoreTargetDatabase: RESTORE_DRILL_DATABASE,
      sourceDocumentNameHash: "a".repeat(64),
      restoredDocumentNameHash: "b".repeat(64),
      sourceRecordHash: "c".repeat(64),
      restoredRecordHash: "c".repeat(64),
      cleanupVerified: true,
      verifiedAt: VERIFIED_AT,
      cleanupVerifiedAt: "2026-08-01T15:01:00.000Z",
    });

    expect(() => buildProductionTestCasDeleteBatches(counted, [record], forged)).toThrow(
      /requires the named PITR identity/,
    );
  });

  it("builds an exists:false create and refuses zero or multiple rehearsal records", () => {
    const fields = laneFields("test");
    const target = `${RESTORE_DRILL_DATABASE}/documents/s56_restore_proof/one`;
    expect(
      buildProductionTestCreateOnlyRestoreWrites(
        [{ documentName: target, fields }],
        RESTORE_DRILL_DATABASE,
      ),
    ).toEqual([
      {
        update: { name: target, fields },
        currentDocument: { exists: false },
      },
    ]);
    expect(() =>
      buildProductionTestCreateOnlyRestoreWrites([], RESTORE_DRILL_DATABASE),
    ).toThrow(/at least one/);
    const second = `${RESTORE_DRILL_DATABASE}/documents/s56_restore_proof/two`;
    expect(
      buildProductionTestCreateOnlyRestoreWrites(
        [
          { documentName: second, fields },
          { documentName: target, fields },
        ],
        RESTORE_DRILL_DATABASE,
      ),
    ).toHaveLength(2);
    expect(() =>
      buildProductionTestCreateOnlyRestoreWrites(
        [{ documentName: `${SOURCE_DATABASE}/documents/vendors/v1`, fields }],
        RESTORE_DRILL_DATABASE,
      ),
    ).toThrow(/explicit destination database/);
    expect(() =>
      buildProductionTestCreateOnlyRestoreWrites(
        [
          {
            documentName: `${RESTORE_DRILL_DATABASE}/documents/parent/p1/nested/n1`,
            fields,
          },
        ],
        RESTORE_DRILL_DATABASE,
      ),
    ).toThrow(/direct document/);
  });

  it("builds deterministic one-record Firestore REST CAS delete batches", () => {
    const records = Array.from({ length: 205 }, (_, index) =>
      snapshot(
        "lease_renewal_test_action_attempts",
        `opaque-${String(204 - index).padStart(3, "0")}`,
        laneFields("test"),
      ),
    );
    const plan = manifest(records);
    const batches = buildProductionTestCasDeleteBatches(plan, records, proof(plan));

    expect(PRODUCTION_TEST_RETIREMENT_MAX_DELETE_BATCH_SIZE).toBe(1);
    expect(batches).toHaveLength(205);
    expect(batches.every((batch) => batch.writes.length === 1)).toBe(true);
    expect(batches.flatMap((batch) => batch.writes).map((write) => write.delete)).toEqual(
      [...records].map((record) => record.documentName).sort(),
    );
    for (const write of batches.flatMap((batch) => batch.writes)) {
      expect(write.currentDocument.updateTime).toBe("2026-08-01T13:30:00.000Z");
    }
  });
});

describe("counts-only public evidence", () => {
  it("prints every governed collection including zero without ids, refs, hashes, or fields", () => {
    const id = "must-not-leak-id";
    const plan = manifest([snapshot("vendors", id, laneFields("test"))]);
    const output = formatProductionTestRetirementCounts(plan);

    expect(output).toContain("DELETE semantics");
    expect(output).toContain("Total explicit Test records: 1");
    expect(output).toContain("vendors: 1");
    expect(output).toContain("workflow_runs: 0");
    for (const forbidden of [
      id,
      BACKUP.backupRef,
      plan.manifestDigest,
      "data_mode",
      "legal_hold",
    ]) {
      expect(output).not.toContain(forbidden);
    }
  });
});
