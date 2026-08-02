import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  PRODUCTION_TEST_RECORD_CATALOG,
  classifyProductionTestRecord,
  findProductionTestRecordDescriptor,
  type FirestoreRestFields,
  type ProductionTestRecordDescriptor,
} from "../lib/operations/production-test-record-catalog";
import {
  buildProductionTestCasDeleteBatches,
  buildProductionTestCreateOnlyRestoreWrites,
  buildProductionTestRestoreProof,
  buildProductionTestRetirementManifest,
  createProductionTestRecordSnapshot,
  formatProductionTestRetirementCounts,
  PRODUCTION_TEST_RETIREMENT_MAX_DELETE_BATCH_SIZE,
  productionTestPitrBackupRef,
  productionTestRecordAggregateHash,
  validateProductionTestRestoreProof,
  validateProductionTestRetirementManifest,
  assertExactProductionTestCandidateSet,
  type ProductionTestRecordSnapshot,
  type ProductionTestBackupEvidence,
  type ProductionTestPitrCloneEvidence,
  type ProductionTestRestoreProof,
  type ProductionTestRetirementManifest,
} from "../lib/operations/production-test-retirement";

export const S56_PROJECT = "pmi-kc-kb-prod" as const;
export const S56_DATABASE = "(default)" as const;
export const S56_LOCATION = "us-central1" as const;
export const S56_SECURE_MANIFEST_ROOT = resolve(
  "/tmp",
  `pmi-kc-s56-retirement-${process.getuid?.() ?? "current"}`,
);
export const S56_MANIFEST_DEFAULT = resolve(
  S56_SECURE_MANIFEST_ROOT,
  "s56-production-test-retirement.json",
);
export const S56_FIRESTORE_COMMIT_MAX_WRITES = 100;
export const S56_FIRESTORE_COMMIT_MAX_SERIALIZED_BYTES = 4 * 1024 * 1024;
export const S56_RETIREMENT_COMMIT_MAX_WRITES =
  PRODUCTION_TEST_RETIREMENT_MAX_DELETE_BATCH_SIZE;

const FIRESTORE_API = "https://firestore.googleapis.com/v1";
const MANAGED_DOMAIN = "pmikcmetro.com";
const OPERATION_POLL_MS = 2_000;
const OPERATION_TIMEOUT_MS = 20 * 60 * 1_000;
const RESTORE_DRILL_PREFIX = "s56-restore-drill-";
const BACKUP_PREFIX = "s56-test-retirement-";

export type S56Phase =
  | "count"
  | "clone-backup"
  | "verify-backup"
  | "rehearse-restore"
  | "delete"
  | "verify-zero"
  | "restore-deleted";

export interface S56Arguments {
  readonly phase: S56Phase;
  readonly project: typeof S56_PROJECT;
  readonly database: typeof S56_DATABASE;
  readonly location: typeof S56_LOCATION;
  readonly manifestPath: string;
  readonly backupDatabase?: string;
  readonly restoreDrillDatabase?: string;
  readonly execute: boolean;
  readonly confirm?: string;
  readonly manifestDigest?: string;
  readonly replaceManifest: boolean;
}

export interface CommandResult {
  readonly stdout: string;
}

export type ExecFileTransport = (
  file: string,
  args: readonly string[],
  options: { readonly env: NodeJS.ProcessEnv; readonly timeout: number },
) => Promise<CommandResult>;

export interface FetchTransport {
  (url: string, init: RequestInit): Promise<Response>;
}

export interface S56RuntimeDependencies {
  readonly execFile?: ExecFileTransport;
  readonly fetch?: FetchTransport;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly stdout?: (line: string) => void;
}

interface FirestoreDocument {
  readonly name: string;
  readonly fields?: FirestoreRestFields;
  readonly createTime?: string;
  readonly updateTime?: string;
}

interface RunQueryResponse {
  readonly document?: FirestoreDocument;
  readonly readTime?: string;
}

interface BatchGetResponse {
  readonly found?: FirestoreDocument;
  readonly missing?: string;
  readonly readTime?: string;
}

interface GoogleLongRunningOperation {
  readonly name: string;
  readonly done?: boolean;
  readonly error?: { readonly code?: number; readonly message?: string };
  readonly response?: unknown;
  readonly metadata?: unknown;
}

interface PendingCloneRequest {
  readonly database: string;
  readonly operation: string;
  readonly sourceReadTime: string;
  readonly state: "REQUESTED";
  readonly intakeFences: IntakeFenceTuple;
  readonly sourceDatabase: SourceDatabaseEvidence;
  readonly requestedAt: string;
}

interface CloneVerificationEvidence extends Omit<PendingCloneRequest, "state"> {
  readonly state: "READY";
  readonly clonedAt: string;
  readonly cloneDatabaseUid: string;
  readonly lroMetadata: Readonly<{
    operationState: "SUCCESSFUL";
    destinationDatabase: string;
    pitrSnapshot: Readonly<{
      database: string;
      databaseUid: string;
      snapshotTime: string;
    }>;
  }>;
  readonly lroResponse: Readonly<{ database: string; databaseUid: string }>;
  readonly databaseReadback: Readonly<{
    database: string;
    databaseUid: string;
    locationId: "us-central1";
    type: "FIRESTORE_NATIVE";
    deleteTime: null;
  }>;
  readonly verifiedAt?: string;
  readonly verifiedRecordCount?: number;
  readonly aggregateHash?: string;
}

type PendingCloneEvidence = PendingCloneRequest | CloneVerificationEvidence;

type IntakeFenceTuple = readonly [
  Readonly<{
    service: "pmi-kc-app";
    revision: string;
    trafficPercent: 100;
    deployedAt: string;
  }>,
  Readonly<{
    service: "pmi-kc-kb-demo";
    revision: string;
    trafficPercent: 100;
    deployedAt: string;
  }>,
];

interface SourceDatabaseEvidence {
  readonly uid: string;
  readonly earliestVersionTime: string;
  readonly pitrEnablement: "POINT_IN_TIME_RECOVERY_ENABLED";
  readonly deleteProtectionState: "DELETE_PROTECTION_ENABLED";
  readonly readAt: string;
}

export interface DeletionEvidence {
  readonly completedAt: string;
  readonly deletedCount: number;
  readonly commitTimes?: readonly string[];
  readonly zeroVerifiedAt?: string;
  readonly journalReconciliation?: "zero_snapshot_proved_unjournaled_commits";
  readonly journalReconciledAt?: string;
}

function assertDeletionJournalIntegrity(prior: DeletionEvidence): readonly string[] {
  if (!Number.isInteger(prior.deletedCount) || prior.deletedCount < 0) {
    throw new Error("Deletion journal count is invalid.");
  }
  if (!isIsoTimestamp(prior.completedAt)) {
    throw new Error("Deletion journal completion timestamp is invalid.");
  }
  const times = prior.commitTimes ?? [];
  for (let index = 0; index < times.length; index += 1) {
    const current = times[index]!;
    if (!isIsoTimestamp(current)) {
      throw new Error("Deletion journal contains an invalid commit timestamp.");
    }
    if (index > 0 && compareFirestoreTimestamps(current, times[index - 1]!) < 0) {
      throw new Error("Deletion journal commit timestamps regress.");
    }
  }
  if (
    times.length > 0 &&
    compareFirestoreTimestamps(times.at(-1)!, prior.completedAt) !== 0
  ) {
    throw new Error("Deletion journal completion does not match its final commit.");
  }

  const reconciled =
    prior.journalReconciliation === "zero_snapshot_proved_unjournaled_commits";
  if (
    reconciled !== Boolean(prior.journalReconciledAt) ||
    (prior.journalReconciledAt && !isIsoTimestamp(prior.journalReconciledAt)) ||
    (prior.zeroVerifiedAt && !isIsoTimestamp(prior.zeroVerifiedAt))
  ) {
    throw new Error("Deletion journal reconciliation markers are inconsistent.");
  }
  const expectedCommitCount = reconciled
    ? Math.max(0, prior.deletedCount - 1)
    : prior.deletedCount;
  if (times.length !== expectedCommitCount) {
    throw new Error(
      "Deletion journal timestamp count does not match its one-record commits.",
    );
  }
  return times;
}

export function appendDeletionCommitEvidence(
  prior: DeletionEvidence,
  commitTime: string,
  deletedInBatch: number,
): DeletionEvidence {
  if (!isIsoTimestamp(commitTime))
    throw new Error("Delete journal commitTime is invalid.");
  if (deletedInBatch !== S56_RETIREMENT_COMMIT_MAX_WRITES) {
    throw new Error("Delete journal entries must describe exactly one committed record.");
  }
  const priorTimes = assertDeletionJournalIntegrity(prior);
  if (prior.zeroVerifiedAt || prior.journalReconciliation) {
    throw new Error("A zero-sealed deletion journal cannot accept another commit.");
  }
  const previous = priorTimes.at(-1) ?? prior.completedAt;
  if (compareFirestoreTimestamps(commitTime, previous) < 0) {
    throw new Error("Delete journal commitTime regressed.");
  }
  return {
    completedAt: commitTime,
    deletedCount: prior.deletedCount + deletedInBatch,
    commitTimes: [...priorTimes, commitTime],
  };
}

export function sealZeroDeletionEvidence(
  prior: DeletionEvidence,
  totalTest: number,
  zeroVerifiedAt: string,
): DeletionEvidence {
  assertDeletionJournalIntegrity(prior);
  if (!Number.isInteger(totalTest) || totalTest < 0) {
    throw new Error("Deletion evidence totalTest is invalid.");
  }
  if (!isIsoTimestamp(zeroVerifiedAt)) {
    throw new Error("Deletion zero verification timestamp is invalid.");
  }
  if (compareFirestoreTimestamps(zeroVerifiedAt, prior.completedAt) < 0) {
    throw new Error("Deletion zero verification predates the journal.");
  }
  if (prior.deletedCount > totalTest) {
    throw new Error("Deletion journal count exceeds the sealed manifest total.");
  }
  if (prior.deletedCount === totalTest) {
    return { ...prior, deletedCount: totalTest, zeroVerifiedAt };
  }
  if (totalTest - prior.deletedCount !== 1 || prior.zeroVerifiedAt) {
    throw new Error(
      "Zero reconciliation permits at most one accepted-but-unjournaled one-record commit.",
    );
  }
  return {
    ...prior,
    deletedCount: totalTest,
    zeroVerifiedAt,
    journalReconciliation: "zero_snapshot_proved_unjournaled_commits",
    journalReconciledAt: zeroVerifiedAt,
  };
}

interface RollbackEvidence {
  readonly completedAt: string;
  readonly restoredCount: number;
  readonly aggregateHash: string;
}

interface RestoreDrillBase {
  readonly database: string;
  readonly databaseResource: string;
  readonly manifestDigest: string;
  readonly catalogDigest: string;
  readonly sourceDocumentNameHash: string;
  readonly restoredDocumentNameHash: string;
  readonly sourceRecordHash: string;
  readonly absenceVerifiedAt: string;
  readonly intendedAt: string;
}

interface RestoreDrillDatabaseIdentity {
  readonly resource: string;
  readonly uid: string;
  readonly createTime: string;
  readonly locationId: "us-central1";
  readonly type: "FIRESTORE_NATIVE";
  readonly deleteProtectionState: "DELETE_PROTECTION_DISABLED";
  readonly etag: string;
}

type RestoreDrillReadyFields = RestoreDrillBase & {
  readonly createOperation: string | null;
  readonly readyAt: string;
  readonly identity: RestoreDrillDatabaseIdentity;
};

type RestoreDrillRestoredFields = RestoreDrillReadyFields & {
  readonly restoredRecordHash: string;
  readonly restoredVerifiedAt: string;
};

export type RestoreDrillState =
  | (RestoreDrillBase & { readonly state: "INTENDED" })
  | (RestoreDrillBase & {
      readonly state: "CREATE_REQUESTED";
      readonly createOperation: string;
      readonly requestedAt: string;
    })
  | (RestoreDrillReadyFields & { readonly state: "READY" })
  | (RestoreDrillRestoredFields & { readonly state: "RESTORE_VERIFIED" })
  | (RestoreDrillRestoredFields & {
      readonly state: "CLEANUP_REQUESTED";
      readonly deleteOperation: string | null;
      readonly cleanupRequestedAt: string;
    })
  | (RestoreDrillRestoredFields & {
      readonly state: "CLEANUP_VERIFIED";
      readonly cleanupVerifiedAt: string;
    });

export interface S56OperatorManifest {
  readonly operatorVersion: "s56-production-test-retirement-operator:v1";
  readonly project: typeof S56_PROJECT;
  readonly database: typeof S56_DATABASE;
  readonly location: typeof S56_LOCATION;
  readonly readTime: string;
  readonly sourceDatabase: SourceDatabaseEvidence;
  readonly inventoriedCollections: readonly string[];
  readonly retirement: ProductionTestRetirementManifest;
  readonly pendingClone?: PendingCloneEvidence;
  readonly restoreDrill?: RestoreDrillState;
  readonly restoreProof?: ProductionTestRestoreProof;
  readonly deletion?: DeletionEvidence;
  readonly rollback?: RollbackEvidence;
}

interface InventoryResult {
  readonly readTime: string;
  readonly actualCollections: readonly string[];
  readonly records: readonly ProductionTestRecordSnapshot[];
  readonly counts: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

const PHASES = new Set<S56Phase>([
  "count",
  "clone-backup",
  "verify-backup",
  "rehearse-restore",
  "delete",
  "verify-zero",
  "restore-deleted",
]);

const MUTATION_CONFIRMATIONS: Readonly<Partial<Record<S56Phase, string>>> = Object.freeze(
  {
    "clone-backup": "CLONE_S56_BACKUP",
    "rehearse-restore": "REHEARSE_S56_RESTORE",
    delete: "DELETE_S56_TEST_RECORDS",
    "restore-deleted": "RESTORE_S56_DELETED_RECORDS",
  },
);

const KNOWN_OPTIONS = new Set([
  "project",
  "database",
  "location",
  "manifest",
  "backup-database",
  "restore-drill-database",
  "confirm",
  "manifest-digest",
]);

export function parseS56Arguments(argv: readonly string[]): S56Arguments {
  const [phaseValue, ...rest] = argv;
  if (!phaseValue || !PHASES.has(phaseValue as S56Phase)) {
    throw new Error(
      "The first argument must be one of count, clone-backup, verify-backup, rehearse-restore, delete, verify-zero, or restore-deleted.",
    );
  }

  const values = new Map<string, string>();
  let execute = false;
  let replaceManifest = false;
  for (const arg of rest) {
    if (arg === "--execute") {
      if (execute) throw new Error("--execute may be supplied only once.");
      execute = true;
      continue;
    }
    if (arg === "--replace-manifest") {
      if (replaceManifest)
        throw new Error("--replace-manifest may be supplied only once.");
      replaceManifest = true;
      continue;
    }
    if (!arg.startsWith("--") || !arg.includes("=")) {
      throw new Error(`Unrecognised argument ${JSON.stringify(arg)}.`);
    }
    const separator = arg.indexOf("=");
    const key = arg.slice(2, separator);
    const value = arg.slice(separator + 1).trim();
    if (!KNOWN_OPTIONS.has(key) || !value || values.has(key)) {
      throw new Error(`Invalid or duplicate --${key} option.`);
    }
    values.set(key, value);
  }

  const project = values.get("project") ?? S56_PROJECT;
  const database = values.get("database") ?? S56_DATABASE;
  const location = values.get("location") ?? S56_LOCATION;
  if (project !== S56_PROJECT) {
    throw new Error(`S56 is hard-pinned to project ${S56_PROJECT}.`);
  }
  if (database !== S56_DATABASE) {
    throw new Error(`S56 is hard-pinned to database ${S56_DATABASE}.`);
  }
  if (location !== S56_LOCATION) {
    throw new Error(`S56 is hard-pinned to location ${S56_LOCATION}.`);
  }

  const phase = phaseValue as S56Phase;
  const expectedConfirmation = MUTATION_CONFIRMATIONS[phase];
  if (expectedConfirmation) {
    if (!execute) {
      throw new Error(`${phase} is a mutation and requires --execute.`);
    }
    if (values.get("confirm") !== expectedConfirmation) {
      throw new Error(`${phase} requires --confirm=${expectedConfirmation}.`);
    }
    if (!/^[a-f0-9]{64}$/.test(values.get("manifest-digest") ?? "")) {
      throw new Error(`${phase} requires --manifest-digest=<exact 64-hex digest>.`);
    }
  } else if (execute || values.has("confirm") || values.has("manifest-digest")) {
    throw new Error(`${phase} is read-only and refuses mutation confirmation flags.`);
  }

  if (replaceManifest && phase !== "count") {
    throw new Error("--replace-manifest is valid only for the read-only count phase.");
  }

  const backupDatabase = values.get("backup-database");
  if (phase === "clone-backup" && !isNamedDatabase(backupDatabase, BACKUP_PREFIX)) {
    throw new Error(
      `clone-backup requires --backup-database with the ${BACKUP_PREFIX} prefix.`,
    );
  }
  if (phase !== "clone-backup" && backupDatabase) {
    throw new Error("--backup-database is valid only for clone-backup.");
  }
  const restoreDrillDatabase = values.get("restore-drill-database");
  if (
    phase === "rehearse-restore" &&
    !isNamedDatabase(restoreDrillDatabase, RESTORE_DRILL_PREFIX)
  ) {
    throw new Error(
      `rehearse-restore requires --restore-drill-database with the ${RESTORE_DRILL_PREFIX} prefix.`,
    );
  }
  if (phase !== "rehearse-restore" && restoreDrillDatabase) {
    throw new Error("--restore-drill-database is valid only for rehearse-restore.");
  }

  return {
    phase,
    project: S56_PROJECT,
    database: S56_DATABASE,
    location: S56_LOCATION,
    manifestPath: values.get("manifest") ?? S56_MANIFEST_DEFAULT,
    backupDatabase,
    restoreDrillDatabase,
    execute,
    confirm: values.get("confirm"),
    manifestDigest: values.get("manifest-digest"),
    replaceManifest,
  };
}

function isNamedDatabase(value: string | undefined, prefix: string): value is string {
  return Boolean(
    value &&
    value !== S56_DATABASE &&
    value.startsWith(prefix) &&
    /^[a-z][a-z0-9-]{3,61}[a-z0-9]$/.test(value),
  );
}

export function assertPinnedEnvironment(
  args: S56Arguments,
  env: NodeJS.ProcessEnv,
): void {
  if (env.FIRESTORE_EMULATOR_HOST?.trim()) {
    throw new Error("S56 Production retirement refuses FIRESTORE_EMULATOR_HOST.");
  }
  for (const key of [
    "GOOGLE_CLOUD_PROJECT",
    "GCLOUD_PROJECT",
    "GCP_PROJECT_ID",
  ] as const) {
    const value = env[key]?.trim();
    if (value && value !== args.project) {
      throw new Error(`${key} points at a different project; refusing S56.`);
    }
  }
  for (const key of ["FIRESTORE_DATABASE", "FIRESTORE_DATABASE_ID"] as const) {
    const value = env[key]?.trim();
    if (value && value !== args.database) {
      throw new Error(`${key} points at a different database; refusing S56.`);
    }
  }
}

export function assertS56PhaseAuthorization(args: S56Arguments): void {
  const expectedConfirmation = MUTATION_CONFIRMATIONS[args.phase];
  if (expectedConfirmation) {
    if (!args.execute) {
      throw new Error(`${args.phase} is a mutation and requires --execute.`);
    }
    if (args.confirm !== expectedConfirmation) {
      throw new Error(`${args.phase} requires --confirm=${expectedConfirmation}.`);
    }
    if (!/^[a-f0-9]{64}$/.test(args.manifestDigest ?? "")) {
      throw new Error(`${args.phase} requires --manifest-digest=<exact 64-hex digest>.`);
    }
    return;
  }
  if (args.execute || args.confirm || args.manifestDigest) {
    throw new Error(
      `${args.phase} is read-only and refuses mutation confirmation flags.`,
    );
  }
}

export async function acquireManagedGcloudAccess(
  env: NodeJS.ProcessEnv,
  transport: ExecFileTransport = defaultExecFile,
): Promise<{ readonly account: string; readonly accessToken: string }> {
  const gcloud = env.GCLOUD_BIN?.trim() || "gcloud";
  const childEnv: NodeJS.ProcessEnv = { ...env };
  if (env.CLOUDSDK_CONFIG?.trim()) childEnv.CLOUDSDK_CONFIG = env.CLOUDSDK_CONFIG.trim();

  const configuredProject = cleanSingleLine(
    (
      await safeExecGcloud(
        transport,
        gcloud,
        ["config", "get-value", "project", "--quiet"],
        childEnv,
      )
    ).stdout,
    "configured gcloud project",
  );
  if (configuredProject !== S56_PROJECT) {
    throw new Error(`The active gcloud configuration is not pinned to ${S56_PROJECT}.`);
  }

  const account = cleanSingleLine(
    (
      await safeExecGcloud(
        transport,
        gcloud,
        ["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"],
        childEnv,
      )
    ).stdout,
    "active gcloud account",
  ).toLowerCase();
  if (!isManagedAccount(account)) {
    throw new Error("The active gcloud account is not a managed PMI KC identity.");
  }

  const accessToken = cleanSingleLine(
    (
      await safeExecGcloud(
        transport,
        gcloud,
        ["auth", "print-access-token", `--account=${account}`, "--quiet"],
        childEnv,
      )
    ).stdout,
    "gcloud access token",
  );
  return { account, accessToken };
}

function isManagedAccount(account: string): boolean {
  return (
    account.endsWith(`@${MANAGED_DOMAIN}`) ||
    account.endsWith(`@${S56_PROJECT}.iam.gserviceaccount.com`)
  );
}

function cleanSingleLine(value: string, label: string): string {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) throw new Error(`Expected exactly one ${label}.`);
  return lines[0];
}

async function safeExecGcloud(
  transport: ExecFileTransport,
  file: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  try {
    return await transport(file, args, { env, timeout: 30_000 });
  } catch {
    throw new Error(`gcloud ${args.slice(0, 3).join(" ")} failed.`);
  }
}

const defaultExecFile: ExecFileTransport = (file, args, options) =>
  new Promise((resolvePromise, rejectPromise) => {
    execFile(
      file,
      [...args],
      { env: options.env, encoding: "utf8", timeout: options.timeout },
      (error, stdout) => {
        if (error) {
          rejectPromise(error);
        } else {
          resolvePromise({ stdout });
        }
      },
    );
  });

class FirestoreRestHttpError extends Error {
  constructor(readonly status: number) {
    super(`Firestore Admin REST refused the request with HTTP ${status}.`);
    this.name = "FirestoreRestHttpError";
  }
}

export class FirestoreRestClient {
  readonly #project: string;
  readonly #database: string;
  readonly #accessToken: string;
  readonly #fetch: FetchTransport;

  constructor(input: {
    readonly project: string;
    readonly database: string;
    readonly accessToken: string;
    readonly fetch?: FetchTransport;
  }) {
    if (input.project !== S56_PROJECT || input.database !== S56_DATABASE) {
      throw new Error("FirestoreRestClient refuses a non-Production source target.");
    }
    this.#project = input.project;
    this.#database = input.database;
    this.#accessToken = input.accessToken;
    this.#fetch = input.fetch ?? fetch;
  }

  databaseName(database = this.#database): string {
    return `projects/${this.#project}/databases/${database}`;
  }

  documentRoot(database = this.#database): string {
    return `${this.databaseName(database)}/documents`;
  }

  documentApiRoot(database = this.#database): string {
    return `${FIRESTORE_API}/${this.documentRoot(database)}`;
  }

  async listTopLevelCollectionIds(readTime: string): Promise<readonly string[]> {
    const ids = new Set<string>();
    let pageToken: string | undefined;
    do {
      const body: Record<string, unknown> = { pageSize: 1_000, readTime };
      if (pageToken) body.pageToken = pageToken;
      const response = await this.requestJson<{
        readonly collectionIds?: readonly string[];
        readonly nextPageToken?: string;
      }>(`${this.documentApiRoot()}:listCollectionIds`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      for (const id of response.collectionIds ?? []) ids.add(id);
      pageToken = response.nextPageToken || undefined;
    } while (pageToken);
    return [...ids].sort();
  }

  async runProjectedCollectionQuery(
    collection: string,
    fieldPaths: readonly string[],
    readTime: string,
    database = this.#database,
  ): Promise<readonly FirestoreDocument[]> {
    const responses = await this.requestJson<readonly RunQueryResponse[]>(
      `${this.documentApiRoot(database)}:runQuery`,
      {
        method: "POST",
        body: JSON.stringify({
          structuredQuery: {
            select: { fields: fieldPaths.map((fieldPath) => ({ fieldPath })) },
            from: [{ collectionId: collection }],
          },
          readTime,
        }),
      },
    );
    if (
      responses.length < 1 ||
      responses.some(
        (entry) =>
          !entry.readTime || compareFirestoreTimestamps(entry.readTime, readTime) !== 0,
      )
    ) {
      throw new Error("A projected query did not bind to its one explicit readTime.");
    }
    return responses.flatMap((entry) => (entry.document ? [entry.document] : []));
  }

  async captureServerReadTime(): Promise<string> {
    const responses = await this.requestJson<readonly RunQueryResponse[]>(
      `${this.documentApiRoot()}:runQuery`,
      {
        method: "POST",
        body: JSON.stringify({
          structuredQuery: {
            select: { fields: [{ fieldPath: "__name__" }] },
            from: [{ collectionId: PRODUCTION_TEST_RECORD_CATALOG[0].collection }],
            limit: 0,
          },
        }),
      },
    );
    const times = [...new Set(responses.map((entry) => entry.readTime).filter(Boolean))];
    if (times.length !== 1 || !isIsoTimestamp(times[0]!)) {
      throw new Error("Firestore did not return one server-owned readTime.");
    }
    return times[0]!;
  }

  async batchGetDocuments(
    names: readonly string[],
    input: { readonly database?: string; readonly readTime?: string } = {},
  ): Promise<readonly FirestoreDocument[]> {
    if (names.length === 0) return [];
    const database = input.database ?? this.#database;
    const expectedPrefix = `${this.documentRoot(database)}/`;
    if (names.some((name) => !name.startsWith(expectedPrefix))) {
      throw new Error("A batchGet document escaped its pinned database.");
    }
    const lookup = await this.batchLookupDocuments(names, input);
    if (lookup.missing.length > 0) {
      throw new Error("A manifest document is missing; refusing a partial operation.");
    }
    return lookup.found;
  }

  async batchLookupDocuments(
    names: readonly string[],
    input: { readonly database?: string; readonly readTime?: string } = {},
  ): Promise<{
    readonly found: readonly FirestoreDocument[];
    readonly missing: readonly string[];
  }> {
    if (names.length === 0) return { found: [], missing: [] };
    const database = input.database ?? this.#database;
    const expectedPrefix = `${this.documentRoot(database)}/`;
    if (names.some((name) => !name.startsWith(expectedPrefix))) {
      throw new Error("A batchGet document escaped its pinned database.");
    }
    const documents: FirestoreDocument[] = [];
    const missing: string[] = [];
    for (let index = 0; index < names.length; index += 100) {
      const body: Record<string, unknown> = {
        documents: names.slice(index, index + 100),
      };
      if (input.readTime) body.readTime = input.readTime;
      const response = await this.requestJson<readonly BatchGetResponse[]>(
        `${this.documentApiRoot(database)}:batchGet`,
        { method: "POST", body: JSON.stringify(body) },
      );
      for (const entry of response) {
        if (Boolean(entry.found) === Boolean(entry.missing)) {
          throw new Error(
            "A batchGet response did not contain exactly one found/missing result.",
          );
        }
        if (
          input.readTime &&
          (!entry.readTime ||
            compareFirestoreTimestamps(entry.readTime, input.readTime) !== 0)
        ) {
          throw new Error("A batchGet response escaped its explicit readTime.");
        }
        if (entry.found) documents.push(entry.found);
        if (entry.missing) missing.push(entry.missing);
      }
    }
    const requested = new Set(names);
    const returned = [...documents.map((document) => document.name), ...missing];
    if (
      returned.length !== names.length ||
      new Set(returned).size !== returned.length ||
      returned.some((name) => !requested.has(name))
    ) {
      throw new Error("A batchGet response was duplicated, omitted, or unexpected.");
    }
    return { found: documents, missing };
  }

  async getDocument(name: string, database = this.#database): Promise<FirestoreDocument> {
    const expectedPrefix = `${this.documentRoot(database)}/`;
    if (!name.startsWith(expectedPrefix)) {
      throw new Error("A document read escaped its pinned database.");
    }
    return this.requestJson<FirestoreDocument>(
      `${FIRESTORE_API}/${encodeResourceName(name)}`,
      {
        method: "GET",
      },
    );
  }

  async commitWrites(
    writes: readonly unknown[],
    database = this.#database,
  ): Promise<{ readonly commitTime: string }> {
    if (database !== S56_DATABASE && !isNamedDatabase(database, RESTORE_DRILL_PREFIX)) {
      throw new Error(
        "A Firestore commit escaped Production or an S56 restore-drill database.",
      );
    }
    if (writes.length === 0 || writes.length > S56_FIRESTORE_COMMIT_MAX_WRITES) {
      throw new Error("A Firestore commit must contain between 1 and 100 writes.");
    }
    const body = JSON.stringify({ writes });
    if (Buffer.byteLength(body, "utf8") > S56_FIRESTORE_COMMIT_MAX_SERIALIZED_BYTES) {
      throw new Error(
        "A Firestore commit exceeds the conservative serialized request ceiling.",
      );
    }
    const response = await this.requestJson<{
      readonly writeResults?: readonly unknown[];
      readonly commitTime?: string;
    }>(`${this.documentApiRoot(database)}:commit`, {
      method: "POST",
      body,
    });
    if (
      response.writeResults?.length !== writes.length ||
      !response.commitTime ||
      !isIsoTimestamp(response.commitTime)
    ) {
      throw new Error("Firestore commit readback did not match every requested write.");
    }
    return { commitTime: response.commitTime };
  }

  async cloneDatabase(input: {
    readonly destinationDatabase: string;
    readonly snapshotTime: string;
  }): Promise<GoogleLongRunningOperation> {
    if (!isNamedDatabase(input.destinationDatabase, BACKUP_PREFIX)) {
      throw new Error("Clone destination is not an S56 named backup database.");
    }
    return this.requestJson<GoogleLongRunningOperation>(
      `${FIRESTORE_API}/projects/${this.#project}/databases:clone`,
      {
        method: "POST",
        body: JSON.stringify({
          databaseId: input.destinationDatabase,
          pitrSnapshot: {
            database: this.databaseName(),
            snapshotTime: input.snapshotTime,
          },
        }),
      },
    );
  }

  async createDatabase(
    database: string,
  ): Promise<
    | { readonly kind: "accepted"; readonly operation: GoogleLongRunningOperation }
    | { readonly kind: "already_exists" }
  > {
    if (!isNamedDatabase(database, RESTORE_DRILL_PREFIX)) {
      throw new Error("Database creation is limited to an S56 restore-drill database.");
    }
    const query = new URLSearchParams({ databaseId: database }).toString();
    try {
      const operation = await this.requestJson<GoogleLongRunningOperation>(
        `${FIRESTORE_API}/projects/${this.#project}/databases?${query}`,
        {
          method: "POST",
          body: JSON.stringify({
            locationId: S56_LOCATION,
            type: "FIRESTORE_NATIVE",
            deleteProtectionState: "DELETE_PROTECTION_DISABLED",
          }),
        },
      );
      return { kind: "accepted", operation };
    } catch (error) {
      if (error instanceof FirestoreRestHttpError && error.status === 409) {
        return { kind: "already_exists" };
      }
      throw error;
    }
  }

  async deleteDrillDatabase(
    database: string,
    etag: string,
  ): Promise<
    | { readonly kind: "accepted"; readonly operation: GoogleLongRunningOperation }
    | { readonly kind: "already_absent_or_deleting" }
  > {
    if (!isNamedDatabase(database, RESTORE_DRILL_PREFIX)) {
      throw new Error("Database deletion is limited to an S56 restore-drill database.");
    }
    if (!etag.trim())
      throw new Error("Restore-drill deletion requires the read-back etag.");
    const query = new URLSearchParams({ etag }).toString();
    try {
      const operation = await this.requestJson<GoogleLongRunningOperation>(
        `${FIRESTORE_API}/${encodeResourceName(this.databaseName(database))}?${query}`,
        { method: "DELETE" },
      );
      return { kind: "accepted", operation };
    } catch (error) {
      if (
        error instanceof FirestoreRestHttpError &&
        (error.status === 404 || error.status === 409)
      ) {
        return { kind: "already_absent_or_deleting" };
      }
      throw error;
    }
  }

  async getDatabase(database: string): Promise<Readonly<Record<string, unknown>>> {
    return this.requestJson<Readonly<Record<string, unknown>>>(
      `${FIRESTORE_API}/${encodeResourceName(this.databaseName(database))}`,
      { method: "GET" },
    );
  }

  async getDatabaseIfPresent(
    database: string,
  ): Promise<Readonly<Record<string, unknown>> | null> {
    try {
      return await this.getDatabase(database);
    } catch (error) {
      if (error instanceof FirestoreRestHttpError && error.status === 404) return null;
      throw error;
    }
  }

  async getDocumentIfPresent(
    name: string,
    database: string,
  ): Promise<FirestoreDocument | null> {
    try {
      return await this.getDocument(name, database);
    } catch (error) {
      if (error instanceof FirestoreRestHttpError && error.status === 404) return null;
      throw error;
    }
  }

  async databaseIsAbsent(database: string): Promise<boolean> {
    const url = `${FIRESTORE_API}/${encodeResourceName(this.databaseName(database))}`;
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.#accessToken}`,
        },
      });
    } catch {
      throw new Error("A Firestore database cleanup readback failed.");
    }
    if (response.status === 404) return true;
    if (!response.ok) {
      throw new Error(
        `Firestore database cleanup readback returned HTTP ${response.status}.`,
      );
    }
    return false;
  }

  async getOperation(name: string): Promise<GoogleLongRunningOperation> {
    if (!name.startsWith(`projects/${this.#project}/databases/`)) {
      throw new Error("A long-running operation escaped the pinned project.");
    }
    return this.requestJson<GoogleLongRunningOperation>(
      `${FIRESTORE_API}/${encodeResourceName(name)}`,
      { method: "GET" },
    );
  }

  async getOperationIfPresent(name: string): Promise<GoogleLongRunningOperation | null> {
    try {
      return await this.getOperation(name);
    } catch (error) {
      if (error instanceof FirestoreRestHttpError && error.status === 404) return null;
      throw error;
    }
  }

  private async requestJson<T = unknown>(url: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.#fetch(url, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(30_000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.#accessToken}`,
        },
      });
    } catch {
      throw new Error("A Firestore REST request failed before receiving a response.");
    }
    if (!response.ok) {
      throw new FirestoreRestHttpError(response.status);
    }
    return (await response.json()) as T;
  }
}

function encodeResourceName(name: string): string {
  return name
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildCasDeletePayload(
  documentName: string,
  updateTime: string,
): Readonly<Record<string, unknown>> {
  if (
    !documentName.startsWith(
      `projects/${S56_PROJECT}/databases/${S56_DATABASE}/documents/`,
    )
  ) {
    throw new Error("A delete target escaped the pinned Production database.");
  }
  if (!isIsoTimestamp(updateTime))
    throw new Error("A delete target lacks a valid updateTime.");
  return Object.freeze({ delete: documentName, currentDocument: { updateTime } });
}

export function buildCreateOnlyPayload(
  document: FirestoreDocument,
  destinationDatabase: string,
): Readonly<Record<string, unknown>> {
  const sourcePrefix = `projects/${S56_PROJECT}/databases/`;
  if (!document.name.startsWith(sourcePrefix) || !document.fields) {
    throw new Error("A restore source document is malformed.");
  }
  const marker = "/documents/";
  const markerIndex = document.name.indexOf(marker);
  if (markerIndex < 0) throw new Error("A restore source document has no document path.");
  const relativePath = document.name.slice(markerIndex + marker.length);
  return Object.freeze({
    update: {
      name: `projects/${S56_PROJECT}/databases/${destinationDatabase}/documents/${relativePath}`,
      fields: document.fields,
    },
    currentDocument: { exists: false },
  });
}

export function serializedFirestoreCommitBytes(writes: readonly unknown[]): number {
  return Buffer.byteLength(JSON.stringify({ writes }), "utf8");
}

export function batchFirestoreWritesForCommit(
  writes: readonly unknown[],
): readonly (readonly unknown[])[] {
  const batches: unknown[][] = [];
  let batch: unknown[] = [];

  for (const write of writes) {
    if (
      serializedFirestoreCommitBytes([write]) > S56_FIRESTORE_COMMIT_MAX_SERIALIZED_BYTES
    ) {
      throw new Error(
        "A single Firestore write exceeds the conservative serialized request ceiling.",
      );
    }

    const candidate = [...batch, write];
    if (
      candidate.length > S56_RETIREMENT_COMMIT_MAX_WRITES ||
      serializedFirestoreCommitBytes(candidate) >
        S56_FIRESTORE_COMMIT_MAX_SERIALIZED_BYTES
    ) {
      batches.push(batch);
      batch = [write];
    } else {
      batch = candidate;
    }
  }

  if (batch.length > 0) batches.push(batch);
  return batches;
}

export function hashFirestoreFields(fields: FirestoreRestFields | undefined): string {
  if (!fields) throw new Error("Cannot hash a document with no fields.");
  return createHash("sha256").update(stableJson(fields)).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function firestoreTimestampNanos(value: string): bigint {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:)(\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!match) throw new Error("Firestore returned a malformed RFC3339 timestamp.");
  const secondsMillis = Date.parse(`${match[1]}${match[2]}.000Z`);
  if (
    !Number.isFinite(secondsMillis) ||
    new Date(secondsMillis).toISOString().slice(0, 19) !== `${match[1]}${match[2]}`
  ) {
    throw new Error("Firestore returned an invalid RFC3339 timestamp.");
  }
  const nanos = BigInt((match[3] ?? "").padEnd(9, "0"));
  return BigInt(secondsMillis) * 1_000_000n + nanos;
}

export function compareFirestoreTimestamps(left: string, right: string): -1 | 0 | 1 {
  const leftNanos = firestoreTimestampNanos(left);
  const rightNanos = firestoreTimestampNanos(right);
  return leftNanos < rightNanos ? -1 : leftNanos > rightNanos ? 1 : 0;
}

export function wholeMinuteBeforeTimestamp(value: string): string {
  const parsed = firestoreTimestampNanos(value);
  const minuteNanos = 60_000_000_000n;
  let minute = (parsed / minuteNanos) * minuteNanos;
  if (minute === parsed) minute -= minuteNanos;
  return new Date(Number(minute / 1_000_000n)).toISOString();
}

async function readSourceDatabaseEvidence(
  client: FirestoreRestClient,
  snapshotTime: string,
  readAt: string,
): Promise<SourceDatabaseEvidence> {
  const database = await client.getDatabase(S56_DATABASE);
  const uid = String(database.uid ?? "");
  const earliestVersionTime = String(database.earliestVersionTime ?? "");
  const pitrEnablement = String(database.pointInTimeRecoveryEnablement ?? "");
  if (
    database.name !== client.databaseName() ||
    database.locationId !== S56_LOCATION ||
    database.type !== "FIRESTORE_NATIVE" ||
    database.deleteTime ||
    !uid.trim() ||
    !isIsoTimestamp(earliestVersionTime) ||
    pitrEnablement !== "POINT_IN_TIME_RECOVERY_ENABLED" ||
    database.deleteProtectionState !== "DELETE_PROTECTION_ENABLED"
  ) {
    throw new Error(
      "The Production Firestore source identity/PITR readback is not safe for S56.",
    );
  }
  if (compareFirestoreTimestamps(snapshotTime, earliestVersionTime) < 0) {
    throw new Error(
      "The selected whole-minute snapshot predates Firestore PITR retention.",
    );
  }
  return {
    uid,
    earliestVersionTime,
    pitrEnablement: "POINT_IN_TIME_RECOVERY_ENABLED",
    deleteProtectionState: "DELETE_PROTECTION_ENABLED",
    readAt,
  };
}

export function resolvePrivateManifestPath(input: string): string {
  const candidate = isAbsolute(input)
    ? resolve(input)
    : resolve(S56_SECURE_MANIFEST_ROOT, input);
  if (dirname(candidate) !== S56_SECURE_MANIFEST_ROOT) {
    throw new Error(
      "The S56 manifest must be a direct file in its native secure temp directory.",
    );
  }
  if (!candidate.endsWith(".json")) throw new Error("The S56 manifest must be JSON.");
  return candidate;
}

async function ensureSecureManifestRoot(): Promise<void> {
  try {
    await mkdir(S56_SECURE_MANIFEST_ROOT, { mode: 0o700 });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      (error as NodeJS.ErrnoException).code !== "EEXIST"
    ) {
      throw error;
    }
  }
  const info = await lstat(S56_SECURE_MANIFEST_ROOT);
  const uid = process.getuid?.();
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (uid !== undefined && info.uid !== uid) ||
    (info.mode & 0o077) !== 0
  ) {
    throw new Error(
      "The native S56 manifest directory is not private and owner-controlled.",
    );
  }
}

export async function writePrivateManifest(
  path: string,
  manifest: S56OperatorManifest,
): Promise<void> {
  if (resolvePrivateManifestPath(path) !== resolve(path)) {
    throw new Error("The manifest path escaped its native secure temp directory.");
  }
  await ensureSecureManifestRoot();
  try {
    const existing = await lstat(path);
    const uid = process.getuid?.();
    if (
      !existing.isFile() ||
      existing.isSymbolicLink() ||
      (uid !== undefined && existing.uid !== uid) ||
      (existing.mode & 0o077) !== 0
    ) {
      throw new Error(
        "Refusing to replace a non-private or linked manifest destination.",
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      // The expected first-write case.
    } else {
      throw error;
    }
  }
  const temporary = resolve(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporary, 0o600);
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  await chmod(path, 0o600);
  const info = await lstat(path);
  const uid = process.getuid?.();
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    (uid !== undefined && info.uid !== uid) ||
    (info.mode & 0o077) !== 0
  ) {
    throw new Error("The S56 manifest file is not private and owner-controlled.");
  }
}

export async function readPrivateManifest(path: string): Promise<S56OperatorManifest> {
  if (resolvePrivateManifestPath(path) !== resolve(path)) {
    throw new Error("The manifest path escaped its native secure temp directory.");
  }
  await ensureSecureManifestRoot();
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  let content: string;
  try {
    const info = await handle.stat();
    const uid = process.getuid?.();
    if (
      !info.isFile() ||
      (uid !== undefined && info.uid !== uid) ||
      (info.mode & 0o077) !== 0
    ) {
      throw new Error("The S56 manifest is not private (expected mode 0600).");
    }
    content = await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
  const parsed = JSON.parse(content) as S56OperatorManifest;
  if (
    parsed.operatorVersion !== "s56-production-test-retirement-operator:v1" ||
    parsed.project !== S56_PROJECT ||
    parsed.database !== S56_DATABASE ||
    parsed.location !== S56_LOCATION
  ) {
    throw new Error("The S56 manifest does not match the pinned Production target.");
  }
  validateProductionTestRetirementManifest(parsed.retirement);
  return parsed;
}

function isIsoTimestamp(value: string): boolean {
  try {
    firestoreTimestampNanos(value);
    return true;
  } catch {
    return false;
  }
}

function descriptorFieldPaths(
  descriptor: ProductionTestRecordDescriptor,
): readonly string[] {
  // Every root alias is projected for every governed collection. The catalog classifier rejects a
  // contradictory redundant marker, which only works if the query does not hide that alias.
  const paths = new Set<string>(["data_mode", "dataMode", "is_test_run"]);
  for (const secondary of descriptor.secondaryPaths) paths.add(secondary);
  if (descriptor.retention === "product-record") {
    paths.add("product_retention_policy");
    paths.add("product_retention_class");
    paths.add("legal_hold");
  } else {
    // A legal hold is an absolute block even on non-product collections. Project it so the
    // retirement contract can distinguish false/missing from malformed/true without reading data.
    paths.add("legal_hold");
  }
  return [...paths].sort();
}

export function productionTestProjectionPaths(collection: string): readonly string[] {
  const descriptor = findProductionTestRecordDescriptor(collection);
  if (!descriptor) throw new Error("Projection paths require a governed collection.");
  return descriptorFieldPaths(descriptor);
}

function allMarkerProjectionPaths(): readonly string[] {
  return [
    ...new Set([
      "data_mode",
      "dataMode",
      "is_test_run",
      ...PRODUCTION_TEST_RECORD_CATALOG.flatMap(
        (descriptor) => descriptor.secondaryPaths,
      ),
    ]),
  ].sort();
}

function firestoreFieldAtPath(fields: FirestoreRestFields, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = fields;
  for (let index = 0; index < parts.length; index += 1) {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return undefined;
    const record = current as Readonly<Record<string, unknown>>;
    const field = record[parts[index]];
    if (index === parts.length - 1) return field;
    if (!field || typeof field !== "object" || Array.isArray(field)) return undefined;
    current = (field as Readonly<Record<string, unknown>>).mapValue;
    if (!current || typeof current !== "object" || Array.isArray(current))
      return undefined;
    current = (current as Readonly<Record<string, unknown>>).fields;
  }
  return undefined;
}

function hasAnyMarker(fields: FirestoreRestFields): boolean {
  return allMarkerProjectionPaths().some(
    (path) => firestoreFieldAtPath(fields, path) !== undefined,
  );
}

function directDocumentIdentity(
  document: FirestoreDocument,
  collection: string,
  database = S56_DATABASE,
): { readonly id: string; readonly name: string } {
  const prefix = `projects/${S56_PROJECT}/databases/${database}/documents/${collection}/`;
  if (!document.name.startsWith(prefix)) {
    throw new Error("A projected record escaped its expected collection.");
  }
  const id = document.name.slice(prefix.length);
  if (!id || id.includes("/")) {
    throw new Error("S56 operates only on direct top-level collection documents.");
  }
  return { id, name: document.name };
}

async function inventoryProduction(
  client: FirestoreRestClient,
  readTime: string,
): Promise<InventoryResult> {
  const actualCollections = await client.listTopLevelCollectionIds(readTime);
  const collections = [
    ...new Set([
      ...PRODUCTION_TEST_RECORD_CATALOG.map((entry) => entry.collection),
      ...actualCollections,
    ]),
  ].sort();
  const candidateProjection: Array<{
    readonly collection: string;
    readonly id: string;
    readonly name: string;
    readonly classification: ReturnType<typeof classifyProductionTestRecord>;
    readonly updateTime: string;
  }> = [];
  const counts: Record<string, Record<string, number>> = {};

  for (const collection of collections) {
    const descriptor = findProductionTestRecordDescriptor(collection);
    const fields = descriptor
      ? descriptorFieldPaths(descriptor)
      : allMarkerProjectionPaths();
    const documents = await client.runProjectedCollectionQuery(
      collection,
      fields,
      readTime,
    );
    counts[collection] = {};
    for (const document of documents) {
      const wireFields = document.fields ?? {};
      if (!descriptor) {
        if (hasAnyMarker(wireFields)) {
          throw new Error(
            "A Test-classification marker exists in an ungoverned collection; refusing the inventory.",
          );
        }
        continue;
      }
      const identity = directDocumentIdentity(document, collection);
      const result = classifyProductionTestRecord(descriptor, wireFields);
      counts[collection][result.classification] =
        (counts[collection][result.classification] ?? 0) + 1;
      if (result.classification === "refused") {
        throw new Error(
          `The ${collection} inventory contains an invalid or contradictory classification; refusing S56.`,
        );
      }
      if (result.classification !== "test") continue;
      if (!document.updateTime || !isIsoTimestamp(document.updateTime)) {
        throw new Error(`A ${collection} Test record has no usable updateTime.`);
      }
      candidateProjection.push({
        collection,
        id: identity.id,
        name: identity.name,
        classification: result,
        updateTime: document.updateTime,
      });
    }
  }

  const fullDocuments = await client.batchGetDocuments(
    candidateProjection.map((entry) => entry.name),
    { readTime },
  );
  const fullByName = new Map(fullDocuments.map((document) => [document.name, document]));
  const records: ProductionTestRecordSnapshot[] = candidateProjection.map((entry) => {
    const full = fullByName.get(entry.name);
    if (!full?.fields || full.updateTime !== entry.updateTime) {
      throw new Error("The projected and full candidate snapshots differ; refusing S56.");
    }
    return createProductionTestRecordSnapshot({
      documentName: entry.name,
      collection: entry.collection,
      id: entry.id,
      updateTime: entry.updateTime,
      fields: full.fields,
    });
  });
  return { readTime, actualCollections, records, counts };
}

async function waitForOperation(
  client: FirestoreRestClient,
  initial: GoogleLongRunningOperation,
  input: {
    readonly sleep: (milliseconds: number) => Promise<void>;
    readonly now: () => Date;
  },
): Promise<GoogleLongRunningOperation> {
  if (!initial.name)
    throw new Error("Cloud mutation returned no long-running operation name.");
  const deadline = input.now().getTime() + OPERATION_TIMEOUT_MS;
  let operation = initial;
  while (!operation.done) {
    if (input.now().getTime() >= deadline) {
      throw new Error("Cloud mutation did not finish before the bounded timeout.");
    }
    await input.sleep(OPERATION_POLL_MS);
    operation = await client.getOperation(initial.name);
  }
  if (operation.error) {
    throw new Error(
      `Cloud mutation failed with operation code ${operation.error.code ?? "unknown"}.`,
    );
  }
  return operation;
}

function cloneDocumentName(
  record: ProductionTestRecordSnapshot,
  database: string,
): string {
  return `projects/${S56_PROJECT}/databases/${database}/documents/${record.collection}/${record.id}`;
}

export function selectMissingRollbackDestinations(
  records: readonly ProductionTestRecordSnapshot[],
  found: readonly Pick<FirestoreDocument, "name" | "fields">[],
  missingNames: readonly string[],
): readonly string[] {
  const expected = new Map(
    records.map((record) => [cloneDocumentName(record, S56_DATABASE), record]),
  );
  const seen = new Set<string>();
  for (const document of found) {
    const planned = expected.get(document.name);
    if (
      !planned ||
      seen.has(document.name) ||
      hashFirestoreFields(document.fields) !== planned.recordHash
    ) {
      throw new Error("Rollback found an existing destination with content drift.");
    }
    seen.add(document.name);
  }
  for (const name of missingNames) {
    if (!expected.has(name) || seen.has(name)) {
      throw new Error(
        "Rollback destination state is duplicated or outside the manifest.",
      );
    }
    seen.add(name);
  }
  if (seen.size !== expected.size) {
    throw new Error("Rollback destination state omitted a manifest record.");
  }
  return [...missingNames].sort();
}

async function verifyCloneDocuments(
  client: FirestoreRestClient,
  manifest: S56OperatorManifest,
): Promise<{ readonly count: number; readonly aggregateHash: string }> {
  const retirement = requireRetirement(manifest);
  if (!manifest.pendingClone)
    throw new Error("No named PITR clone is pending verification.");
  if (manifest.pendingClone.state !== "READY") {
    throw new Error("The named PITR clone operation has not completed yet.");
  }
  const cloneDatabase = manifest.pendingClone.database;
  const records = retirement.records;
  const documents = await client.batchGetDocuments(
    records.map((record) => cloneDocumentName(record, cloneDatabase)),
    { database: cloneDatabase },
  );
  const byName = new Map(documents.map((document) => [document.name, document]));
  for (const record of records) {
    const document = byName.get(cloneDocumentName(record, cloneDatabase));
    if (!document?.fields || hashFirestoreFields(document.fields) !== record.recordHash) {
      throw new Error("The named clone does not match the full-field source hash.");
    }
  }
  return {
    count: records.length,
    aggregateHash: productionTestRecordAggregateHash(records),
  };
}

function requireRetirement(
  manifest: S56OperatorManifest,
): ProductionTestRetirementManifest {
  validateProductionTestRetirementManifest(manifest.retirement);
  return manifest.retirement;
}

export type BackupVerifiedRetirement = ProductionTestRetirementManifest & {
  readonly backup: ProductionTestBackupEvidence;
  readonly clone: ProductionTestPitrCloneEvidence;
};

function requireBackupVerified(manifest: S56OperatorManifest): BackupVerifiedRetirement {
  const retirement = requireRetirement(manifest);
  if (retirement.phase !== "backup_verified" || !retirement.backup || !retirement.clone) {
    throw new Error("This phase requires the full-field-verified named PITR clone.");
  }
  return retirement as BackupVerifiedRetirement;
}

function databaseIdFromName(name: string): string {
  const prefix = `projects/${S56_PROJECT}/databases/`;
  if (!name.startsWith(prefix))
    throw new Error("A database resource escaped the pinned project.");
  const id = name.slice(prefix.length);
  if (!id || id.includes("/")) throw new Error("A database resource name is malformed.");
  return id;
}

function formatZeroCounts(inventory: InventoryResult): string {
  const lines = PRODUCTION_TEST_RECORD_CATALOG.map((descriptor) => {
    const count = inventory.counts[descriptor.collection]?.test ?? 0;
    if (count !== 0)
      throw new Error("A governed collection still contains Test records.");
    return `${descriptor.collection}: 0`;
  });
  return [
    `Zero Test records verified across ${PRODUCTION_TEST_RECORD_CATALOG.length} governed collections.`,
    ...lines,
  ].join("\n");
}

export function formatCloneEligibility(
  records: readonly ProductionTestRecordSnapshot[],
): { readonly eligible: boolean; readonly report: string } {
  const rows = PRODUCTION_TEST_RECORD_CATALOG.map((descriptor) => {
    const collectionRecords = records.filter(
      (record) => record.collection === descriptor.collection,
    );
    return {
      collection: descriptor.collection,
      ownerAuthorized: collectionRecords.filter(
        (record) => record.retentionDisposition === "owner_authorized",
      ).length,
      legalHold: collectionRecords.filter(
        (record) => record.retentionDisposition === "blocked_legal_hold",
      ).length,
      unknownRetention: collectionRecords.filter(
        (record) => record.retentionDisposition === "blocked_unknown_retention",
      ).length,
    };
  });
  const eligible = rows.every((row) => row.legalHold === 0 && row.unknownRetention === 0);
  return {
    eligible,
    report: [
      `S56 clone eligibility: ${eligible ? "eligible" : "REFUSED"}`,
      ...rows.map(
        (row) =>
          `${row.collection}: owner_authorized=${row.ownerAuthorized}, blocked_legal_hold=${row.legalHold}, blocked_unknown_retention=${row.unknownRetention}`,
      ),
    ].join("\n"),
  };
}

export async function readIntakeFenceEvidence(
  env: NodeJS.ProcessEnv,
  account: string,
  transport: ExecFileTransport,
): Promise<{ readonly intakeFences: IntakeFenceTuple; readonly deployedAt: string }> {
  const gcloud = env.GCLOUD_BIN?.trim() || "gcloud";
  const childEnv: NodeJS.ProcessEnv = { ...env };
  const readService = async <T extends "pmi-kc-app" | "pmi-kc-kb-demo">(
    serviceName: T,
  ) => {
    const serviceResult = await safeExecGcloud(
      transport,
      gcloud,
      [
        "run",
        "services",
        "describe",
        serviceName,
        `--project=${S56_PROJECT}`,
        `--region=${S56_LOCATION}`,
        `--account=${account}`,
        "--format=json",
        "--quiet",
      ],
      childEnv,
    );
    const service = parseJsonObject(serviceResult.stdout, "Cloud Run service readback");
    const status = objectField(service, "status");
    const traffic = Array.isArray(status.traffic) ? status.traffic : [];
    const fullTraffic = traffic.filter((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      return Number((entry as Readonly<Record<string, unknown>>).percent) === 100;
    });
    if (fullTraffic.length !== 1) {
      throw new Error(
        "Each intake-fenced Cloud Run service must have one 100% revision.",
      );
    }
    const revision = String(
      (fullTraffic[0] as Readonly<Record<string, unknown>>).revisionName ?? "",
    );
    if (!new RegExp(`^${serviceName}-[a-z0-9-]+$`).test(revision)) {
      throw new Error("A Cloud Run traffic target has no exact service revision name.");
    }
    const revisionResult = await safeExecGcloud(
      transport,
      gcloud,
      [
        "run",
        "revisions",
        "describe",
        revision,
        `--project=${S56_PROJECT}`,
        `--region=${S56_LOCATION}`,
        `--account=${account}`,
        "--format=json",
        "--quiet",
      ],
      childEnv,
    );
    const revisionResource = parseJsonObject(
      revisionResult.stdout,
      "Cloud Run revision readback",
    );
    const metadata = objectField(revisionResource, "metadata");
    const deployedAt = String(metadata.creationTimestamp ?? "");
    if (metadata.name !== revision || !isIsoTimestamp(deployedAt)) {
      throw new Error("An intake-fence revision deployment time could not be read back.");
    }
    return { service: serviceName, revision, trafficPercent: 100 as const, deployedAt };
  };

  const primaryFence = await readService("pmi-kc-app");
  const rollbackFence = await readService("pmi-kc-kb-demo");
  const services = [primaryFence, rollbackFence];
  const deployedAt = services
    .map((service) => service.deployedAt)
    .reduce((latest, candidate) =>
      compareFirestoreTimestamps(candidate, latest) > 0 ? candidate : latest,
    );
  const intakeFences: IntakeFenceTuple = [primaryFence, rollbackFence];
  return { intakeFences, deployedAt };
}

export async function verifyPreDeleteLiveEvidence(input: {
  readonly client: FirestoreRestClient;
  readonly retirement: BackupVerifiedRetirement;
  readonly env: NodeJS.ProcessEnv;
  readonly account: string;
  readonly execFile: ExecFileTransport;
}): Promise<{ readonly cloneRecordCount: number; readonly fenceCount: 2 }> {
  validateProductionTestRetirementManifest(input.retirement);
  const clone = input.retirement.clone;
  const cloneDatabaseId = databaseIdFromName(clone.cloneDatabase);
  const expectedDatabase = clone.databaseReadback;
  const liveDatabase = await input.client.getDatabase(cloneDatabaseId);
  if (
    liveDatabase.name !== expectedDatabase.database ||
    liveDatabase.uid !== expectedDatabase.databaseUid ||
    liveDatabase.locationId !== expectedDatabase.locationId ||
    liveDatabase.type !== expectedDatabase.type ||
    (liveDatabase.deleteTime ?? null) !== expectedDatabase.deleteTime
  ) {
    throw new Error("The named PITR clone database identity drifted before deletion.");
  }

  const documents = await input.client.batchGetDocuments(
    input.retirement.records.map((record) => cloneDocumentName(record, cloneDatabaseId)),
    { database: cloneDatabaseId },
  );
  const byName = new Map(documents.map((document) => [document.name, document]));
  const liveHashes = input.retirement.records.map((record) => {
    const document = byName.get(cloneDocumentName(record, cloneDatabaseId));
    const recordHash = hashFirestoreFields(document?.fields);
    if (recordHash !== record.recordHash) {
      throw new Error("A named PITR clone record hash drifted before deletion.");
    }
    return { documentName: record.documentName, recordHash };
  });
  const aggregateHash = productionTestRecordAggregateHash(liveHashes);
  if (
    documents.length !== input.retirement.records.length ||
    clone.verifiedRecordCount !== input.retirement.records.length ||
    clone.verifiedAggregateHash !== aggregateHash
  ) {
    throw new Error("The named PITR clone record count or aggregate hash drifted.");
  }

  const liveFences = (
    await readIntakeFenceEvidence(input.env, input.account, input.execFile)
  ).intakeFences;
  for (let index = 0; index < input.retirement.backup.intakeFences.length; index += 1) {
    const expected = input.retirement.backup.intakeFences[index];
    const live = liveFences[index];
    if (
      !expected ||
      !live ||
      live.service !== expected.service ||
      live.revision !== expected.revision ||
      live.trafficPercent !== expected.trafficPercent ||
      compareFirestoreTimestamps(live.deployedAt, expected.deployedAt) !== 0
    ) {
      throw new Error("A Cloud Run Test-intake fence drifted before deletion.");
    }
  }
  return { cloneRecordCount: documents.length, fenceCount: 2 };
}

function restoreDrillIdentityIfReady(
  client: FirestoreRestClient,
  database: string,
  readback: Readonly<Record<string, unknown>>,
  absenceVerifiedAt: string,
): RestoreDrillDatabaseIdentity | null {
  const resource = client.databaseName(database);
  if (
    (readback.name !== undefined && readback.name !== resource) ||
    (readback.locationId !== undefined && readback.locationId !== S56_LOCATION) ||
    (readback.type !== undefined && readback.type !== "FIRESTORE_NATIVE") ||
    (readback.deleteProtectionState !== undefined &&
      readback.deleteProtectionState !== "DELETE_PROTECTION_DISABLED") ||
    (readback.deleteTime ?? null) !== null
  ) {
    throw new Error(
      "The restore-drill database exact identity did not match its persisted intent.",
    );
  }
  const uid = typeof readback.uid === "string" ? readback.uid : "";
  const createTime = typeof readback.createTime === "string" ? readback.createTime : "";
  const etag = typeof readback.etag === "string" ? readback.etag : "";
  if (
    readback.name === undefined ||
    readback.locationId === undefined ||
    readback.type === undefined ||
    readback.deleteProtectionState === undefined ||
    !uid ||
    !createTime ||
    !etag
  ) {
    return null;
  }
  if (
    !isIsoTimestamp(createTime) ||
    compareFirestoreTimestamps(createTime, absenceVerifiedAt) < 0
  ) {
    throw new Error(
      "The restore-drill database creation time predates its proven-absent intent.",
    );
  }
  return {
    resource,
    uid,
    createTime,
    locationId: S56_LOCATION,
    type: "FIRESTORE_NATIVE",
    deleteProtectionState: "DELETE_PROTECTION_DISABLED",
    etag,
  };
}

function restoreDrillIdentity(
  client: FirestoreRestClient,
  database: string,
  readback: Readonly<Record<string, unknown>>,
  absenceVerifiedAt: string,
): RestoreDrillDatabaseIdentity {
  const identity = restoreDrillIdentityIfReady(
    client,
    database,
    readback,
    absenceVerifiedAt,
  );
  if (!identity) {
    throw new Error("The restore-drill database identity readback is incomplete.");
  }
  return identity;
}

function restoreDrillIsOwnedAndDeleting(
  expected: RestoreDrillDatabaseIdentity,
  readback: Readonly<Record<string, unknown>>,
): boolean {
  const deleteTime = typeof readback.deleteTime === "string" ? readback.deleteTime : "";
  if (!deleteTime) return false;
  if (
    !isIsoTimestamp(deleteTime) ||
    readback.name !== expected.resource ||
    readback.uid !== expected.uid ||
    readback.createTime !== expected.createTime ||
    readback.locationId !== expected.locationId ||
    readback.type !== expected.type ||
    readback.deleteProtectionState !== expected.deleteProtectionState
  ) {
    throw new Error("A deleting restore-drill database did not match the owned UID.");
  }
  return true;
}

function assertSameRestoreDrillIdentity(
  expected: RestoreDrillDatabaseIdentity,
  actual: RestoreDrillDatabaseIdentity,
): void {
  if (stableJson(expected) !== stableJson(actual)) {
    throw new Error("The restore-drill database identity drifted during recovery.");
  }
}

async function waitForRestoreDrillDatabase(
  client: FirestoreRestClient,
  database: string,
  input: {
    readonly absenceVerifiedAt: string;
    readonly sleep: (milliseconds: number) => Promise<void>;
    readonly now: () => Date;
  },
): Promise<RestoreDrillDatabaseIdentity> {
  const deadline = input.now().getTime() + OPERATION_TIMEOUT_MS;
  while (true) {
    const readback = await client.getDatabaseIfPresent(database);
    if (readback) {
      const identity = restoreDrillIdentityIfReady(
        client,
        database,
        readback,
        input.absenceVerifiedAt,
      );
      if (identity) return identity;
    }
    if (input.now().getTime() >= deadline) {
      throw new Error(
        "The accepted restore-drill creation could not be recovered before timeout.",
      );
    }
    await input.sleep(OPERATION_POLL_MS);
  }
}

async function waitForRestoreDrillAbsence(
  client: FirestoreRestClient,
  database: string,
  input: {
    readonly sleep: (milliseconds: number) => Promise<void>;
    readonly now: () => Date;
  },
): Promise<void> {
  const deadline = input.now().getTime() + OPERATION_TIMEOUT_MS;
  while (!(await client.databaseIsAbsent(database))) {
    if (input.now().getTime() >= deadline) {
      throw new Error(
        "The restore-drill cleanup could not be proven absent before timeout.",
      );
    }
    await input.sleep(OPERATION_POLL_MS);
  }
}

function assertRestoreDrillStateMatches(
  state: RestoreDrillState,
  expected: RestoreDrillBase,
): void {
  const baseFields: readonly (keyof RestoreDrillBase)[] = [
    "database",
    "databaseResource",
    "manifestDigest",
    "catalogDigest",
    "sourceDocumentNameHash",
    "restoredDocumentNameHash",
    "sourceRecordHash",
    "absenceVerifiedAt",
    "intendedAt",
  ];
  if (baseFields.some((key) => state[key] !== expected[key])) {
    throw new Error("Restore-drill resume does not match its exact persisted intent.");
  }
  if (!isIsoTimestamp(state.absenceVerifiedAt) || !isIsoTimestamp(state.intendedAt)) {
    throw new Error("Restore-drill resume contains an invalid persisted timestamp.");
  }
  if (
    state.state === "CREATE_REQUESTED" &&
    (!state.createOperation || !isIsoTimestamp(state.requestedAt))
  ) {
    throw new Error("Restore-drill create-operation state is malformed.");
  }
  if (
    (state.state === "READY" ||
      state.state === "RESTORE_VERIFIED" ||
      state.state === "CLEANUP_REQUESTED" ||
      state.state === "CLEANUP_VERIFIED") &&
    !isIsoTimestamp(state.readyAt)
  ) {
    throw new Error("Restore-drill ready state is malformed.");
  }
  if (
    (state.state === "RESTORE_VERIFIED" ||
      state.state === "CLEANUP_REQUESTED" ||
      state.state === "CLEANUP_VERIFIED") &&
    (!isIsoTimestamp(state.restoredVerifiedAt) ||
      state.restoredRecordHash !== state.sourceRecordHash)
  ) {
    throw new Error("Restore-drill record verification state is malformed.");
  }
}

export async function rehearseProductionTestRestore(input: {
  readonly client: FirestoreRestClient;
  readonly retirement: BackupVerifiedRetirement;
  readonly manifest: S56OperatorManifest;
  readonly drill: string;
  readonly persist: (manifest: S56OperatorManifest) => Promise<void>;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly now: () => Date;
  readonly stdout: (line: string) => void;
}): Promise<S56OperatorManifest> {
  const { client, retirement, drill, persist, sleep, now, stdout } = input;
  if (!isNamedDatabase(drill, RESTORE_DRILL_PREFIX)) {
    throw new Error("Restore rehearsal requires a named S56 drill database.");
  }
  if (retirement.records.length < 1) {
    throw new Error("Restore rehearsal requires a Test record in the named clone.");
  }
  if (input.manifest.restoreProof) {
    validateProductionTestRestoreProof(retirement, input.manifest.restoreProof);
    if (
      input.manifest.restoreProof.restoreTargetDatabase !== client.databaseName(drill)
    ) {
      throw new Error(
        "The existing restore proof belongs to a different drill database.",
      );
    }
    return input.manifest;
  }

  const cloneDatabase = databaseIdFromName(retirement.clone.cloneDatabase);
  const record = retirement.records[0];
  const sourceName = cloneDocumentName(record, cloneDatabase);
  const [source] = await client.batchGetDocuments([sourceName], {
    database: cloneDatabase,
  });
  if (!source?.fields || hashFirestoreFields(source.fields) !== record.recordHash) {
    throw new Error("The restore-drill source differs from the verified clone hash.");
  }
  const destinationName = cloneDocumentName(record, drill);
  const expectedBase = (absenceVerifiedAt: string, intendedAt: string) => ({
    database: drill,
    databaseResource: client.databaseName(drill),
    manifestDigest: retirement.manifestDigest,
    catalogDigest: retirement.catalogDigest,
    sourceDocumentNameHash: sha256Text(sourceName),
    restoredDocumentNameHash: sha256Text(destinationName),
    sourceRecordHash: record.recordHash,
    absenceVerifiedAt,
    intendedAt,
  });

  let manifest = input.manifest;
  let state = manifest.restoreDrill;
  const saveState = async (next: RestoreDrillState): Promise<void> => {
    manifest = { ...manifest, restoreDrill: next };
    await persist(manifest);
    state = next;
  };

  if (!state) {
    if (!(await client.databaseIsAbsent(drill))) {
      throw new Error(
        "Restore-drill creation requires a proven-absent fresh database name.",
      );
    }
    const absenceVerifiedAt = await client.captureServerReadTime();
    const intendedAt = now().toISOString();
    const intended: RestoreDrillState = {
      ...expectedBase(absenceVerifiedAt, intendedAt),
      state: "INTENDED",
    };
    await saveState(intended);
  } else {
    assertRestoreDrillStateMatches(
      state,
      expectedBase(state.absenceVerifiedAt, state.intendedAt),
    );
  }

  if (state!.state === "INTENDED") {
    const creation = await client.createDatabase(drill);
    if (creation.kind === "accepted") {
      if (!creation.operation.name) {
        stdout(`Restore-drill recovery destination: ${client.databaseName(drill)}`);
        throw new Error("Restore-drill creation returned no operation name.");
      }
      const requested: RestoreDrillState = {
        ...state!,
        state: "CREATE_REQUESTED",
        createOperation: creation.operation.name,
        requestedAt: now().toISOString(),
      };
      try {
        await saveState(requested);
      } catch (error) {
        stdout(
          `Restore-drill recovery reference: destination=${client.databaseName(drill)}; operation=${creation.operation.name}`,
        );
        throw error;
      }
    } else {
      const identity = await waitForRestoreDrillDatabase(client, drill, {
        absenceVerifiedAt: state!.absenceVerifiedAt,
        sleep,
        now,
      });
      await saveState({
        ...state!,
        state: "READY",
        createOperation: null,
        readyAt: now().toISOString(),
        identity,
      });
    }
  }

  if (state!.state === "CREATE_REQUESTED") {
    const operation = await client.getOperation(state!.createOperation);
    const completed = await waitForOperation(client, operation, { sleep, now });
    const response =
      completed.response &&
      typeof completed.response === "object" &&
      !Array.isArray(completed.response)
        ? (completed.response as Readonly<Record<string, unknown>>)
        : undefined;
    if (
      completed.name !== state!.createOperation ||
      response?.name !== state!.databaseResource
    ) {
      throw new Error(
        "Restore-drill creation operation did not return the exact intended database.",
      );
    }
    const identity = await waitForRestoreDrillDatabase(client, drill, {
      absenceVerifiedAt: state!.absenceVerifiedAt,
      sleep,
      now,
    });
    await saveState({
      ...state!,
      state: "READY",
      readyAt: now().toISOString(),
      identity,
    });
  }

  if (state!.state === "READY") {
    const database = await client.getDatabaseIfPresent(drill);
    if (!database) {
      throw new Error("The owned restore-drill database disappeared before rehearsal.");
    }
    assertSameRestoreDrillIdentity(
      state!.identity,
      restoreDrillIdentity(client, drill, database, state!.absenceVerifiedAt),
    );
    const existing = await client.getDocumentIfPresent(destinationName, drill);
    if (!existing) {
      const [createOnly] = buildProductionTestCreateOnlyRestoreWrites(
        [{ documentName: destinationName, fields: source.fields }],
        client.databaseName(drill),
      );
      await client.commitWrites([createOnly], drill);
    }
    const restored = existing ?? (await client.getDocument(destinationName, drill));
    const restoredHash = hashFirestoreFields(restored.fields);
    if (restoredHash !== record.recordHash) {
      throw new Error(
        "The one-record restore drill did not preserve the full-field hash.",
      );
    }
    await saveState({
      ...state!,
      state: "RESTORE_VERIFIED",
      restoredRecordHash: restoredHash,
      restoredVerifiedAt: await client.captureServerReadTime(),
    });
  }

  if (state!.state === "RESTORE_VERIFIED") {
    const database = await client.getDatabaseIfPresent(drill);
    const deletionAlreadyInProgress =
      database && restoreDrillIsOwnedAndDeleting(state!.identity, database);
    if (database) {
      if (!deletionAlreadyInProgress) {
        assertSameRestoreDrillIdentity(
          state!.identity,
          restoreDrillIdentity(client, drill, database, state!.absenceVerifiedAt),
        );
      }
    }
    const deletion =
      database && !deletionAlreadyInProgress
        ? await client.deleteDrillDatabase(drill, state!.identity.etag)
        : { kind: "already_absent_or_deleting" as const };
    if (deletion.kind === "accepted" && !deletion.operation.name) {
      stdout(`Restore-drill cleanup recovery destination: ${client.databaseName(drill)}`);
      throw new Error("Restore-drill deletion returned no operation name.");
    }
    const cleanupRequested: RestoreDrillState = {
      ...state!,
      state: "CLEANUP_REQUESTED",
      deleteOperation: deletion.kind === "accepted" ? deletion.operation.name! : null,
      cleanupRequestedAt: now().toISOString(),
    };
    try {
      await saveState(cleanupRequested);
    } catch (error) {
      stdout(`Restore-drill cleanup recovery destination: ${client.databaseName(drill)}`);
      throw error;
    }
  }

  if (state!.state === "CLEANUP_REQUESTED") {
    if (!(await client.databaseIsAbsent(drill)) && state!.deleteOperation) {
      const operation = await client.getOperationIfPresent(state!.deleteOperation);
      if (operation) await waitForOperation(client, operation, { sleep, now });
    }
    await waitForRestoreDrillAbsence(client, drill, { sleep, now });
    const cleanupVerifiedAt = await client.captureServerReadTime();
    const cleaned: RestoreDrillState = {
      ...state!,
      state: "CLEANUP_VERIFIED",
      cleanupVerifiedAt,
    };
    const proof = buildProductionTestRestoreProof({
      manifestDigest: retirement.manifestDigest,
      catalogDigest: retirement.catalogDigest,
      backupRef: retirement.backup.backupRef,
      backupCloneDatabase: retirement.clone.cloneDatabase,
      restoreTargetDatabase: client.databaseName(drill),
      sourceDocumentNameHash: cleaned.sourceDocumentNameHash,
      restoredDocumentNameHash: cleaned.restoredDocumentNameHash,
      sourceRecordHash: cleaned.sourceRecordHash,
      restoredRecordHash: cleaned.restoredRecordHash,
      cleanupVerified: true,
      verifiedAt: cleaned.restoredVerifiedAt,
      cleanupVerifiedAt,
    });
    validateProductionTestRestoreProof(retirement, proof);
    manifest = { ...manifest, restoreDrill: cleaned, restoreProof: proof };
    await persist(manifest);
    state = cleaned;
  }

  if (state!.state !== "CLEANUP_VERIFIED" || !manifest.restoreProof) {
    throw new Error("Restore-drill recovery stopped before cleanup was proven.");
  }
  return manifest;
}

function parseJsonObject(
  value: string,
  label: string,
): Readonly<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} was not valid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} was not an object.`);
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function objectField(
  value: Readonly<Record<string, unknown>>,
  field: string,
): Readonly<Record<string, unknown>> {
  const nested = value[field];
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    throw new Error(`Cloud readback omitted ${field}.`);
  }
  return nested as Readonly<Record<string, unknown>>;
}

export function assertCloneReadback(input: {
  readonly client: FirestoreRestClient;
  readonly completed: GoogleLongRunningOperation;
  readonly database: Readonly<Record<string, unknown>>;
  readonly destinationDatabase: string;
  readonly snapshotTime: string;
  readonly sourceDatabaseUid: string;
}): Pick<
  CloneVerificationEvidence,
  "cloneDatabaseUid" | "lroMetadata" | "lroResponse" | "databaseReadback"
> {
  const expectedName = input.client.databaseName(input.destinationDatabase);
  const response = objectField(
    input.completed as unknown as Readonly<Record<string, unknown>>,
    "response",
  );
  const responseUid = String(response.uid ?? "");
  const databaseUid = String(input.database.uid ?? "");
  if (
    !input.completed.done ||
    response.name !== expectedName ||
    !responseUid ||
    input.database.name !== expectedName ||
    databaseUid !== responseUid ||
    databaseUid === input.sourceDatabaseUid ||
    input.database.locationId !== S56_LOCATION ||
    input.database.type !== "FIRESTORE_NATIVE" ||
    input.database.deleteTime
  ) {
    throw new Error(
      "The PITR clone did not read back as an exact ready Firestore database.",
    );
  }
  const metadata = objectField(
    input.completed as unknown as Readonly<Record<string, unknown>>,
    "metadata",
  );
  const pitrSnapshot = objectField(metadata, "pitrSnapshot");
  if (
    metadata.operationState !== "SUCCESSFUL" ||
    metadata.database !== expectedName ||
    pitrSnapshot.database !== input.client.databaseName() ||
    pitrSnapshot.databaseUid !== input.sourceDatabaseUid ||
    typeof pitrSnapshot.snapshotTime !== "string" ||
    compareFirestoreTimestamps(pitrSnapshot.snapshotTime, input.snapshotTime) !== 0
  ) {
    throw new Error(
      "The PITR clone LRO readback does not match the exact source and snapshot.",
    );
  }
  return {
    cloneDatabaseUid: databaseUid,
    lroMetadata: {
      operationState: "SUCCESSFUL",
      destinationDatabase: expectedName,
      pitrSnapshot: {
        database: input.client.databaseName(),
        databaseUid: input.sourceDatabaseUid,
        snapshotTime: input.snapshotTime,
      },
    },
    lroResponse: { database: expectedName, databaseUid: responseUid },
    databaseReadback: {
      database: expectedName,
      databaseUid,
      locationId: S56_LOCATION,
      type: "FIRESTORE_NATIVE",
      deleteTime: null,
    },
  };
}

export async function runS56Phase(
  args: S56Arguments,
  env: NodeJS.ProcessEnv,
  dependencies: S56RuntimeDependencies = {},
): Promise<void> {
  assertS56PhaseAuthorization(args);
  assertPinnedEnvironment(args, env);
  const manifestPath = resolvePrivateManifestPath(args.manifestPath);
  const execTransport = dependencies.execFile ?? defaultExecFile;
  const { account, accessToken } = await acquireManagedGcloudAccess(env, execTransport);
  const client = new FirestoreRestClient({
    project: args.project,
    database: args.database,
    accessToken,
    fetch: dependencies.fetch,
  });
  const now = dependencies.now ?? (() => new Date());
  const sleep =
    dependencies.sleep ??
    ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds)));
  const stdout = dependencies.stdout ?? console.log;

  if (args.phase === "count") {
    if (!args.replaceManifest) {
      await stat(manifestPath)
        .then(() => {
          throw new Error(
            "The S56 count manifest already exists; pass --replace-manifest deliberately.",
          );
        })
        .catch((error: unknown) => {
          if (
            error instanceof Error &&
            "code" in error &&
            (error as NodeJS.ErrnoException).code === "ENOENT"
          ) {
            return;
          }
          throw error;
        });
    }
    const serverReadTime = await client.captureServerReadTime();
    const readTime = wholeMinuteBeforeTimestamp(serverReadTime);
    if (compareFirestoreTimestamps(readTime, serverReadTime) >= 0) {
      throw new Error(
        "The PITR snapshot was not strictly earlier than the Firestore server clock.",
      );
    }
    const sourceDatabase = await readSourceDatabaseEvidence(
      client,
      readTime,
      serverReadTime,
    );
    const inventory = await inventoryProduction(client, readTime);
    const retirement = buildProductionTestRetirementManifest({
      records: inventory.records,
      countedAt: readTime,
    });
    const manifest: S56OperatorManifest = {
      operatorVersion: "s56-production-test-retirement-operator:v1",
      project: S56_PROJECT,
      database: S56_DATABASE,
      location: S56_LOCATION,
      readTime,
      sourceDatabase,
      inventoriedCollections: inventory.actualCollections,
      retirement,
    };
    await writePrivateManifest(manifestPath, manifest);
    stdout(formatProductionTestRetirementCounts(retirement));
    stdout(
      "Count evidence saved privately; no record identifiers or bodies were printed.",
    );
    return;
  }

  let manifest = await readPrivateManifest(manifestPath);
  if (
    MUTATION_CONFIRMATIONS[args.phase] &&
    args.manifestDigest !== manifest.retirement.manifestDigest
  ) {
    throw new Error(
      "The mutation confirmation does not bind this exact private manifest.",
    );
  }
  if (args.phase === "clone-backup") {
    if (manifest.retirement.phase !== "counted") {
      throw new Error("The named clone is already sealed into the retirement manifest.");
    }
    const eligibility = formatCloneEligibility(manifest.retirement.records);
    if (!eligibility.eligible) {
      stdout(eligibility.report);
      throw new Error(
        "The count contains deletion-ineligible retention state; clone refused.",
      );
    }
    let requested = manifest.pendingClone;
    if (requested) {
      if (requested.database !== args.backupDatabase!) {
        throw new Error(
          "Clone resume requires the exact originally requested destination.",
        );
      }
      if (requested.state === "READY") {
        stdout("Named S56 clone was already completed and read back.");
        return;
      }
    } else {
      const sourceDatabase = await readSourceDatabaseEvidence(
        client,
        manifest.readTime,
        await client.captureServerReadTime(),
      );
      if (sourceDatabase.uid !== manifest.sourceDatabase.uid) {
        throw new Error("The Production Firestore database UID changed after the count.");
      }
      const fence = await readIntakeFenceEvidence(env, account, execTransport);
      if (compareFirestoreTimestamps(manifest.readTime, fence.deployedAt) < 0) {
        throw new Error(
          "The count snapshot predates the deployed Test-intake fence; recount first.",
        );
      }
      const operation = await client.cloneDatabase({
        destinationDatabase: args.backupDatabase!,
        snapshotTime: manifest.readTime,
      });
      if (!operation.name)
        throw new Error("The PITR clone request returned no operation name.");
      requested = {
        database: args.backupDatabase!,
        operation: operation.name,
        sourceReadTime: manifest.readTime,
        state: "REQUESTED",
        intakeFences: fence.intakeFences,
        sourceDatabase,
        requestedAt: now().toISOString(),
      };
      manifest = { ...manifest, sourceDatabase, pendingClone: requested };
      try {
        await writePrivateManifest(manifestPath, manifest);
      } catch (error) {
        stdout(
          `Clone recovery reference: destination=${requested.database}; operation=${requested.operation}`,
        );
        throw error;
      }
    }

    const operation = await client.getOperation(requested.operation);
    const completed = await waitForOperation(client, operation, { sleep, now });
    const database = await client.getDatabase(args.backupDatabase!);
    const identityReadback = assertCloneReadback({
      client,
      completed,
      database,
      destinationDatabase: args.backupDatabase!,
      snapshotTime: manifest.readTime,
      sourceDatabaseUid: requested.sourceDatabase.uid,
    });
    const pendingClone: CloneVerificationEvidence = {
      ...requested,
      operation: completed.name,
      state: "READY",
      clonedAt: now().toISOString(),
      ...identityReadback,
    };
    manifest = { ...manifest, sourceDatabase: requested.sourceDatabase, pendingClone };
    await writePrivateManifest(manifestPath, manifest);
    stdout("Named S56 clone completed and its database resource was read back.");
    return;
  }

  if (args.phase === "verify-backup") {
    const counted = requireRetirement(manifest);
    if (
      counted.phase !== "counted" ||
      !manifest.pendingClone ||
      manifest.pendingClone.state !== "READY"
    ) {
      throw new Error(
        "Backup verification requires one pending clone from the counted manifest.",
      );
    }
    const verified = await verifyCloneDocuments(client, manifest);
    const verifiedAt = await client.captureServerReadTime();
    const sourceDatabase = client.databaseName();
    const backup: ProductionTestBackupEvidence = {
      backupRef: productionTestPitrBackupRef(
        client.databaseName(manifest.pendingClone.database),
        manifest.readTime,
      ),
      sourceDatabase,
      sourceDatabaseUid: manifest.sourceDatabase.uid,
      sourcePitrEnablement: manifest.sourceDatabase.pitrEnablement,
      sourceDeleteProtectionState: manifest.sourceDatabase.deleteProtectionState,
      sourceEarliestVersionTime: manifest.sourceDatabase.earliestVersionTime,
      snapshotTime: manifest.readTime,
      verifiedAt,
      intakeFences: manifest.pendingClone.intakeFences,
    };
    const clone: ProductionTestPitrCloneEvidence = {
      cloneDatabase: client.databaseName(manifest.pendingClone.database),
      sourceDatabase,
      snapshotTime: manifest.readTime,
      state: "READY",
      operationRef: manifest.pendingClone.operation,
      lroDone: true,
      lroMetadata: manifest.pendingClone.lroMetadata,
      lroResponse: manifest.pendingClone.lroResponse,
      databaseReadback: manifest.pendingClone.databaseReadback,
      verification: "manifest-record-hashes",
      verifiedRecordCount: verified.count,
      verifiedAggregateHash: productionTestRecordAggregateHash(counted.records),
      verifiedAt,
    };
    if (clone.verifiedAggregateHash !== verified.aggregateHash) {
      throw new Error("The clone aggregate hash differs from the counted manifest.");
    }
    const retirement = buildProductionTestRetirementManifest({
      records: counted.records,
      backup,
      clone,
      countedAt: counted.countedAt,
    });
    manifest = { ...manifest, retirement };
    await writePrivateManifest(manifestPath, manifest);
    stdout(
      `Named S56 clone full-field verification passed for ${verified.count} records.`,
    );
    return;
  }

  if (args.phase === "rehearse-restore") {
    const retirement = requireBackupVerified(manifest);
    manifest = await rehearseProductionTestRestore({
      client,
      retirement,
      manifest,
      drill: args.restoreDrillDatabase!,
      persist: (next) => writePrivateManifest(manifestPath, next),
      sleep,
      now,
      stdout,
    });
    stdout(
      "One-record create-only restore rehearsal passed; the disposable drill database was removed.",
    );
    return;
  }

  if (args.phase === "delete") {
    const retirement = requireBackupVerified(manifest);
    if (!manifest.restoreProof) {
      throw new Error(
        "Delete requires a verified named clone and a valid restore rehearsal proof.",
      );
    }
    validateProductionTestRestoreProof(retirement, manifest.restoreProof);
    const currentReadTime = await client.captureServerReadTime();
    const current = await inventoryProduction(client, currentReadTime);
    assertExactProductionTestCandidateSet(retirement, current.records);
    const batches = buildProductionTestCasDeleteBatches(
      retirement,
      current.records,
      manifest.restoreProof,
    );
    await verifyPreDeleteLiveEvidence({
      client,
      retirement,
      env,
      account,
      execFile: execTransport,
    });
    const commitTimes: string[] = [];
    manifest = {
      ...manifest,
      deletion: {
        completedAt: currentReadTime,
        deletedCount: 0,
        commitTimes: [],
      },
    };
    await writePrivateManifest(manifestPath, manifest);
    const deleteWrites = batches.flatMap((batch) => batch.writes);
    for (const batch of batchFirestoreWritesForCommit(deleteWrites)) {
      const committed = await client.commitWrites(batch);
      commitTimes.push(committed.commitTime);
      manifest = {
        ...manifest,
        deletion: appendDeletionCommitEvidence(
          manifest.deletion!,
          committed.commitTime,
          batch.length,
        ),
      };
      await writePrivateManifest(manifestPath, manifest);
    }
    const completedAt =
      commitTimes.length > 0
        ? commitTimes.reduce((latest, candidate) =>
            compareFirestoreTimestamps(candidate, latest) > 0 ? candidate : latest,
          )
        : await client.captureServerReadTime();
    const zeroReadTime = await client.captureServerReadTime();
    if (compareFirestoreTimestamps(zeroReadTime, completedAt) < 0) {
      throw new Error("The zero-proof snapshot predates the Firestore delete commit.");
    }
    const zero = await inventoryProduction(client, zeroReadTime);
    if (zero.records.length !== 0) {
      throw new Error(
        "Post-delete recount found remaining Test records; rollback remains available.",
      );
    }
    manifest = {
      ...manifest,
      deletion: sealZeroDeletionEvidence(
        {
          completedAt,
          deletedCount: current.records.length,
          commitTimes,
        },
        retirement.totalTest,
        zeroReadTime,
      ),
    };
    await writePrivateManifest(manifestPath, manifest);
    stdout(`CAS deletion passed for ${current.records.length} records.`);
    stdout(formatZeroCounts(zero));
    return;
  }

  if (args.phase === "verify-zero") {
    const retirement = requireRetirement(manifest);
    const readTime = await client.captureServerReadTime();
    if (
      manifest.deletion &&
      compareFirestoreTimestamps(readTime, manifest.deletion.completedAt) < 0
    ) {
      throw new Error("The zero-proof snapshot predates the Firestore delete commit.");
    }
    const zero = await inventoryProduction(client, readTime);
    if (zero.records.length !== 0) {
      throw new Error("Production still contains explicitly Test-classified records.");
    }
    if (!manifest.deletion && retirement.totalTest > 0) {
      throw new Error(
        "Zero records cannot reconcile a non-empty manifest without a deletion journal.",
      );
    }
    manifest = {
      ...manifest,
      deletion: manifest.deletion
        ? sealZeroDeletionEvidence(manifest.deletion, retirement.totalTest, readTime)
        : undefined,
    };
    await writePrivateManifest(manifestPath, manifest);
    stdout(formatZeroCounts(zero));
    return;
  }

  const retirement = requireBackupVerified(manifest);
  if (!manifest.restoreProof) {
    throw new Error("Rollback requires the verified clone and restore rehearsal proof.");
  }
  validateProductionTestRestoreProof(retirement, manifest.restoreProof);
  const records = retirement.records;
  const cloneDatabase = databaseIdFromName(retirement.clone.cloneDatabase);
  const sourceDocuments = await client.batchGetDocuments(
    records.map((record) => cloneDocumentName(record, cloneDatabase)),
    { database: cloneDatabase },
  );
  const byName = new Map(sourceDocuments.map((document) => [document.name, document]));
  const ordered = records.map((record) => {
    const source = byName.get(cloneDocumentName(record, cloneDatabase));
    if (!source?.fields || hashFirestoreFields(source.fields) !== record.recordHash) {
      throw new Error("Rollback source differs from the verified clone hash.");
    }
    return source;
  });
  const destinations = records.map((record) => cloneDocumentName(record, S56_DATABASE));
  const rollbackPreflightReadTime = await client.captureServerReadTime();
  const existing = await client.batchLookupDocuments(destinations, {
    readTime: rollbackPreflightReadTime,
  });
  const missing = new Set(
    selectMissingRollbackDestinations(records, existing.found, existing.missing),
  );
  const missingRecords = ordered.flatMap((document, index) =>
    missing.has(destinations[index])
      ? [{ documentName: destinations[index], fields: document.fields! }]
      : [],
  );
  const writes =
    missingRecords.length > 0
      ? buildProductionTestCreateOnlyRestoreWrites(missingRecords, client.databaseName())
      : [];
  const rollbackCommitTimes: string[] = [];
  for (const batch of batchFirestoreWritesForCommit(writes)) {
    const committed = await client.commitWrites(batch);
    rollbackCommitTimes.push(committed.commitTime);
  }
  const rollbackVerifiedAt = await client.captureServerReadTime();
  if (
    rollbackCommitTimes.some(
      (commitTime) => compareFirestoreTimestamps(rollbackVerifiedAt, commitTime) < 0,
    )
  ) {
    throw new Error("The rollback verification snapshot predates a restore commit.");
  }
  const restored = await client.batchGetDocuments(
    records.map((record) => cloneDocumentName(record, S56_DATABASE)),
    { readTime: rollbackVerifiedAt },
  );
  const restoredByName = new Map(restored.map((document) => [document.name, document]));
  for (const record of records) {
    const document = restoredByName.get(cloneDocumentName(record, S56_DATABASE));
    if (!document?.fields || hashFirestoreFields(document.fields) !== record.recordHash) {
      throw new Error("Rollback readback differs from the verified clone hash.");
    }
  }
  manifest = {
    ...manifest,
    rollback: {
      completedAt: rollbackVerifiedAt,
      restoredCount: missingRecords.length,
      aggregateHash: productionTestRecordAggregateHash(records),
    },
  };
  await writePrivateManifest(manifestPath, manifest);
  stdout(
    `Create-only rollback restored ${missingRecords.length} missing records and hash-verified all ${records.length}.`,
  );
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  dependencies: S56RuntimeDependencies = {},
): Promise<void> {
  const args = parseS56Arguments(argv);
  await runS56Phase(args, env, dependencies);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "S56 retirement failed closed.",
    );
    process.exitCode = 1;
  });
}
