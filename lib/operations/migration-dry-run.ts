import {
  PRODUCT_RECORD_COLLECTIONS,
  type ProductRecordCollection,
} from "@/lib/operations/product-record-retention";

/**
 * S40 AC-S40-5 / S56 AC-S56-3 — the legacy-record DELETE dry-run.
 *
 * Production accumulated invented `data_mode:test` records before Demo existed as its own project.
 * S56 superseded the move-to-Demo plan: the cutover has to delete them, and this plans that DELETE
 * without performing it. A v1 move plan is intentionally incompatible with this v2 contract.
 *
 * Three properties make the plan safe to look at and safe to act on:
 *
 *  - It never emits record CONTENT. A migration report circulates in packets and issue threads, so
 *    it carries counts, collection names, and opaque ids only — never a tenant name, an address, an
 *    email, or a body.
 *  - An unclassified record is a REFUSAL, not a default. `resolveStoredDataMode` treats a missing
 *    mode as Live on read paths (correct there — it protects real customer data), but using that
 *    default to decide what to DELETE would silently migrate live records. Here, missing or
 *    unrecognised classification stops the plan.
 *  - A Live record can never appear in the removal set. That is enforced structurally by
 *    partitioning on the parsed classification rather than by filtering a combined list.
 */

export const MIGRATION_DRY_RUN_VERSION = "migration-dry-run:v2-delete" as const;

export type MigrationRecordClassification = "live" | "test" | "unclassified";

export interface MigrationCandidateRecord {
  readonly id: string;
  readonly collection: string;
  /** The raw stored value. Deliberately `unknown`: anything unrecognised must refuse, not coerce. */
  readonly dataMode?: unknown;
}

export interface MigrationDryRunInput {
  readonly records: readonly MigrationCandidateRecord[];
  /** Opaque reference to the backup this migration would roll back to. */
  readonly backupRef?: string;
}

export interface MigrationCollectionPlan {
  readonly collection: ProductRecordCollection;
  readonly liveCount: number;
  readonly testCount: number;
  /** Opaque ids only — never content. */
  readonly testRecordIds: readonly string[];
}

export interface MigrationDryRunPlan {
  readonly version: typeof MIGRATION_DRY_RUN_VERSION;
  readonly semantics: "delete";
  readonly status: "ready" | "refused";
  readonly backupRef?: string;
  readonly rollbackTarget?: string;
  readonly collections: readonly MigrationCollectionPlan[];
  readonly totalLive: number;
  readonly totalTest: number;
  readonly refusals: readonly string[];
  /** Always false. A dry run plans; it never removes anything. */
  readonly executed: false;
}

export function classifyMigrationRecord(
  record: MigrationCandidateRecord,
): MigrationRecordClassification {
  if (record.dataMode === "live") return "live";
  if (record.dataMode === "test") return "test";
  return "unclassified";
}

function isProductCollection(value: string): value is ProductRecordCollection {
  return Object.hasOwn(PRODUCT_RECORD_COLLECTIONS, value);
}

/**
 * Plan the migration. Returns a refusal rather than a partial plan when anything is ambiguous: a
 * half-trusted migration plan is more dangerous than none, because its counts look authoritative.
 */
export function planMigrationDryRun(input: MigrationDryRunInput): MigrationDryRunPlan {
  const refusals: string[] = [];
  const byCollection = new Map<
    ProductRecordCollection,
    { live: number; testIds: string[] }
  >();

  if (!input.backupRef || !input.backupRef.trim()) {
    refusals.push(
      "A migration plan requires a backup reference to roll back to. Capture the backup first.",
    );
  }

  const seen = new Set<string>();
  for (const record of input.records) {
    const key = `${record.collection}/${record.id}`;
    if (seen.has(key)) {
      refusals.push(
        `${record.collection} contains a duplicate record; the record set is ambiguous.`,
      );
      continue;
    }
    seen.add(key);

    if (!record.id?.trim()) {
      refusals.push(`A record in ${record.collection} has no id.`);
      continue;
    }
    if (!isProductCollection(record.collection)) {
      refusals.push(
        `${record.collection} is not a governed product-record collection; it is out of scope for this migration.`,
      );
      continue;
    }

    const classification = classifyMigrationRecord(record);
    if (classification === "unclassified") {
      // Deliberately NOT defaulted to live. A default here would decide, silently, that an
      // unclassified record is safe to leave behind — the opposite of what a cutover needs to know.
      refusals.push(
        `${record.collection} contains a record with no explicit data classification. Classify it before migrating.`,
      );
      continue;
    }

    const bucket = byCollection.get(record.collection) ?? { live: 0, testIds: [] };
    if (classification === "live") {
      bucket.live += 1;
    } else {
      bucket.testIds.push(record.id);
    }
    byCollection.set(record.collection, bucket);
  }

  const collections = [...byCollection.entries()]
    .map(([collection, bucket]) => ({
      collection,
      liveCount: bucket.live,
      testCount: bucket.testIds.length,
      testRecordIds: Object.freeze([...bucket.testIds].sort()),
    }))
    .sort((left, right) => left.collection.localeCompare(right.collection));

  const totalLive = collections.reduce((sum, entry) => sum + entry.liveCount, 0);
  const totalTest = collections.reduce((sum, entry) => sum + entry.testCount, 0);

  if (refusals.length > 0) {
    return {
      version: MIGRATION_DRY_RUN_VERSION,
      semantics: "delete",
      status: "refused",
      collections: [],
      totalLive: 0,
      totalTest: 0,
      refusals: Object.freeze([...new Set(refusals)]),
      executed: false,
    };
  }

  return {
    version: MIGRATION_DRY_RUN_VERSION,
    semantics: "delete",
    status: "ready",
    backupRef: input.backupRef,
    rollbackTarget: input.backupRef,
    collections: Object.freeze(collections),
    totalLive,
    totalTest,
    refusals: Object.freeze([]),
    executed: false,
  };
}

/**
 * The exact set this DELETE would remove from Production.
 *
 * Built by re-deriving classification from the source records rather than by trusting the plan. The
 * two sets must be equal: using their intersection would silently accept a missing, newly-added, or
 * reclassified record and turn a stale plan into deletion authority.
 */
export function migrationRemovalSet(
  plan: MigrationDryRunPlan,
  records: readonly MigrationCandidateRecord[],
): readonly { collection: string; id: string }[] {
  if (plan.status !== "ready") {
    throw new Error("A refused migration plan has no removal set.");
  }
  if (
    plan.version !== MIGRATION_DRY_RUN_VERSION ||
    plan.semantics !== "delete" ||
    !plan.backupRef?.trim() ||
    !plan.rollbackTarget?.trim() ||
    plan.backupRef !== plan.rollbackTarget
  ) {
    throw new Error(
      "Refusing DELETE: the removal set requires an exact v2 DELETE plan with one named backup/rollback identity.",
    );
  }
  const planned = new Set(
    plan.collections.flatMap((entry) =>
      entry.testRecordIds.map((id) => `${entry.collection}/${id}`),
    ),
  );
  const currentTest = new Set<string>();
  const seen = new Set<string>();
  const removal = [];
  for (const record of records) {
    const key = `${record.collection}/${record.id}`;
    if (seen.has(key)) {
      throw new Error(
        `Refusing DELETE: ${record.collection} contains a duplicate record in the current set.`,
      );
    }
    seen.add(key);
    const classification = classifyMigrationRecord(record);
    if (classification === "unclassified") {
      throw new Error(
        `Refusing DELETE: ${record.collection} contains a record without an explicit classification. Rebuild the plan.`,
      );
    }
    if (classification === "test") currentTest.add(key);
    if (!planned.has(key)) continue;
    if (classification !== "test") {
      throw new Error(
        `Refusing DELETE: ${record.collection} contains a planned record that is not classified test. A DELETE never removes a Live record.`,
      );
    }
    removal.push({ collection: record.collection, id: record.id });
  }

  const missing = [...planned].filter((key) => !currentTest.has(key));
  const extra = [...currentTest].filter((key) => !planned.has(key));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Refusing DELETE: the current Test candidate set is not exactly the planned set (${missing.length} missing, ${extra.length} extra).`,
    );
  }
  return Object.freeze(
    removal.sort(
      (left, right) =>
        left.collection.localeCompare(right.collection) ||
        left.id.localeCompare(right.id),
    ),
  );
}

/** Bodyless operator summary. Record identifiers and content are deliberately omitted. */
export function formatMigrationDryRun(plan: MigrationDryRunPlan): string {
  if (plan.status === "refused") {
    return [
      `Migration dry run REFUSED (${plan.version}). Nothing was planned.`,
      ...plan.refusals.map((reason) => `  - ${reason}`),
    ].join("\n");
  }
  return [
    `Production Test DELETE dry run (${plan.version}) — nothing was executed.`,
    `Rollback target: ${plan.rollbackTarget}`,
    `Live records staying in Production: ${plan.totalLive}`,
    `Test records to delete: ${plan.totalTest}`,
    ...plan.collections.map(
      (entry) =>
        `  ${entry.collection}: ${entry.testCount} test / ${entry.liveCount} live`,
    ),
  ].join("\n");
}
