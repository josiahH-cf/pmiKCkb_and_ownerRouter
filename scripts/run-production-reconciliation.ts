import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import {
  applicationDefault,
  deleteApp,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { chromium, type Page } from "playwright-core";

import {
  ASSURANCE_RUN_TIMEOUT_MS,
  PRODUCTION_ASSURANCE_SCHEMA_VERSION,
  assertRenewalSheetResponseIdentity,
  closeGuardedManagedBrowser,
  createAssuranceDeadline,
  emptyReconciliationCounts,
  evaluateReconciliation,
  forceCloseGuardedManagedBrowser,
  launchGuardedManagedBrowser,
  readVerifiedCloudRunOriginBinding,
  readVerifiedRevisionBoundRenewalSheetConfig,
  remainingAssuranceTime,
  requireRevisionConfigurationFingerprint,
  type AssurancePhase,
  type AssuranceRole,
  type CloudRunRevisionReadClient,
  type ProductionAssuranceEvidence,
  type ReconciliationAssuranceEvidence,
  type ReconciliationCounts,
  type SourceReadState,
  withAssuranceTimeout,
} from "../lib/production-assurance";
import { GoogleSheetsApiReader } from "../lib/google-sheets/read-client";
import { LEASE_RENEWAL_PROGRESS_COLLECTIONS } from "../lib/firestore/lease-renewal-progress-schema";
import { LEASE_RENEWAL_COLLECTIONS } from "../lib/firestore/lease-renewal-resolutions";
import { buildLiveRentVineConfig } from "../lib/lease-renewal/live-config";
import {
  countIndependentActionDestinationMismatches,
  countIndependentStatusMismatches,
  countIndependentWorkspaceDestinationMismatches,
  independentSourceDigest,
  independentRentVineCurrentRent,
  independentWorkspaceExpected,
  projectIndependentRentExpectation,
  projectIndependentRentVineRows,
  projectIndependentSheetLinks,
  validRenderedRentvineSourceDestination,
  type IndependentActionDestinationObservation,
  type IndependentRenderedStatus,
  type IndependentRentExpectation,
  type IndependentRenewalSourceRow,
  type IndependentSheetProjection,
  type IndependentWorkspaceDestinationObservation,
} from "../lib/production-assurance/renewal-source-projection";
import {
  findBrowserExecutable,
  hasArg,
  readArg,
  requireExplicitLive,
  resolveManagedProfile,
  resolveProductionTarget,
  resolveRole,
  safeCliFailure,
  safeSameOrigin,
  verifyExactVersion,
  writeAssuranceReport,
  type ProductionTarget,
} from "./production-assurance-runtime";
import {
  assertAssuranceAdcIdentity,
  assertLiveAssuranceEnvironment,
  preflightProductionAssurance,
  verifiedAssuranceClient,
  type VerifiedProductionAssuranceContext,
} from "./production-assurance-preflight";

export { assertAssuranceAdcIdentity, assertLiveAssuranceEnvironment };

const PAGE_TIMEOUT_MS = 60_000;
const SETTLED_TIMEOUT_MS = 10_000;
const RENEWAL_SHEET_TITLE = "Lease Renewal";
const LIVE_REVIEW_RUN_ID = "live-review";
const DEFAULT_PROJECT = "pmi-kc-kb-prod";
const DEFAULT_REGION = "us-central1";
const DEFAULT_SERVICE = "pmi-kc-app";

export type IndependentRenewalRetentionState =
  | "window"
  | "needs_verification"
  | "tracked_incomplete"
  | "outside";

export type IndependentExpectedOverallStatus =
  | "needs_verification"
  | "blocked"
  | "complete"
  | "waiting"
  | "ready"
  | "needs_review";

export interface IndependentRenderedProcessState {
  readonly processStatus: string | null;
  readonly currentStepId: string | null;
  readonly currentStepState: string | null;
  readonly waitingParty: string | null;
}

export interface IndependentExpectedGuidanceState {
  readonly overallStatus: IndependentExpectedOverallStatus;
  readonly actionStepId: string | null;
  readonly markerMismatches: number;
}

interface ExpectedProjectionRow extends IndependentRenewalSourceRow {
  readonly workspaceExpected: boolean;
  readonly dispositionExpected: "actionable" | "skip" | "review" | "out_of_window";
  readonly retentionExpected: IndependentRenewalRetentionState;
  readonly processExpected: boolean;
  readonly rentReconciliationExpected: boolean;
  readonly rentExpectation: IndependentRentExpectation;
}

interface RenderedProjectionRow extends IndependentRenewalSourceRow {
  readonly disposition: string | null;
  readonly retentionState: string | null;
  readonly processState: IndependentRenderedProcessState;
  readonly status: IndependentRenderedStatus;
  readonly workspace: IndependentWorkspaceDestinationObservation;
  readonly action: IndependentActionDestinationObservation;
  readonly statusFilterHrefs: readonly (string | null)[];
}

interface DirectProjection {
  readonly rows: readonly ExpectedProjectionRow[];
  readonly sourceRecords: number;
  readonly projectedRecords: number;
  readonly rentvine: SourceReadState;
  readonly sheet: SourceReadState;
  readonly decision: SourceReadState;
  /** Process-memory-only; excluded from evidence serialization. */
  readonly sourceDigest: string | null;
}

interface RenderedProjection {
  readonly rows: readonly RenderedProjectionRow[];
  readonly application: SourceReadState;
  readonly invalidDestinations: number;
  readonly fieldMismatches: number;
}

export interface LiveReconciliationOptions extends ProductionTarget {
  readonly role: AssuranceRole;
  readonly profile: string;
  readonly headed?: boolean;
  readonly generatedAt?: string;
  readonly phase?: AssurancePhase;
  readonly project: string;
  readonly region: string;
  readonly service: string;
  readonly expectedConfigurationFingerprint: string;
  readonly deadlineAtMs?: number;
  readonly abortSignal?: AbortSignal;
  readonly assuranceContext?: VerifiedProductionAssuranceContext;
}

interface IndependentSourceClients {
  readonly rentvine: ReturnType<typeof buildLiveRentVineConfig>;
  readonly expectedRentvineHost: string | null;
  readonly sheet: {
    readonly reader: GoogleSheetsApiReader;
    readonly spreadsheetId: string;
  };
  readonly firestore: Firestore;
  close(): Promise<void>;
}

interface LocalRepositoryState {
  readonly head: string;
  readonly trackedChanges: string;
}

export function assertLocalSourceAdapterIdentity(
  expectedCommit: string,
  state: LocalRepositoryState,
): void {
  if (state.head.toLowerCase() !== expectedCommit.toLowerCase()) {
    throw new Error(
      "The local source adapter is not checked out at the expected commit.",
    );
  }
  if (state.trackedChanges.trim() !== "") {
    throw new Error("The local source adapter checkout has uncommitted source changes.");
  }
}

function readLocalRepositoryState(): LocalRepositoryState {
  const cwd = process.cwd();
  return {
    head: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim(),
    trackedChanges: execFileSync(
      "git",
      [
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--",
        "scripts",
        "lib",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
      ],
      {
        cwd,
        encoding: "utf8",
        timeout: 30_000,
        stdio: ["ignore", "pipe", "ignore"],
      },
    ),
  };
}

function independentFirestore(project: string): {
  readonly firestore: Firestore;
  readonly app: App;
} {
  const app = initializeApp(
    { credential: applicationDefault(), projectId: project },
    `production-assurance-${randomUUID()}`,
  );
  return { firestore: getFirestore(app, "(default)"), app };
}

async function readIndependentLiveReviewResolutions(
  firestore: Firestore,
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const snapshot = await firestore
    .collection(LEASE_RENEWAL_COLLECTIONS.resolutions)
    .where("run_id", "==", LIVE_REVIEW_RUN_ID)
    .get();
  return snapshot.docs.map((document) => {
    const value = document.data();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("independent_resolution_read_invalid");
    }
    return value;
  });
}

interface IndependentDecisionFacts {
  readonly resolutions: readonly Readonly<Record<string, unknown>>[];
  readonly trackedIncompleteLeaseIds: ReadonlySet<string>;
}

async function readIndependentDecisionFacts(
  firestore: Firestore,
): Promise<IndependentDecisionFacts> {
  const [resolutions, progress] = await Promise.all([
    readIndependentLiveReviewResolutions(firestore),
    firestore.collection(LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress).get(),
  ]);
  const trackedIncompleteLeaseIds = new Set<string>();
  const seenLeaseIds = new Set<string>();
  for (const document of progress.docs) {
    const value = document.data();
    const leaseId = value.lease_id;
    if (
      typeof leaseId !== "string" ||
      leaseId.trim() === "" ||
      typeof value.complete !== "boolean" ||
      seenLeaseIds.has(leaseId)
    ) {
      throw new Error("independent_progress_read_invalid");
    }
    seenLeaseIds.add(leaseId);
    if (!value.complete) trackedIncompleteLeaseIds.add(leaseId);
  }
  return { resolutions, trackedIncompleteLeaseIds };
}

async function createIndependentSourceClients(
  options: LiveReconciliationOptions,
  env: NodeJS.ProcessEnv = process.env,
  abortSignal?: AbortSignal,
  revisionClient?: CloudRunRevisionReadClient,
): Promise<IndependentSourceClients> {
  const lifetime = new AbortController();
  const clientSignal = abortSignal
    ? AbortSignal.any([abortSignal, lifetime.signal])
    : lifetime.signal;
  const rentvine = buildLiveRentVineConfig(env, { abortSignal: clientSignal });
  const baseUrl = env.RENTVINE_API_BASE_URL?.trim();
  let expectedRentvineHost: string | null = null;
  if (rentvine.ok && baseUrl) {
    try {
      expectedRentvineHost = new URL(baseUrl).hostname.toLowerCase();
    } catch {
      expectedRentvineHost = null;
    }
  }

  if (!revisionClient) throw new Error("assurance_preflight_context_required");
  await readVerifiedCloudRunOriginBinding(
    revisionClient,
    {
      project: options.project,
      region: options.region,
      service: options.service,
      expectedRevision: options.expectedRevision,
      origin: options.origin,
      phase: options.phase ?? "candidate",
    },
    clientSignal,
  );
  const revisionSheet = await readVerifiedRevisionBoundRenewalSheetConfig(
    revisionClient,
    {
      project: options.project,
      region: options.region,
      service: options.service,
      expectedRevision: options.expectedRevision,
      expectedConfigurationFingerprint: options.expectedConfigurationFingerprint,
    },
    clientSignal,
  );
  const sheet = {
    reader: new GoogleSheetsApiReader(
      revisionSheet.impersonateServiceAccount,
      revisionSheet.dwdSubject,
      clientSignal,
    ),
    spreadsheetId: revisionSheet.spreadsheetId,
  };
  const { firestore, app } = independentFirestore(options.project);
  let closePromise: Promise<void> | null = null;
  return {
    rentvine,
    expectedRentvineHost,
    sheet,
    firestore,
    async close() {
      if (!closePromise) {
        lifetime.abort(new Error("assurance_clients_closed"));
        closePromise = (async () => {
          const results = await Promise.allSettled([
            firestore.terminate(),
            deleteApp(app),
          ]);
          if (results.some((result) => result.status === "rejected")) {
            throw new Error("reconciliation_source_cleanup_failed");
          }
        })();
      }
      await closePromise;
    },
  };
}

async function readIndependentSheetProjection(
  reader: GoogleSheetsApiReader,
  spreadsheetId: string,
  expectedRentvineHost: string,
): Promise<IndependentSheetProjection> {
  const [evaluated, formulas, notes] = await Promise.all([
    reader.batchGet(spreadsheetId, [RENEWAL_SHEET_TITLE]),
    reader.batchGetFormulas(spreadsheetId, [RENEWAL_SHEET_TITLE]),
    reader.batchGetNotes(spreadsheetId, [RENEWAL_SHEET_TITLE]),
  ]);
  assertRenewalSheetResponseIdentity(evaluated, spreadsheetId);
  assertRenewalSheetResponseIdentity(formulas, spreadsheetId);
  if (
    Object.keys(notes).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(notes, RENEWAL_SHEET_TITLE)
  ) {
    throw new Error("renewal_sheet_notes_identity_mismatch");
  }
  return projectIndependentSheetLinks(evaluated, formulas, notes, expectedRentvineHost);
}

export function aggregateReadStates(
  ...states: readonly SourceReadState[]
): SourceReadState {
  if (states.length === 0 || states.includes("unavailable")) return "unavailable";
  return states.includes("partial") ? "partial" : "complete";
}

function directProjectionDigest(
  rows: readonly ExpectedProjectionRow[],
  sheetDigest: string,
): string {
  const base = independentSourceDigest(rows, sheetDigest);
  const decisions = [...rows]
    .sort((left, right) => left.leaseId.localeCompare(right.leaseId))
    .map((row) => ({
      leaseId: row.leaseId,
      workspaceExpected: row.workspaceExpected,
      dispositionExpected: row.dispositionExpected,
      retentionExpected: row.retentionExpected,
      processExpected: row.processExpected,
      rentReconciliationExpected: row.rentReconciliationExpected,
      rentExpectation: row.rentExpectation,
    }));
  return createHash("sha256").update(JSON.stringify({ base, decisions })).digest("hex");
}

export async function runProductionReconciliation(
  options: LiveReconciliationOptions,
): Promise<ProductionAssuranceEvidence> {
  const deadlineAtMs = options.deadlineAtMs ?? Date.now() + ASSURANCE_RUN_TIMEOUT_MS;
  const deadline = createAssuranceDeadline(deadlineAtMs, options.abortSignal);
  try {
    const expectedConfigurationFingerprint = requireRevisionConfigurationFingerprint(
      options.expectedConfigurationFingerprint,
    );
    assertLocalSourceAdapterIdentity(options.expectedCommit, readLocalRepositoryState());
    const assuranceContext =
      options.assuranceContext ??
      (await preflightProductionAssurance({
        project: options.project,
        deadlineAtMs,
        abortSignal: deadline.signal,
      }));
    const revisionClient = verifiedAssuranceClient(assuranceContext, options.project);
    await runWithinReconciliationDeadline(
      () => verifyExactVersion(options, deadline.signal),
      deadlineAtMs,
    );
    const clients = await runWithinReconciliationDeadline(
      () =>
        createIndependentSourceClients(
          {
            ...options,
            expectedConfigurationFingerprint,
          },
          process.env,
          deadline.signal,
          revisionClient,
        ),
      deadlineAtMs,
    );
    const closeOnAbort = (): void => {
      void clients.close().catch(() => undefined);
    };
    deadline.signal.addEventListener("abort", closeOnAbort, { once: true });
    try {
      return await reconcileWithIndependentClients(
        options,
        clients,
        deadlineAtMs,
        deadline.signal,
      );
    } finally {
      deadline.signal.removeEventListener("abort", closeOnAbort);
      await closeReconciliationClientsWithinDeadline(() => clients.close(), deadlineAtMs);
    }
  } finally {
    deadline.dispose();
  }
}

async function reconcileWithIndependentClients(
  options: LiveReconciliationOptions,
  clients: IndependentSourceClients,
  deadlineAtMs: number,
  abortSignal: AbortSignal,
): Promise<ProductionAssuranceEvidence> {
  const referenceDateIso = reconciliationReferenceDate(
    options.generatedAt ?? new Date().toISOString(),
  );
  let before: DirectProjection;
  let rendered: RenderedProjection;
  let after: DirectProjection;
  try {
    before = await runWithinReconciliationDeadline(
      () => readDirectProjection(clients, referenceDateIso, deadlineAtMs),
      deadlineAtMs,
    );
    // The browser helper owns and settles its finite Playwright launch. Do not Promise-race the
    // launch path or a context that resolves after the race could outlive reconciliation cleanup.
    rendered = await readRenderedProjection(
      options,
      before.rows,
      clients.expectedRentvineHost,
      deadlineAtMs,
      abortSignal,
    );
    after = await runWithinReconciliationDeadline(
      () => readDirectProjection(clients, referenceDateIso, deadlineAtMs),
      deadlineAtMs,
    );
  } catch {
    return unavailableReconciliationReport(options);
  }
  const sourceDrift =
    before.rentvine !== "complete" ||
    before.sheet !== "complete" ||
    before.decision !== "complete" ||
    after.rentvine !== "complete" ||
    after.sheet !== "complete" ||
    after.decision !== "complete"
      ? "unknown"
      : before.sourceDigest !== null && before.sourceDigest === after.sourceDigest
        ? "stable"
        : "changed";
  const counts = compareProjectionRows(before, rendered, options.role, options.origin);
  const reconciliation = evaluateReconciliation({
    rentvine: aggregateReadStates(before.rentvine, after.rentvine),
    sheet: aggregateReadStates(before.sheet, after.sheet),
    application: aggregateReadStates(
      before.decision,
      rendered.application,
      after.decision,
    ),
    sourceDrift,
    counts,
  });
  return reportForReconciliation(options, reconciliation);
}

function unavailableReconciliationReport(
  options: LiveReconciliationOptions,
): ProductionAssuranceEvidence {
  return reportForReconciliation(
    options,
    evaluateReconciliation({
      rentvine: "unavailable",
      sheet: "unavailable",
      application: "unavailable",
      sourceDrift: "unknown",
      counts: emptyReconciliationCounts(),
    }),
  );
}

async function runWithinReconciliationDeadline<T>(
  operation: () => Promise<T>,
  deadlineAtMs: number,
): Promise<T> {
  const remaining = remainingAssuranceTime(deadlineAtMs, ASSURANCE_RUN_TIMEOUT_MS);
  return withAssuranceTimeout(operation, "reconciliation_deadline_exceeded", remaining);
}

export async function closeReconciliationClientsWithinDeadline(
  closeClients: () => Promise<void>,
  deadlineAtMs: number,
): Promise<void> {
  // Start cleanup even at the deadline, then bound how long the caller can wait. Firestore exposes
  // no cancellation signal for terminate(), so deleteApp is started concurrently by the client.
  const cleanup = closeClients();
  const remaining = Math.max(
    1,
    remainingAssuranceTime(deadlineAtMs, ASSURANCE_RUN_TIMEOUT_MS),
  );
  await withAssuranceTimeout(
    () => cleanup,
    "reconciliation_source_cleanup_deadline_exceeded",
    remaining,
  );
}

function beginSourceClientClose(clients: IndependentSourceClients): void {
  void clients.close().catch(() => undefined);
}

async function readDirectProjection(
  clients: IndependentSourceClients,
  referenceDateIso: string,
  deadlineAtMs: number,
): Promise<DirectProjection> {
  const providerTimeoutMs = remainingAssuranceTime(deadlineAtMs, 120_000);
  const rentvineClient = clients.rentvine.ok ? clients.rentvine.rentvineClient : null;
  const rentvineRead = rentvineClient
    ? await withAssuranceTimeout(
        () => rentvineClient.listAllLeasesExport(),
        "rentvine_assurance_read_timeout",
        providerTimeoutMs,
        { onTimeout: () => beginSourceClientClose(clients) },
      )
        .then((value) => ({ ok: true as const, value }))
        .catch(() => ({ ok: false as const }))
    : ({ ok: false as const } as const);
  const expectedRentvineHost = clients.expectedRentvineHost;
  const sheetRead = expectedRentvineHost
    ? await withAssuranceTimeout(
        () =>
          readIndependentSheetProjection(
            clients.sheet.reader,
            clients.sheet.spreadsheetId,
            expectedRentvineHost,
          ),
        "sheet_assurance_read_timeout",
        providerTimeoutMs,
        { onTimeout: () => beginSourceClientClose(clients) },
      )
        .then((value) => ({ ok: true as const, value }))
        .catch(() => ({ ok: false as const }))
    : ({ ok: false as const } as const);
  const decisionRead = await withAssuranceTimeout(
    () => readIndependentDecisionFacts(clients.firestore),
    "firestore_assurance_read_timeout",
    providerTimeoutMs,
    { onTimeout: () => beginSourceClientClose(clients) },
  )
    .then((value) => ({ ok: true as const, value }))
    .catch(() => ({ ok: false as const }));

  const baseRows = rentvineRead.ok
    ? projectIndependentRentVineRows(
        rentvineRead.value.rows,
        sheetRead.ok ? sheetRead.value.leaseUrls : new Map(),
      )
    : [];
  let decision: SourceReadState = decisionRead.ok ? "complete" : "unavailable";
  let rows: ExpectedProjectionRow[] = [];
  if (rentvineRead.ok) {
    try {
      rows = buildExpectedProjectionRows(
        baseRows,
        rentvineRead.value.rows,
        sheetRead.ok ? sheetRead.value : null,
        decisionRead.ok
          ? decisionRead.value
          : { resolutions: [], trackedIncompleteLeaseIds: new Set() },
        referenceDateIso,
      );
    } catch {
      decision = "unavailable";
      rows = buildExpectedProjectionRows(
        baseRows,
        rentvineRead.value.rows,
        sheetRead.ok ? sheetRead.value : null,
        { resolutions: [], trackedIncompleteLeaseIds: new Set() },
        referenceDateIso,
      );
    }
  }
  return {
    rows,
    sourceRecords: rentvineRead.ok ? rentvineRead.value.rows.length : 0,
    projectedRecords: rows.length,
    rentvine: rentvineRead.ok
      ? rentvineRead.value.complete
        ? "complete"
        : "partial"
      : "unavailable",
    sheet: sheetRead.ok ? "complete" : "unavailable",
    decision,
    sourceDigest:
      rentvineRead.ok && sheetRead.ok && decision === "complete"
        ? directProjectionDigest(rows, sheetRead.value.sourceDigest)
        : null,
  };
}

function buildExpectedProjectionRows(
  baseRows: readonly IndependentRenewalSourceRow[],
  rentvineRows: readonly Record<string, unknown>[],
  sheet: IndependentSheetProjection | null,
  decisions: IndependentDecisionFacts,
  referenceDateIso: string,
): ExpectedProjectionRow[] {
  return baseRows.map((row, index) => {
    const sourceRow = rentvineRows[index] ?? {};
    const workspaceExpected = independentWorkspaceExpected(sourceRow);
    const dispositionExpected = independentDispositionExpected(
      row,
      workspaceExpected,
      referenceDateIso,
    );
    // A definitive source skip outranks obsolete app-owned progress. It never creates a process,
    // action, or retained-incomplete workflow in the independent expectation.
    const trackedIncomplete =
      workspaceExpected && decisions.trackedIncompleteLeaseIds.has(row.leaseId);
    const retentionExpected = independentRetentionExpected(
      row,
      trackedIncomplete,
      referenceDateIso,
      workspaceExpected,
    );
    const rentReconciliationExpected =
      dispositionExpected === "actionable" || trackedIncomplete;
    const processExpected = rentReconciliationExpected;
    const sourceExpectation: IndependentRentExpectation = row.leaseId
      ? projectIndependentRentExpectation({
          leaseId: row.leaseId,
          rentvineCurrentRent: independentRentVineCurrentRent(sourceRow),
          sheetFact: sheet?.byLeaseId.get(row.leaseId) ?? null,
          resolutions: decisions.resolutions,
        })
      : {
          evidence: "missing_sheet",
          rentVerification: "needs_verification",
          verifiedByResolutionDiffers: false,
          resolvedValue: null,
        };
    const rentExpectation = projectIndependentExpectedRentState({
      workspaceExpected,
      dispositionExpected,
      sourceExpectation,
    });
    return {
      ...row,
      workspaceExpected,
      dispositionExpected,
      retentionExpected,
      processExpected,
      rentReconciliationExpected,
      rentExpectation,
    };
  });
}

/**
 * Rent source/resolution truth is observable for every workspace-eligible desk row, including
 * review and out-of-window rows. Process and action eligibility remain a separate cohort decision.
 */
export function projectIndependentExpectedRentState(input: {
  readonly workspaceExpected: boolean;
  readonly dispositionExpected: ExpectedProjectionRow["dispositionExpected"];
  readonly sourceExpectation: IndependentRentExpectation;
}): IndependentRentExpectation {
  if (input.workspaceExpected && input.dispositionExpected !== "skip") {
    return input.sourceExpectation;
  }
  return {
    ...input.sourceExpectation,
    rentVerification: "needs_verification",
    verifiedByResolutionDiffers: false,
    resolvedValue: null,
  };
}

function reconciliationReferenceDate(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) throw new Error("reconciliation_time_invalid");
  return new Date(parsed).toISOString().slice(0, 10);
}

export function classifyIndependentRenewalDisposition(input: {
  readonly row: IndependentRenewalSourceRow;
  readonly workspaceExpected: boolean;
  readonly referenceDateIso: string;
}): ExpectedProjectionRow["dispositionExpected"] {
  const { row, workspaceExpected, referenceDateIso } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDateIso)) {
    throw new Error("reconciliation_reference_date_invalid");
  }
  return independentDispositionExpected(row, workspaceExpected, referenceDateIso);
}

export function classifyIndependentRenewalRetention(input: {
  readonly row: IndependentRenewalSourceRow;
  readonly trackedIncomplete: boolean;
  readonly referenceDateIso: string;
  readonly workspaceExpected?: boolean;
}): IndependentRenewalRetentionState {
  const { row, trackedIncomplete, referenceDateIso, workspaceExpected = true } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDateIso)) {
    throw new Error("reconciliation_reference_date_invalid");
  }
  return independentRetentionExpected(
    row,
    trackedIncomplete,
    referenceDateIso,
    workspaceExpected,
  );
}

function independentRetentionExpected(
  row: IndependentRenewalSourceRow,
  trackedIncomplete: boolean,
  referenceDateIso: string,
  workspaceExpected = true,
): IndependentRenewalRetentionState {
  if (!workspaceExpected) return "outside";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.endDate)) return "needs_verification";
  const { startIso, endIso } = independentRenewalWindow(referenceDateIso);
  if (row.endDate >= startIso && row.endDate <= endIso) return "window";
  return trackedIncomplete ? "tracked_incomplete" : "outside";
}

/**
 * Derive the exact desk status/action from independently checked source precedence plus separate
 * app-owned S72 markers. The process markers verify S72-to-guidance parity only: they do not claim
 * to independently corroborate actor-scoped Gmail, notice-policy, or packet truth.
 */
export function projectIndependentExpectedGuidanceState(input: {
  readonly dispositionExpected: ExpectedProjectionRow["dispositionExpected"];
  readonly retentionExpected: IndependentRenewalRetentionState;
  readonly processExpected: boolean;
  readonly rentReconciliationExpected: boolean;
  readonly rentExpectation: IndependentRentExpectation;
  readonly processState: IndependentRenderedProcessState;
}): IndependentExpectedGuidanceState {
  const processStatuses = new Set([
    "active",
    "waiting",
    "counter_reopened",
    "needs_verification",
    "non_renewal_handoff_required",
    "non_renewal_handoff",
    "complete",
    "migration_required",
  ]);
  const stepStates = new Set(["not_started", "blocked", "ready", "complete"]);
  const waitingParties = new Set([
    "none",
    "team",
    "owner",
    "tenant",
    "document_coordinator",
    "unresolved_source",
  ]);
  const { processState } = input;
  const unresolvedRent =
    input.rentReconciliationExpected &&
    input.rentExpectation.rentVerification === "needs_verification";
  let markerMismatches = waitingParties.has(processState.waitingParty ?? "") ? 0 : 1;
  if (input.processExpected) {
    if (!processStatuses.has(processState.processStatus ?? "")) markerMismatches += 1;
    if (!WORKSPACE_STEPS.has(processState.currentStepId ?? "")) {
      markerMismatches += 1;
    }
    if (!stepStates.has(processState.currentStepState ?? "")) markerMismatches += 1;
    if (unresolvedRent && processState.currentStepId !== "verify-renewal") {
      markerMismatches += 1;
    }
  } else if (
    processState.processStatus !== "none" ||
    processState.currentStepId !== "none" ||
    processState.currentStepState !== "none"
  ) {
    markerMismatches += 1;
  }

  let overallStatus: IndependentExpectedOverallStatus;
  if (input.dispositionExpected === "review") {
    overallStatus = "needs_verification";
  } else if (
    input.rentReconciliationExpected &&
    input.rentExpectation.rentVerification === "needs_verification"
  ) {
    overallStatus =
      input.rentExpectation.evidence === "conflict" ? "blocked" : "needs_verification";
  } else if (!input.processExpected) {
    overallStatus = "needs_review";
  } else if (
    processState.processStatus === "needs_verification" ||
    processState.processStatus === "migration_required"
  ) {
    overallStatus = "needs_verification";
  } else if (
    processState.currentStepState === "blocked" &&
    processState.processStatus !== "waiting"
  ) {
    overallStatus = "blocked";
  } else if (processState.processStatus === "complete") {
    overallStatus = "complete";
  } else if (processState.processStatus === "waiting") {
    overallStatus = "waiting";
  } else if (
    processState.currentStepState === "ready" ||
    processState.processStatus === "counter_reopened" ||
    processState.processStatus === "non_renewal_handoff_required"
  ) {
    overallStatus = "ready";
  } else if (
    processState.currentStepState === "not_started" &&
    ["team", "owner", "tenant", "document_coordinator"].includes(
      processState.waitingParty ?? "",
    )
  ) {
    overallStatus = "waiting";
  } else {
    overallStatus = "needs_review";
  }

  const actionStepId = unresolvedRent
    ? "verify-renewal"
    : overallStatus === "complete"
      ? "compliance-close"
      : overallStatus === "ready" ||
          overallStatus === "waiting" ||
          overallStatus === "blocked" ||
          (overallStatus === "needs_verification" &&
            input.dispositionExpected !== "review")
        ? processState.currentStepId === "none"
          ? null
          : processState.currentStepId
        : overallStatus === "needs_verification"
          ? "verify-renewal"
          : null;

  return { overallStatus, actionStepId, markerMismatches };
}

export function countIndependentExpectedRowStateMismatches(input: {
  readonly expectedRetention: IndependentRenewalRetentionState;
  readonly expectedOverallStatus: IndependentExpectedOverallStatus;
  readonly observedRetention: string | null;
  readonly observedOverallStatus: string | null;
}): number {
  let mismatches = input.observedRetention === input.expectedRetention ? 0 : 1;
  if (input.observedOverallStatus !== input.expectedOverallStatus) {
    mismatches += 1;
  }
  return mismatches;
}

function independentRenewalWindow(referenceDateIso: string): {
  readonly startIso: string;
  readonly endIso: string;
} {
  const startIso = `${referenceDateIso.slice(0, 7)}-01`;
  const end = new Date(`${referenceDateIso}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 120);
  return { startIso, endIso: end.toISOString().slice(0, 10) };
}

function independentDispositionExpected(
  row: IndependentRenewalSourceRow,
  workspaceExpected: boolean,
  referenceDateIso: string,
): ExpectedProjectionRow["dispositionExpected"] {
  if (!workspaceExpected) return "skip";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.endDate)) return "review";
  const { startIso, endIso } = independentRenewalWindow(referenceDateIso);
  if (row.endDate < startIso || row.endDate > endIso) return "out_of_window";
  const next = new Date(`${row.endDate}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.getUTCDate() === 1 ? "actionable" : "review";
}

async function readRenderedProjection(
  options: LiveReconciliationOptions,
  expectedRows: readonly ExpectedProjectionRow[],
  expectedRentvineHost: string | null,
  deadlineAtMs: number,
  abortSignal: AbortSignal,
): Promise<RenderedProjection> {
  let mutationAttempt = false;
  const context = await launchGuardedManagedBrowser({
    profile: options.profile,
    executablePath: findBrowserExecutable(),
    headless: !options.headed,
    viewport: { width: 1440, height: 1000 },
    launchTimeoutMs: remainingAssuranceTime(deadlineAtMs),
    launchPersistentContext: (profile, launchOptions) =>
      chromium.launchPersistentContext(profile, launchOptions),
    onMutationAttempt: () => {
      mutationAttempt = true;
    },
    abortSignal,
  });
  const page = await context.newPage();
  let firstPartyFailure = false;
  page.on("pageerror", () => {
    firstPartyFailure = true;
  });
  page.on("requestfailed", (request) => {
    if (safeSameOrigin(request.url(), options.origin)) firstPartyFailure = true;
  });
  page.on("response", (response) => {
    if (safeSameOrigin(response.url(), options.origin) && response.status() >= 400) {
      firstPartyFailure = true;
    }
  });
  let rendered = unavailableRenderedProjection();
  try {
    const response = await page.goto(
      `${options.origin}/lease-renewal/live/desk?v=2&scope=all`,
      { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS },
    );
    await page.waitForTimeout(750);
    if (
      !response?.ok() ||
      mutationAttempt ||
      firstPartyFailure ||
      !(await waitForSettledRenewalDesk(page))
    ) {
      throw new Error("rendered_projection_unavailable");
    }
    if (new URL(page.url()).pathname === "/sign-in") {
      throw new Error("rendered_projection_auth_unavailable");
    }
    const renderedRole = (await page.locator(".user-role").first().textContent())?.trim();
    const headingCount = await page
      .getByRole("heading", { name: "Renewals", exact: true })
      .count();
    if (renderedRole !== options.role || headingCount !== 1) {
      throw new Error("rendered_projection_role_unavailable");
    }
    const application = await readRenderedApplicationState(page);
    const result = await readRowsFromPage(
      page,
      options.origin,
      expectedRows,
      expectedRentvineHost,
    );
    rendered = { ...result, application };
  } catch {
    rendered = unavailableRenderedProjection();
  } finally {
    await withAssuranceTimeout(
      () => closeGuardedManagedBrowser(context),
      "reconciliation_context_close_timeout",
      Math.max(1, remainingAssuranceTime(deadlineAtMs, 5_000)),
      { onTimeout: () => forceCloseGuardedManagedBrowser(context) },
    ).catch(() => {
      firstPartyFailure = true;
    });
  }
  // Browser events may land while the persistent context is closing. Seal the result only after
  // teardown so a late mutation or first-party failure cannot survive as a matched projection.
  return mutationAttempt || firstPartyFailure
    ? unavailableRenderedProjection()
    : rendered;
}

function unavailableRenderedProjection(): RenderedProjection {
  return {
    rows: [],
    application: "unavailable",
    invalidDestinations: 0,
    fieldMismatches: 0,
  };
}

export function classifyRenderedSourceState(input: {
  readonly currency: string | null;
  readonly readComplete: string | null;
  readonly refreshing: string | null;
  readonly refreshFailed: string | null;
}): SourceReadState {
  if (
    !["fresh", "stale", "expired"].includes(input.currency ?? "") ||
    !["true", "false"].includes(input.readComplete ?? "") ||
    !["true", "false"].includes(input.refreshing ?? "") ||
    !["true", "false"].includes(input.refreshFailed ?? "")
  ) {
    return "unavailable";
  }
  if (input.currency === "expired" || input.refreshFailed === "true") {
    return "unavailable";
  }
  if (
    input.currency === "stale" ||
    input.readComplete === "false" ||
    input.refreshing === "true"
  ) {
    return "partial";
  }
  return "complete";
}

async function readRenderedApplicationState(page: Page): Promise<SourceReadState> {
  const roots = page.locator(
    "div.ui-stack[data-source-currency-state][data-source-read-complete][data-source-refresh-failed][data-source-refreshing]",
  );
  if ((await roots.count()) !== 1) return "unavailable";
  const root = roots.first();
  const source = classifyRenderedSourceState({
    currency: await root.getAttribute("data-source-currency-state"),
    readComplete: await root.getAttribute("data-source-read-complete"),
    refreshing: await root.getAttribute("data-source-refreshing"),
    refreshFailed: await root.getAttribute("data-source-refresh-failed"),
  });
  if (
    source === "complete" &&
    (await page
      .getByRole("heading", { name: "Supporting information unavailable", exact: true })
      .count()) > 0
  ) {
    return "partial";
  }
  return source;
}

async function waitForSettledRenewalDesk(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll<HTMLElement>('[aria-busy="true"]')].every(
          (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.display === "none" ||
              style.visibility === "hidden" ||
              rect.width === 0 ||
              rect.height === 0
            );
          },
        ),
      undefined,
      { timeout: SETTLED_TIMEOUT_MS },
    );
    return true;
  } catch {
    return false;
  }
}

async function readRowsFromPage(
  page: Page,
  origin: string,
  expectedRows: readonly ExpectedProjectionRow[],
  expectedRentvineHost: string | null,
): Promise<Pick<RenderedProjection, "rows" | "invalidDestinations" | "fieldMismatches">> {
  const rows: RenderedProjectionRow[] = [];
  let invalidDestinations = 0;
  let fieldMismatches = 0;
  const expectedByLease = new Map(expectedRows.map((row) => [row.leaseId, row] as const));
  const allBodyRows = page.locator(
    'section[aria-label="Renewal worklist"] table.renewal-table tbody > tr',
  );
  const rowLocators = page.locator(
    'section[aria-label="Renewal worklist"] table.renewal-table tbody > tr[data-lease-id]',
  );
  const allCount = await allBodyRows.count();
  const dataCount = await rowLocators.count();
  if (allCount !== dataCount) {
    const validEmpty =
      expectedRows.length === 0 &&
      allCount === 1 &&
      dataCount === 0 &&
      (await allBodyRows.first().locator('td[colspan="8"]').count()) === 1;
    if (!validEmpty) invalidDestinations += allCount - dataCount;
  }
  for (let index = 0; index < (await rowLocators.count()); index += 1) {
    const row = rowLocators.nth(index);
    const cells = row.locator("td");
    const leaseCells = row.locator(":scope > th");
    if ((await cells.count()) !== 7 || (await leaseCells.count()) !== 1) {
      invalidDestinations += 1;
      continue;
    }
    const leaseCell = leaseCells.first();
    const leaseId = (await row.getAttribute("data-lease-id")) ?? "";
    const expected = expectedByLease.get(leaseId);
    const primaryWorkspace = leaseCell.locator(".renewal-lease-link");
    const workspaceAvailable = await row.getAttribute("data-workspace-available");
    const linkedAddress = (await primaryWorkspace.first().textContent())?.trim() ?? "";
    const address =
      linkedAddress ||
      ((await leaseCell.locator(":scope > span").first().textContent())?.trim() ?? "");
    const owners = await partyValues(cells.nth(0));
    const tenants = await partyValues(cells.nth(1));
    const endDate =
      (await cells.nth(2).locator("a, span").first().textContent())?.trim() ?? "";
    const baseRent =
      (await cells.nth(3).locator("a, span").first().textContent())?.trim() ?? "";
    const overallCell = cells.nth(4);
    const verificationCell = cells.nth(5);
    const actionCell = cells.nth(6);
    const disposition = await row.getAttribute("data-disposition");
    const retentionState = await row.getAttribute("data-retention-state");
    const processState: IndependentRenderedProcessState = {
      processStatus: await row.getAttribute("data-process-status"),
      currentStepId: await row.getAttribute("data-process-current-step"),
      currentStepState: await row.getAttribute("data-process-current-step-state"),
      waitingParty: await row.getAttribute("data-waiting-party"),
    };
    const overallStatus = await row.getAttribute("data-status");
    const isBlocked = await row.getAttribute("data-is-blocked");
    const rentVerification = await row.getAttribute("data-rent-verification");
    const verifiedByResolutionDiffers = await row.getAttribute(
      "data-rent-verification-differs",
    );
    const blockerLocators = actionCell.locator(
      "ul.renewal-blocker-list > li[data-blocker-id]",
    );
    const blockerCount = await blockerLocators.count();
    const workspace: IndependentWorkspaceDestinationObservation = {
      workspaceAvailable,
      primaryHrefs: await hrefs(primaryWorkspace),
      baseRentPhaseHrefs: await hrefs(
        cells.nth(3).locator('a.text-link[href*="/lease-renewal/live/desk/lease/"]'),
      ),
      rentVerificationPhaseHrefs: await hrefs(
        verificationCell.locator(
          'a.renewal-status-link[href*="/lease-renewal/live/desk/lease/"]',
        ),
      ),
    };
    const blockers: Array<IndependentActionDestinationObservation["blockers"][number]> =
      [];
    for (let blockerIndex = 0; blockerIndex < blockerCount; blockerIndex += 1) {
      const blocker = blockerLocators.nth(blockerIndex);
      const links = blocker.locator(":scope > a");
      const linkCount = await links.count();
      const shouldLink = expected?.workspaceExpected === true;
      if (linkCount !== (shouldLink ? 1 : 0)) invalidDestinations += 1;
      const blockerType = await blocker.getAttribute("data-blocker-type");
      const blockerId = await blocker.getAttribute("data-blocker-id");
      const requiredCapability = await blocker.getAttribute("data-required-capability");
      if (
        !blockerId ||
        !["source", "evidence", "dependency"].includes(blockerType ?? "") ||
        !["none", "edit", "approve"].includes(requiredCapability ?? "")
      ) {
        fieldMismatches += 1;
      }
      blockers.push({
        href: linkCount === 1 ? await links.first().getAttribute("href") : null,
        destinationKind: await blocker.getAttribute("data-blocker-destination-kind"),
        phaseId: await blocker.getAttribute("data-blocker-phase-id"),
        stepId: await blocker.getAttribute("data-blocker-step-id"),
      });
    }
    const phaseHrefs = await hrefs(
      actionCell.locator(':scope > a.text-link[href*="/lease-renewal/live/desk/lease/"]'),
    );
    const accessHrefs = await hrefs(actionCell.locator('a[href^="/admin/access?"]'));
    const action: IndependentActionDestinationObservation = {
      actionKind: await actionCell.getAttribute("data-action-kind"),
      destinationKind: await actionCell.getAttribute("data-action-destination-kind"),
      stepId: await actionCell.getAttribute("data-action-step-id"),
      requiredCapability: await actionCell.getAttribute(
        "data-action-required-capability",
      ),
      declaredBlockerCount: await actionCell.getAttribute("data-blocker-count"),
      blockers,
      phaseHrefs,
      accessHrefs,
    };
    if (
      (await row.getAttribute("data-action-kind")) !== action.actionKind ||
      (await row.getAttribute("data-blocker-count")) !== action.declaredBlockerCount ||
      (await overallCell.getAttribute("data-status")) !== overallStatus ||
      (await verificationCell.getAttribute("data-rent-verification")) !==
        rentVerification ||
      (await verificationCell.getAttribute("data-rent-verification-differs")) !==
        verifiedByResolutionDiffers
    ) {
      fieldMismatches += 1;
    }
    fieldMismatches += await countVisibleStatusLabelMismatches(
      overallCell,
      verificationCell,
      overallStatus,
      rentVerification,
    );
    const statusFilterHrefs = await hrefs(
      overallCell.locator(":scope > a.renewal-status-link"),
    );
    if (
      statusFilterHrefs.length !== 1 ||
      !validStatusFilterDestination(statusFilterHrefs[0], origin, overallStatus)
    ) {
      invalidDestinations += 1;
    }
    const sourceLink = cells.nth(3).locator("a.renewal-source-link");
    const sourceCount = await sourceLink.count();
    const expectedSourceHref = expected?.rentvineSourceUrl ?? null;
    const sourceHref = sourceCount === 1 ? await sourceLink.getAttribute("href") : null;
    if (sourceCount !== (expectedSourceHref ? 1 : 0)) {
      invalidDestinations += 1;
    } else if (sourceCount === 1) {
      if (
        !expectedRentvineHost ||
        !validRenderedRentvineSourceDestination({
          href: sourceHref,
          expectedHref: expectedSourceHref,
          expectedHost: expectedRentvineHost,
          leaseId,
          target: await sourceLink.getAttribute("target"),
          rel: await sourceLink.getAttribute("rel"),
        })
      ) {
        invalidDestinations += 1;
      }
    }
    rows.push({
      leaseId,
      address,
      owners,
      tenants,
      endDate,
      baseRent,
      rentvineSourceUrl: sourceHref,
      disposition,
      retentionState,
      processState,
      status: {
        rentVerification,
        verifiedByResolutionDiffers,
        overallStatus,
        isBlocked,
        blockerCount,
      },
      workspace,
      action,
      statusFilterHrefs,
    });
  }
  return { rows, invalidDestinations, fieldMismatches };
}

async function hrefs(locator: ReturnType<Page["locator"]>): Promise<(string | null)[]> {
  const values: (string | null)[] = [];
  for (let index = 0; index < (await locator.count()); index += 1) {
    values.push(await locator.nth(index).getAttribute("href"));
  }
  return values;
}

const OVERALL_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  needs_verification: "Needs verification",
  blocked: "Blocked",
  complete: "Complete",
  waiting: "Waiting",
  ready: "Ready",
  needs_review: "Needs review",
});
const RENT_VERIFICATION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  verified: "Verified",
  needs_verification: "Needs verification",
  unavailable: "Unavailable",
});

async function countVisibleStatusLabelMismatches(
  overallCell: ReturnType<Page["locator"]>,
  verificationCell: ReturnType<Page["locator"]>,
  overallStatus: string | null,
  rentVerification: string | null,
): Promise<number> {
  const overallLabels = overallCell.locator(".renewal-status-badge > span:last-child");
  const verificationLabels = verificationCell.locator(
    ".renewal-status-badge > span:last-child",
  );
  const overallLabel =
    (await overallLabels.count()) === 1
      ? (await overallLabels.first().textContent())?.trim()
      : undefined;
  const verificationLabel =
    (await verificationLabels.count()) === 1
      ? (await verificationLabels.first().textContent())?.trim()
      : undefined;
  return (
    (overallLabel === OVERALL_STATUS_LABELS[overallStatus ?? ""] ? 0 : 1) +
    (verificationLabel === RENT_VERIFICATION_LABELS[rentVerification ?? ""] ? 0 : 1)
  );
}

export function validStatusFilterDestination(
  href: string | null,
  origin: string,
  status: string | null,
): boolean {
  if (!href || !status || !Object.hasOwn(OVERALL_STATUS_LABELS, status)) return false;
  let target: URL;
  try {
    target = new URL(href, origin);
  } catch {
    return false;
  }
  const keys = [...target.searchParams.keys()];
  return (
    target.origin === origin &&
    target.pathname === "/lease-renewal/live/desk" &&
    !target.hash &&
    keys.length === 3 &&
    new Set(keys).size === 3 &&
    ["v", "overallStatus", "scope"].every((key) => keys.includes(key)) &&
    target.searchParams.get("v") === "2" &&
    target.searchParams.get("overallStatus") === status &&
    target.searchParams.get("scope") === "all"
  );
}

async function partyValues(
  cell: ReturnType<Page["locator"]>,
): Promise<readonly string[]> {
  const items = await cell.locator("li").allTextContents();
  if (items.length > 0) return items.map((item) => item.trim());
  const fallback = (await cell.textContent())?.trim();
  return fallback ? [fallback] : [];
}

function compareProjectionRows(
  direct: DirectProjection,
  rendered: RenderedProjection,
  role: AssuranceRole,
  origin: string,
): ReconciliationCounts {
  const counts = { ...emptyReconciliationCounts() };
  counts.sourceRecords = direct.sourceRecords;
  counts.projectedRecords = direct.projectedRecords;
  counts.renderedRecords = rendered.rows.length;
  counts.invalidDestinations = rendered.invalidDestinations;
  counts.fieldMismatches = rendered.fieldMismatches;
  const expected = indexRows(direct.rows);
  const observed = indexRows(rendered.rows);
  counts.duplicateApplicationKeys = observed.duplicates;
  for (const [key, expectedRows] of expected.byKey) {
    const actualRows = observed.byKey.get(key);
    if (!actualRows) {
      counts.missingInApplication += expectedRows.length;
      continue;
    }
    if (actualRows.length < expectedRows.length) {
      counts.missingInApplication += expectedRows.length - actualRows.length;
    }
    if (actualRows.length > expectedRows.length) {
      counts.unexpectedInApplication += actualRows.length - expectedRows.length;
    }
    const limit = Math.min(expectedRows.length, actualRows.length);
    for (let index = 0; index < limit; index += 1) {
      const expectedRow = expectedRows[index];
      const observedRow = actualRows[index];
      const expectedGuidance = projectIndependentExpectedGuidanceState({
        dispositionExpected: expectedRow.dispositionExpected,
        retentionExpected: expectedRow.retentionExpected,
        processExpected: expectedRow.processExpected,
        rentReconciliationExpected: expectedRow.rentReconciliationExpected,
        rentExpectation: expectedRow.rentExpectation,
        processState: observedRow.processState,
      });
      counts.fieldMismatches += countFieldMismatches(expectedRow, observedRow);
      counts.fieldMismatches += countDispositionMismatches(
        expectedRow.dispositionExpected,
        observedRow.disposition,
      );
      counts.fieldMismatches += countIndependentExpectedRowStateMismatches({
        expectedRetention: expectedRow.retentionExpected,
        expectedOverallStatus: expectedGuidance.overallStatus,
        observedRetention: observedRow.retentionState,
        observedOverallStatus: observedRow.status.overallStatus,
      });
      counts.fieldMismatches += expectedGuidance.markerMismatches;
      counts.fieldMismatches +=
        expectedRow.rentReconciliationExpected &&
        expectedRow.dispositionExpected !== "review"
          ? countIndependentStatusMismatches(
              expectedRow.rentExpectation,
              observedRow.status,
            )
          : countCoreStatusMismatches(expectedRow.rentExpectation, observedRow.status);
      counts.fieldMismatches += countActionStatusMismatches(observedRow);
      counts.invalidDestinations += countIndependentWorkspaceDestinationMismatches({
        workspaceExpected: expectedRow.workspaceExpected,
        leaseId: expectedRow.leaseId,
        origin,
        observed: observedRow.workspace,
      });
      counts.invalidDestinations += expectedRow.workspaceExpected
        ? countIndependentActionDestinationMismatches({
            leaseId: expectedRow.leaseId,
            origin,
            observed: observedRow.action,
            accessHandoffExpected: accessHandoffExpected(role, observedRow.action),
            ...(expectedGuidance.actionStepId
              ? { expectedStep: expectedGuidance.actionStepId }
              : {}),
          })
        : countIneligibleActionDestinationMismatches(observedRow.action);
    }
  }
  for (const [key, actualRows] of observed.byKey) {
    if (!expected.byKey.has(key)) counts.unexpectedInApplication += actualRows.length;
  }
  return counts;
}

function indexRows<Row extends IndependentRenewalSourceRow>(
  rows: readonly Row[],
): {
  byKey: Map<string, Row[]>;
  duplicates: number;
} {
  const byKey = new Map<string, Row[]>();
  for (const row of rows) {
    const key = row.leaseId;
    const values = byKey.get(key) ?? [];
    values.push(row);
    byKey.set(key, values);
  }
  let duplicates = 0;
  for (const [key, values] of byKey) {
    if (!key || values.length > 1) duplicates += Math.max(1, values.length - 1);
  }
  return { byKey, duplicates };
}

function countFieldMismatches(
  expected: IndependentRenewalSourceRow,
  observed: IndependentRenewalSourceRow,
): number {
  let count = 0;
  if (expected.address !== observed.address) count += 1;
  if (!sameStrings(expected.owners, observed.owners)) count += 1;
  if (!sameStrings(expected.tenants, observed.tenants)) count += 1;
  if (expected.endDate !== observed.endDate) count += 1;
  if (expected.baseRent !== observed.baseRent) count += 1;
  return count;
}

function countDispositionMismatches(
  expected: ExpectedProjectionRow["dispositionExpected"],
  observed: string | null,
): number {
  return observed === expected ? 0 : 1;
}

function countCoreStatusMismatches(
  expected: IndependentRentExpectation,
  observed: IndependentRenderedStatus,
): number {
  let mismatches = 0;
  if (observed.rentVerification !== expected.rentVerification) mismatches += 1;
  if (
    observed.verifiedByResolutionDiffers !==
    (expected.verifiedByResolutionDiffers ? "true" : "false")
  ) {
    mismatches += 1;
  }
  if (!Object.hasOwn(OVERALL_STATUS_LABELS, observed.overallStatus ?? "")) {
    mismatches += 1;
  } else {
    const blocked = ["blocked", "needs_verification"].includes(
      observed.overallStatus ?? "",
    );
    if (observed.isBlocked !== (blocked ? "true" : "false")) mismatches += 1;
  }
  return mismatches;
}

const ACTION_KIND_BY_STATUS: Readonly<Record<string, string>> = Object.freeze({
  needs_verification: "needs_verification",
  blocked: "blocked",
  complete: "complete",
  waiting: "waiting",
  ready: "act",
  needs_review: "review",
});
const WORKSPACE_STEPS = new Set([
  "verify-renewal",
  "owner-decision",
  "tenant-decision",
  "document-packet",
  "signatures-follow-up",
  "compliance-close",
]);

function countActionStatusMismatches(row: RenderedProjectionRow): number {
  const status = row.status.overallStatus ?? "";
  let mismatches = row.action.actionKind === ACTION_KIND_BY_STATUS[status] ? 0 : 1;
  if (status === "blocked" && row.action.blockers.length === 0) mismatches += 1;
  if (status === "ready" && row.action.destinationKind !== "workspace_phase") {
    mismatches += 1;
  }
  if (
    status === "complete" &&
    (row.action.destinationKind !== "workspace_phase" ||
      row.action.stepId !== "compliance-close")
  ) {
    mismatches += 1;
  }
  if (
    row.action.destinationKind === "workspace_phase" &&
    !WORKSPACE_STEPS.has(row.action.stepId ?? "")
  ) {
    mismatches += 1;
  }
  return mismatches;
}

function accessHandoffExpected(
  role: AssuranceRole,
  action: IndependentActionDestinationObservation,
): boolean {
  return role === "Editor" && action.requiredCapability === "approve";
}

function countIneligibleActionDestinationMismatches(
  observed: IndependentActionDestinationObservation,
): number {
  const declared = observed.declaredBlockerCount;
  let mismatches =
    declared === String(observed.blockers.length) &&
    declared !== null &&
    /^(0|[1-9]\d*)$/.test(declared)
      ? 0
      : 1;
  if (observed.phaseHrefs.length !== 0 || observed.accessHrefs.length !== 0) {
    mismatches += 1;
  }
  for (const blocker of observed.blockers) {
    if (
      blocker.href !== null ||
      blocker.destinationKind !== "workspace_phase" ||
      !blocker.stepId ||
      blocker.stepId !== blocker.phaseId ||
      !WORKSPACE_STEPS.has(blocker.stepId)
    ) {
      mismatches += 1;
    }
  }
  if (observed.blockers.length === 0 && observed.destinationKind !== "none") {
    mismatches += 1;
  }
  return mismatches;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function reportForReconciliation(
  options: LiveReconciliationOptions,
  reconciliation: ReconciliationAssuranceEvidence,
): ProductionAssuranceEvidence {
  return {
    schemaVersion: PRODUCTION_ASSURANCE_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    phase: options.phase ?? "candidate",
    expectedCommit: options.expectedCommit,
    expectedRevision: options.expectedRevision,
    actorRole: options.role,
    verdict:
      reconciliation.state === "matched"
        ? "passed"
        : reconciliation.state === "mismatch"
          ? "failed"
          : "inconclusive",
    routes: [],
    reconciliation,
    monitoring: null,
    observation: null,
  };
}

export function resolveReconciliationCoordinates(argv: readonly string[]): {
  readonly project: string;
  readonly region: string;
  readonly service: string;
  readonly expectedConfigurationFingerprint: string;
} {
  const project = readArg(argv, "--project") ?? DEFAULT_PROJECT;
  const region = readArg(argv, "--region") ?? DEFAULT_REGION;
  const service = readArg(argv, "--service") ?? DEFAULT_SERVICE;
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) {
    throw new Error("project_invalid");
  }
  if (!/^[a-z]+-[a-z]+[0-9]$/.test(region)) throw new Error("region_invalid");
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(service)) {
    throw new Error("service_invalid");
  }
  return {
    project,
    region,
    service,
    expectedConfigurationFingerprint: requireRevisionConfigurationFingerprint(
      readArg(argv, "--expected-config-fingerprint"),
    ),
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    requireExplicitLive(argv);
    const report = await runProductionReconciliation({
      ...resolveProductionTarget(argv),
      ...resolveReconciliationCoordinates(argv),
      role: resolveRole(argv),
      profile: resolveManagedProfile(argv),
      headed: hasArg(argv, "--headed"),
    });
    writeAssuranceReport(argv, report);
    if (report.verdict !== "passed") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      `Production reconciliation refused: ${safeCliFailure(error)}.\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
