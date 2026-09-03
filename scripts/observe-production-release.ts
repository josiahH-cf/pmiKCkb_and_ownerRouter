import { pathToFileURL } from "node:url";

import {
  POST_PROMOTION_OBSERVATION_MS,
  PRODUCTION_ASSURANCE_SCHEMA_VERSION,
  addDiagnostic,
  assuranceAbortSignal,
  closedObservationInterval,
  corroborateMonitoringCounts,
  createAssuranceDeadline,
  emptyDiagnosticCounts,
  emptyReconciliationCounts,
  evaluateReleaseObservation,
  fingerprintRevisionRuntimeConfiguration,
  readVerifiedCloudRunOriginBinding,
  remainingAssuranceTime,
  requireRevisionConfigurationFingerprint,
  routesForRole,
  withAssuranceTimeout,
  type LoggingCorroborationRead,
  type MetricCountRead,
  type MonitoringAssuranceEvidence,
  type ProductionAssuranceEvidence,
} from "../lib/production-assurance";
import {
  hasArg,
  readArg,
  requireExplicitLive,
  resolveNamedManagedProfile,
  resolveProductionTarget,
  readProductionVersionIdentity,
  safeCliFailure,
  verifyExactVersion,
  writeAssuranceReport,
} from "./production-assurance-runtime";
import type {
  CandidateAssuranceReceipt,
  PredecessorBaseline,
  PromotionReceipt,
} from "./production-assurance-receipts.mjs";
import {
  preflightProductionAssurance,
  verifiedAssuranceClient,
  type AuthenticatedAssuranceClient,
  type VerifiedProductionAssuranceContext,
} from "./production-assurance-preflight";
import { runProductionCanary } from "./run-production-canary";
import { runProductionReconciliation } from "./run-production-reconciliation";

const DEFAULT_PROJECT = "pmi-kc-kb-prod";
const DEFAULT_REGION = "us-central1";
const DEFAULT_SERVICE = "pmi-kc-app";
const POLL_MS = 30_000;
const MAX_LOG_PAGES = 100;
const LOG_PAGE_SIZE = 1_000;
const CANDIDATE_ASSURANCE_TIMEOUT_MS = 30 * 60 * 1_000;

interface ObservationTarget {
  readonly project: string;
  readonly region: string;
  readonly service: string;
  readonly operatorEmail: string;
  readonly predecessorRevision: string;
  readonly promotionStartedAtMs: number;
  readonly promotionVerifiedAtMs: number;
  readonly expectedConfigurationFingerprint: string;
  readonly predecessorBaseline: PredecessorBaseline;
}

interface AssuranceReceiptModule {
  buildCandidateAssuranceReceipt(
    input: Omit<
      CandidateAssuranceReceipt,
      "schemaVersion" | "candidateReceiptId" | "issuedAt" | "expiresAt"
    >,
    nowMs?: number,
  ): CandidateAssuranceReceipt;
  readPromotionReceipt(
    path: string,
    expected?: Readonly<Record<string, unknown>>,
    nowMs?: number,
  ): PromotionReceipt;
  readAssuranceReceiptForRecovery(
    path: string,
    expected?: Readonly<Record<string, unknown>>,
    nowMs?: number,
  ): CandidateAssuranceReceipt | PromotionReceipt;
  writeReceipt(path: string, receipt: unknown): string;
  exactExternalReceiptPath(path: string, repositoryRoot?: string): string;
}

interface RevisionCoordinates {
  readonly project: string;
  readonly region: string;
  readonly service: string;
  readonly expectedRevision: string;
}

interface RuntimeSnapshot {
  readonly observedRevision: string;
  readonly trafficPercent: number;
  readonly configurationVerified: boolean;
  readonly monitoring: MonitoringAssuranceEvidence;
}

/** Keep configuration truth separate from a transient metric/log sample failure. */
export function unavailableMonitoringSample(
  configurationReady: boolean,
): MonitoringAssuranceEvidence {
  return {
    configurationReady,
    readComplete: false,
    candidateFiveXxCount: 0,
    unresolvedLiveEffectCount: 0,
  };
}

interface MonitoringVerifierConfig {
  readonly json: boolean;
  readonly operatorEmail: string;
  readonly project: string;
  readonly region: string;
  readonly service: string;
}

interface MonitoringVerifierModule {
  fetchMonitoringState(
    config: MonitoringVerifierConfig,
    dependencies?: {
      readonly signal?: AbortSignal;
      readonly request?: (input: {
        readonly method: "GET";
        readonly url: string;
        readonly signal?: AbortSignal;
      }) => Promise<unknown>;
    },
  ): Promise<unknown>;
  evaluateMonitoringState(
    config: MonitoringVerifierConfig,
    state: unknown,
  ): { readonly status: string };
}

interface MonitoringTarget {
  readonly operatorEmail: string;
  readonly project: string;
  readonly region: string;
  readonly service: string;
}

async function receiptModule(): Promise<AssuranceReceiptModule> {
  const modulePath: string = "./production-assurance-receipts.mjs";
  const loaded = (await import(modulePath)) as unknown as AssuranceReceiptModule;
  if (
    typeof loaded.buildCandidateAssuranceReceipt !== "function" ||
    typeof loaded.readPromotionReceipt !== "function" ||
    typeof loaded.readAssuranceReceiptForRecovery !== "function" ||
    typeof loaded.writeReceipt !== "function" ||
    typeof loaded.exactExternalReceiptPath !== "function"
  ) {
    throw new Error("assurance_receipt_module_invalid");
  }
  return loaded;
}

type AuthenticatedReadClient = AuthenticatedAssuranceClient;

export async function observeProductionRelease(
  argv: readonly string[],
): Promise<ProductionAssuranceEvidence> {
  requireExplicitLive(argv);
  const target = resolveProductionTarget(argv);
  const observationTarget = await resolveObservationTarget(
    argv,
    target.expectedCommit,
    target.expectedRevision,
  );
  if (
    target.origin !== observationTarget.canonicalOrigin ||
    target.service !== observationTarget.service
  ) {
    throw new Error("promotion_receipt_mismatch");
  }
  const adminProfile = resolveNamedManagedProfile(argv, "--admin-profile");
  const editorProfile = resolveNamedManagedProfile(argv, "--editor-profile");
  const observationDeadlineAtMs = closedObservationInterval(
    observationTarget.promotionStartedAtMs,
    POST_PROMOTION_OBSERVATION_MS,
  ).readAfterMs;
  const deadline = createAssuranceDeadline(observationDeadlineAtMs);
  try {
    if (Date.now() >= observationDeadlineAtMs) {
      return buildObservationDeadlineRollbackReport({
        target,
        predecessorRevision: observationTarget.predecessorRevision,
        promotionStartedAtMs: observationTarget.promotionStartedAtMs,
      });
    }
    const assuranceContext = await preflightProductionAssurance({
      project: observationTarget.project,
      deadlineAtMs: observationDeadlineAtMs,
      abortSignal: deadline.signal,
    });
    const readClient = verifiedAssuranceClient(
      assuranceContext,
      observationTarget.project,
    );
    await withAssuranceTimeout(
      () => verifyExactVersion(target, deadline.signal),
      "observation_deadline_exceeded",
      remainingAssuranceTime(observationDeadlineAtMs),
    );

    const initialCheckpointStartedAtMs = Date.now();
    const initialAdmin = await runProductionCanary({
      ...target,
      project: observationTarget.project,
      region: observationTarget.region,
      service: observationTarget.service,
      expectedConfigurationFingerprint:
        observationTarget.expectedConfigurationFingerprint,
      role: "Admin",
      profile: adminProfile,
      phase: "post_promotion",
      deadlineAtMs: observationDeadlineAtMs,
      abortSignal: deadline.signal,
      assuranceContext,
    });
    const initialEditor = await runProductionCanary({
      ...target,
      project: observationTarget.project,
      region: observationTarget.region,
      service: observationTarget.service,
      expectedConfigurationFingerprint:
        observationTarget.expectedConfigurationFingerprint,
      role: "Editor",
      profile: editorProfile,
      phase: "post_promotion",
      deadlineAtMs: observationDeadlineAtMs,
      abortSignal: deadline.signal,
      assuranceContext,
    });
    const initialReconciliation = await runProductionReconciliation({
      ...target,
      role: "Admin",
      profile: adminProfile,
      phase: "post_promotion",
      project: observationTarget.project,
      region: observationTarget.region,
      service: observationTarget.service,
      expectedConfigurationFingerprint:
        observationTarget.expectedConfigurationFingerprint,
      deadlineAtMs: observationDeadlineAtMs,
      abortSignal: deadline.signal,
      assuranceContext,
    });
    const initialRuntime = await readRuntimeSnapshot(
      target,
      observationTarget,
      readClient,
      observationDeadlineAtMs,
      deadline.signal,
    );
    const initialCheckpointPassed = fullCheckpointPassed(
      initialAdmin,
      initialEditor,
      initialReconciliation,
    );
    const initialDecision = evaluateReleaseObservation({
      expectedRevision: target.expectedRevision,
      observedRevision: initialRuntime.observedRevision,
      predecessorRevision: observationTarget.predecessorRevision,
      trafficPercent: initialRuntime.trafficPercent,
      configurationVerified: initialRuntime.configurationVerified,
      successfulCheckpoints: initialCheckpointPassed ? 1 : 0,
      checkpointStartedOffsetsMs: [
        Math.max(
          0,
          initialCheckpointStartedAtMs - observationTarget.promotionStartedAtMs,
        ),
      ],
      elapsedMs: Math.max(0, Date.now() - observationTarget.promotionStartedAtMs),
      adminRoutes: initialAdmin.routes,
      editorRoutes: initialEditor.routes,
      reconciliation: requireReconciliation(initialReconciliation),
      monitoring: initialRuntime.monitoring,
    });
    if (initialDecision.decision !== "observing") {
      return buildObservationReport(
        target,
        [...initialAdmin.routes, ...initialEditor.routes],
        requireReconciliation(initialReconciliation),
        initialRuntime.monitoring,
        initialDecision,
      );
    }

    await waitForObservationWindow(
      target,
      observationTarget.promotionStartedAtMs,
      deadline.signal,
    );

    const finalCheckpointStartedAtMs = Date.now();
    const finalAdmin = await runProductionCanary({
      ...target,
      project: observationTarget.project,
      region: observationTarget.region,
      service: observationTarget.service,
      expectedConfigurationFingerprint:
        observationTarget.expectedConfigurationFingerprint,
      role: "Admin",
      profile: adminProfile,
      phase: "post_promotion",
      deadlineAtMs: observationDeadlineAtMs,
      abortSignal: deadline.signal,
      assuranceContext,
    });
    const finalEditor = await runProductionCanary({
      ...target,
      project: observationTarget.project,
      region: observationTarget.region,
      service: observationTarget.service,
      expectedConfigurationFingerprint:
        observationTarget.expectedConfigurationFingerprint,
      role: "Editor",
      profile: editorProfile,
      phase: "post_promotion",
      deadlineAtMs: observationDeadlineAtMs,
      abortSignal: deadline.signal,
      assuranceContext,
    });
    const finalReconciliation = await runProductionReconciliation({
      ...target,
      role: "Admin",
      profile: adminProfile,
      phase: "post_promotion",
      project: observationTarget.project,
      region: observationTarget.region,
      service: observationTarget.service,
      expectedConfigurationFingerprint:
        observationTarget.expectedConfigurationFingerprint,
      deadlineAtMs: observationDeadlineAtMs,
      abortSignal: deadline.signal,
      assuranceContext,
    });
    const finalRoutes = [...finalAdmin.routes, ...finalEditor.routes];
    const reconciliation = requireReconciliation(finalReconciliation);
    const successfulCheckpoints =
      (initialCheckpointPassed ? 1 : 0) +
      (fullCheckpointPassed(finalAdmin, finalEditor, finalReconciliation) ? 1 : 0);
    const monitoringDeadline = closedObservationInterval(
      observationTarget.promotionStartedAtMs,
      POST_PROMOTION_OBSERVATION_MS,
    ).readAfterMs;
    let runtime = await readRuntimeSnapshot(
      target,
      observationTarget,
      readClient,
      observationDeadlineAtMs,
      deadline.signal,
    );
    while (true) {
      const nowMs = Date.now();
      const decision = evaluateReleaseObservation({
        expectedRevision: target.expectedRevision,
        observedRevision: runtime.observedRevision,
        predecessorRevision: observationTarget.predecessorRevision,
        trafficPercent: runtime.trafficPercent,
        configurationVerified: runtime.configurationVerified,
        successfulCheckpoints,
        checkpointStartedOffsetsMs: [
          Math.max(
            0,
            initialCheckpointStartedAtMs - observationTarget.promotionStartedAtMs,
          ),
          Math.max(
            0,
            finalCheckpointStartedAtMs - observationTarget.promotionStartedAtMs,
          ),
        ],
        elapsedMs: Math.max(0, nowMs - observationTarget.promotionStartedAtMs),
        adminRoutes: finalAdmin.routes,
        editorRoutes: finalEditor.routes,
        reconciliation,
        monitoring: runtime.monitoring,
      });
      if (decision.decision !== "observing") {
        return buildObservationReport(
          target,
          finalRoutes,
          reconciliation,
          runtime.monitoring,
          decision,
        );
      }
      const nextRuntime = await pollObservationRuntimeSample({
        deadlineAtMs: monitoringDeadline,
        abortSignal: deadline.signal,
        read: () =>
          readRuntimeSnapshot(
            target,
            observationTarget,
            readClient,
            observationDeadlineAtMs,
            deadline.signal,
          ),
      });
      if (nextRuntime) runtime = nextRuntime;
    }
  } catch (error) {
    if (isAssuranceDeadlineFailure(error) || Date.now() >= observationDeadlineAtMs) {
      return buildObservationDeadlineRollbackReport({
        target,
        predecessorRevision: observationTarget.predecessorRevision,
        promotionStartedAtMs: observationTarget.promotionStartedAtMs,
      });
    }
    throw error;
  } finally {
    deadline.dispose();
  }
}

export function fullCheckpointPassed(
  admin: Pick<ProductionAssuranceEvidence, "verdict">,
  editor: Pick<ProductionAssuranceEvidence, "verdict">,
  reconciliation: {
    readonly verdict: ProductionAssuranceEvidence["verdict"];
    readonly reconciliation: {
      readonly state: NonNullable<ProductionAssuranceEvidence["reconciliation"]>["state"];
    } | null;
  },
): boolean {
  return (
    admin.verdict === "passed" &&
    editor.verdict === "passed" &&
    reconciliation.verdict === "passed" &&
    reconciliation.reconciliation?.state === "matched"
  );
}

async function capturePredecessorBaseline(input: {
  readonly client: AuthenticatedReadClient;
  readonly assuranceContext: VerifiedProductionAssuranceContext;
  readonly canonicalOrigin: string;
  readonly predecessorRevision: string;
  readonly project: string;
  readonly region: string;
  readonly service: string;
  readonly operatorEmail: string;
  readonly adminProfile: string;
  readonly editorProfile: string;
  readonly deadlineAtMs: number;
  readonly abortSignal: AbortSignal;
}): Promise<PredecessorBaseline> {
  const version = await readProductionVersionIdentity(
    input.canonicalOrigin,
    input.service,
    input.abortSignal,
  );
  if (version.revision !== input.predecessorRevision) {
    throw new Error("predecessor_version_mismatch");
  }
  const revision = await readExactRevision(
    input.client,
    input,
    input.predecessorRevision,
    input.deadlineAtMs,
    input.abortSignal,
  );
  const expectedConfigurationFingerprint =
    fingerprintRevisionRuntimeConfiguration(revision);
  const target = {
    origin: input.canonicalOrigin,
    expectedCommit: version.commit,
    expectedRevision: input.predecessorRevision,
    service: input.service,
    project: input.project,
    region: input.region,
    expectedConfigurationFingerprint,
    phase: "rollback" as const,
    deadlineAtMs: input.deadlineAtMs,
    abortSignal: input.abortSignal,
  };
  const admin = await runProductionCanary({
    ...target,
    role: "Admin",
    profile: input.adminProfile,
    assuranceContext: input.assuranceContext,
  });
  const editor = await runProductionCanary({
    ...target,
    role: "Editor",
    profile: input.editorProfile,
    assuranceContext: input.assuranceContext,
  });
  const monitoringReady = await withAssuranceTimeout(
    () => readMonitoringConfigurationReady(input, input.client, input.abortSignal),
    "predecessor_monitoring_timeout",
    remainingAssuranceTime(input.deadlineAtMs),
  );
  if (admin.verdict !== "passed" || editor.verdict !== "passed" || !monitoringReady) {
    throw new Error("predecessor_baseline_failed");
  }
  const finalBinding = await readVerifiedCloudRunOriginBinding(
    input.client,
    {
      project: input.project,
      region: input.region,
      service: input.service,
      expectedRevision: input.predecessorRevision,
      origin: input.canonicalOrigin,
      phase: "rollback",
    },
    input.abortSignal,
  );
  if (finalBinding.canonicalOrigin !== input.canonicalOrigin) {
    throw new Error("predecessor_baseline_failed");
  }
  return {
    verifiedAt: new Date().toISOString(),
    canonicalOrigin: input.canonicalOrigin,
    expectedCommit: version.commit,
    expectedRevision: input.predecessorRevision,
    expectedConfigurationFingerprint,
    trafficPercent: 100,
    adminVerdict: "passed",
    editorVerdict: "passed",
    monitoringState: "ready",
  };
}

export async function verifyPredecessorRecovery(input: {
  readonly baseline: PredecessorBaseline;
  readonly project: string;
  readonly region: string;
  readonly service: string;
  readonly operatorEmail: string;
  readonly adminProfile: string;
  readonly editorProfile: string;
  readonly deadlineAtMs?: number;
  readonly abortSignal?: AbortSignal;
}): Promise<void> {
  const deadlineAtMs = input.deadlineAtMs ?? Date.now() + CANDIDATE_ASSURANCE_TIMEOUT_MS;
  const deadline = createAssuranceDeadline(deadlineAtMs, input.abortSignal);
  try {
    const assuranceContext = await preflightProductionAssurance({
      project: input.project,
      deadlineAtMs,
      abortSignal: deadline.signal,
    });
    const client = verifiedAssuranceClient(assuranceContext, input.project);
    const recovered = await capturePredecessorBaseline({
      client,
      assuranceContext,
      canonicalOrigin: input.baseline.canonicalOrigin,
      predecessorRevision: input.baseline.expectedRevision,
      project: input.project,
      region: input.region,
      service: input.service,
      operatorEmail: input.operatorEmail,
      adminProfile: input.adminProfile,
      editorProfile: input.editorProfile,
      deadlineAtMs,
      abortSignal: deadline.signal,
    });
    assertRecoveredPredecessorBaseline(input.baseline, recovered);
  } finally {
    deadline.dispose();
  }
}

export function assertRecoveredPredecessorBaseline(
  expected: PredecessorBaseline,
  recovered: PredecessorBaseline,
): void {
  if (
    Date.parse(recovered.verifiedAt) < Date.parse(expected.verifiedAt) ||
    recovered.expectedCommit !== expected.expectedCommit ||
    recovered.expectedRevision !== expected.expectedRevision ||
    recovered.expectedConfigurationFingerprint !==
      expected.expectedConfigurationFingerprint ||
    recovered.canonicalOrigin !== expected.canonicalOrigin ||
    recovered.trafficPercent !== expected.trafficPercent ||
    recovered.adminVerdict !== expected.adminVerdict ||
    recovered.editorVerdict !== expected.editorVerdict ||
    recovered.monitoringState !== expected.monitoringState
  ) {
    throw new Error("predecessor_recovery_mismatch");
  }
}

export async function resolveObservationTarget(
  argv: readonly string[],
  expectedCommit: string,
  expectedRevision: string,
  nowMs = Date.now(),
): Promise<ObservationTarget & { readonly canonicalOrigin: string }> {
  const coordinates = resolveRevisionCoordinates(argv, expectedRevision);
  const operatorEmail = readArg(argv, "--operator-email")?.toLowerCase();
  const expectedConfigurationFingerprint = requireRevisionConfigurationFingerprint(
    readArg(argv, "--expected-config-fingerprint"),
  );
  const receiptPath = readArg(argv, "--promotion-receipt");
  if (
    !operatorEmail ||
    !/^[a-z0-9][a-z0-9._%+-]{0,63}@pmikcmetro\.com$/i.test(operatorEmail)
  ) {
    throw new Error("internal_operator_required");
  }
  if (!receiptPath) throw new Error("promotion_receipt_required");
  if (readArg(argv, "--predecessor-revision") || readArg(argv, "--promoted-at")) {
    throw new Error("freeform_promotion_coordinates_forbidden");
  }
  const receipts = await receiptModule();
  const receipt = receipts.readPromotionReceipt(
    receiptPath,
    {
      project: coordinates.project,
      region: coordinates.region,
      service: coordinates.service,
      expectedCommit,
      expectedRevision,
      expectedConfigurationFingerprint,
    },
    nowMs,
  );
  const promotionStartedAtMs = Date.parse(receipt.promotionStartedAt);
  const promotionVerifiedAtMs = Date.parse(receipt.promotionVerifiedAt);
  return {
    project: coordinates.project,
    region: coordinates.region,
    service: coordinates.service,
    operatorEmail,
    predecessorRevision: receipt.predecessorRevision,
    promotionStartedAtMs,
    promotionVerifiedAtMs,
    expectedConfigurationFingerprint,
    canonicalOrigin: receipt.canonicalOrigin,
    predecessorBaseline: receipt.predecessorBaseline,
  };
}

export async function verifyRollbackRecoveryFromReceipt(
  argv: readonly string[],
): Promise<void> {
  requireExplicitLive(argv);
  const path = readArg(argv, "--recovery-receipt");
  const operatorEmail = readArg(argv, "--operator-email")?.toLowerCase();
  if (!path) throw new Error("recovery_receipt_required");
  if (
    !operatorEmail ||
    !/^[a-z0-9][a-z0-9._%+-]{0,63}@pmikcmetro\.com$/i.test(operatorEmail)
  ) {
    throw new Error("internal_operator_required");
  }
  const adminProfile = resolveNamedManagedProfile(argv, "--admin-profile");
  const editorProfile = resolveNamedManagedProfile(argv, "--editor-profile");
  if (adminProfile === editorProfile) {
    throw new Error("distinct_managed_profiles_required");
  }
  const receipts = await receiptModule();
  const receipt = receipts.readAssuranceReceiptForRecovery(path);
  await verifyPredecessorRecovery({
    baseline: receipt.predecessorBaseline,
    project: receipt.project,
    region: receipt.region,
    service: receipt.service,
    operatorEmail,
    adminProfile,
    editorProfile,
  });
}

/** Run the complete candidate gate and emit the only receipt the promotion command accepts. */
export async function prepareCandidateAssuranceReceipt(
  argv: readonly string[],
): Promise<CandidateAssuranceReceipt> {
  const deadlineAtMs = Date.now() + CANDIDATE_ASSURANCE_TIMEOUT_MS;
  const deadline = createAssuranceDeadline(deadlineAtMs);
  try {
    requireExplicitLive(argv);
    const target = resolveProductionTarget(argv);
    const coordinates = resolveRevisionCoordinates(argv, target.expectedRevision);
    const expectedConfigurationFingerprint = requireRevisionConfigurationFingerprint(
      readArg(argv, "--expected-config-fingerprint"),
    );
    const operatorEmail = readArg(argv, "--operator-email")?.toLowerCase();
    if (
      !operatorEmail ||
      !/^[a-z0-9][a-z0-9._%+-]{0,63}@pmikcmetro\.com$/i.test(operatorEmail)
    ) {
      throw new Error("internal_operator_required");
    }
    const adminProfile = resolveNamedManagedProfile(argv, "--admin-profile");
    const editorProfile = resolveNamedManagedProfile(argv, "--editor-profile");
    if (adminProfile === editorProfile)
      throw new Error("distinct_managed_profiles_required");
    const output = readArg(argv, "--candidate-assurance-receipt");
    if (!output) throw new Error("candidate_assurance_receipt_path_required");
    const receipts = await receiptModule();
    receipts.exactExternalReceiptPath(output);
    const assuranceContext = await preflightProductionAssurance({
      project: coordinates.project,
      deadlineAtMs,
      abortSignal: deadline.signal,
    });
    const client = verifiedAssuranceClient(assuranceContext, coordinates.project);
    const binding = await withAssuranceTimeout(
      () =>
        readVerifiedCloudRunOriginBinding(
          client,
          {
            ...coordinates,
            origin: target.origin,
            phase: "candidate",
          },
          deadline.signal,
        ),
      "candidate_assurance_deadline_exceeded",
      remainingAssuranceTime(deadlineAtMs, CANDIDATE_ASSURANCE_TIMEOUT_MS),
    );
    const predecessorRevision = binding.predecessorRevision;
    if (!predecessorRevision) throw new Error("exact_predecessor_required");
    const predecessorBaseline = await capturePredecessorBaseline({
      client,
      assuranceContext,
      canonicalOrigin: binding.canonicalOrigin,
      predecessorRevision,
      project: coordinates.project,
      region: coordinates.region,
      service: coordinates.service,
      operatorEmail,
      adminProfile,
      editorProfile,
      deadlineAtMs,
      abortSignal: deadline.signal,
    });
    // Persistent Chromium profiles are exclusive. Keep the two Admin uses serial so the assurance
    // runner itself cannot create a profile-lock failure and misreport a healthy candidate.
    const admin = await runProductionCanary({
      ...target,
      ...coordinates,
      expectedConfigurationFingerprint,
      role: "Admin",
      profile: adminProfile,
      phase: "candidate",
      deadlineAtMs,
      abortSignal: deadline.signal,
      assuranceContext,
    });
    const editor = await runProductionCanary({
      ...target,
      ...coordinates,
      expectedConfigurationFingerprint,
      role: "Editor",
      profile: editorProfile,
      phase: "candidate",
      deadlineAtMs,
      abortSignal: deadline.signal,
      assuranceContext,
    });
    const reconciliation = await runProductionReconciliation({
      ...target,
      ...coordinates,
      expectedConfigurationFingerprint,
      role: "Admin",
      profile: adminProfile,
      phase: "candidate",
      deadlineAtMs,
      abortSignal: deadline.signal,
      assuranceContext,
    });
    const monitoringReady = await withAssuranceTimeout(
      () =>
        readMonitoringConfigurationReady(
          {
            ...coordinates,
            operatorEmail,
          },
          client,
          deadline.signal,
        ),
      "candidate_assurance_deadline_exceeded",
      remainingAssuranceTime(deadlineAtMs, CANDIDATE_ASSURANCE_TIMEOUT_MS),
    );
    if (
      admin.verdict !== "passed" ||
      editor.verdict !== "passed" ||
      reconciliation.verdict !== "passed" ||
      reconciliation.reconciliation?.state !== "matched" ||
      !monitoringReady
    ) {
      throw new Error("candidate_assurance_gate_failed");
    }
    const receipt = receipts.buildCandidateAssuranceReceipt({
      project: coordinates.project,
      region: coordinates.region,
      service: coordinates.service,
      candidateOrigin: target.origin,
      canonicalOrigin: binding.canonicalOrigin,
      expectedCommit: target.expectedCommit,
      expectedRevision: target.expectedRevision,
      expectedConfigurationFingerprint,
      predecessorRevision,
      predecessorBaseline,
      adminVerdict: "passed",
      editorVerdict: "passed",
      reconciliationState: "matched",
      monitoringState: "ready",
    });
    receipts.writeReceipt(output, receipt);
    return receipt;
  } finally {
    deadline.dispose();
  }
}

function resolveRevisionCoordinates(
  argv: readonly string[],
  expectedRevision = readArg(argv, "--expected-revision"),
): RevisionCoordinates {
  const project = readArg(argv, "--project") ?? DEFAULT_PROJECT;
  const region = readArg(argv, "--region") ?? DEFAULT_REGION;
  const service = readArg(argv, "--service") ?? DEFAULT_SERVICE;
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) {
    throw new Error("project_invalid");
  }
  if (!/^[a-z]+-[a-z]+[0-9]$/.test(region)) throw new Error("region_invalid");
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(service)) throw new Error("service_invalid");
  if (!expectedRevision || !/^[a-z][a-z0-9-]{0,62}$/.test(expectedRevision)) {
    throw new Error("expected_revision_invalid");
  }
  return { project, region, service, expectedRevision };
}

async function waitForObservationWindow(
  target: Parameters<typeof verifyExactVersion>[0],
  promotionStartedAtMs: number,
  abortSignal: AbortSignal,
): Promise<void> {
  const { endTimeMs: deadline } = closedObservationInterval(
    promotionStartedAtMs,
    POST_PROMOTION_OBSERVATION_MS,
  );
  while (Date.now() < deadline) {
    await waitForDelay(
      Math.min(POLL_MS, Math.max(1, deadline - Date.now())),
      abortSignal,
    );
    await verifyExactVersion(target, abortSignal);
  }
}

function waitForDelay(timeoutMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error("assurance_deadline_exceeded"));
  return new Promise((resolve, reject) => {
    const done = (): void => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    const abort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new Error("assurance_deadline_exceeded"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

/**
 * Poll only while a new provider sample can begin strictly before the fixed evidence cutoff. The
 * deadline timer and final wait can mature in either order; both paths retain the current sample so
 * the caller can return a structured exact-predecessor rollback without post-cutoff I/O.
 */
export async function pollObservationRuntimeSample<T>(input: {
  readonly deadlineAtMs: number;
  readonly abortSignal: AbortSignal;
  readonly read: () => Promise<T>;
  readonly now?: () => number;
  readonly wait?: (timeoutMs: number, signal: AbortSignal) => Promise<void>;
}): Promise<T | null> {
  const now = input.now ?? Date.now;
  const wait = input.wait ?? waitForDelay;
  const remainingMs = input.deadlineAtMs - now();
  if (remainingMs <= 0) return null;
  try {
    await wait(Math.min(POLL_MS, remainingMs), input.abortSignal);
  } catch (error) {
    if (now() < input.deadlineAtMs) throw error;
  }
  if (now() >= input.deadlineAtMs) return null;
  return input.read();
}

async function readRuntimeSnapshot(
  target: Parameters<typeof verifyExactVersion>[0],
  observation: ObservationTarget,
  client: AuthenticatedReadClient,
  deadlineAtMs = Date.now() + 30_000,
  abortSignal?: AbortSignal,
): Promise<RuntimeSnapshot> {
  let observedRevision = "unverified";
  let trafficPercent = 0;
  let configurationVerified = false;
  let monitoring = unavailableMonitoringSample(false);
  try {
    await withAssuranceTimeout(
      () => verifyExactVersion(target, abortSignal),
      "observation_deadline_exceeded",
      remainingAssuranceTime(deadlineAtMs),
    );
    observedRevision = target.expectedRevision;
    const serviceRead = await client.request<Record<string, unknown>>({
      method: "GET",
      url: `https://run.googleapis.com/v2/projects/${encodeURIComponent(observation.project)}/locations/${encodeURIComponent(observation.region)}/services/${encodeURIComponent(observation.service)}`,
      signal: signalBefore(deadlineAtMs, abortSignal),
    });
    if (exactServiceOrigin(serviceRead.data.uri) !== target.origin) {
      throw new Error("canonical_origin_mismatch");
    }
    trafficPercent = exactRevisionTrafficPercent(
      serviceRead.data,
      target.expectedRevision,
    );
    const revision = await readExactRevision(
      client,
      observation,
      target.expectedRevision,
      deadlineAtMs,
      abortSignal,
    );
    configurationVerified =
      fingerprintRevisionRuntimeConfiguration(revision) ===
      observation.expectedConfigurationFingerprint;
  } catch {
    // Version, service-origin, traffic, or revision-configuration failure is an immediate
    // configuration failure. Monitoring sampling never resets a successful result below.
    return { observedRevision, trafficPercent, configurationVerified, monitoring };
  }

  let monitoringReady = false;
  try {
    monitoringReady = await withAssuranceTimeout(
      () => readMonitoringConfigurationReady(observation, client, abortSignal),
      "monitoring_configuration_timeout",
      remainingAssuranceTime(deadlineAtMs),
    );
  } catch {
    return { observedRevision, trafficPercent, configurationVerified, monitoring };
  }
  monitoring = unavailableMonitoringSample(monitoringReady);
  if (!monitoringReady) {
    return { observedRevision, trafficPercent, configurationVerified, monitoring };
  }

  try {
    const interval = closedObservationInterval(
      observation.promotionStartedAtMs,
      POST_PROMOTION_OBSERVATION_MS,
    );
    const intervalEndMs = Math.min(Date.now(), interval.endTimeMs);
    if (intervalEndMs <= interval.startTimeMs) {
      throw new Error("observation_interval_empty");
    }
    const [requestMetric, attentionMetric, logging] = await Promise.all([
      readMetricCount(client, {
        project: observation.project,
        filter: cloudRunMetricFilter(
          observation,
          target.expectedRevision,
          "run.googleapis.com/request_count",
          'metric.label."response_code_class" = "5xx"',
        ),
        startTimeMs: interval.startTimeMs,
        endTimeMs: intervalEndMs,
        deadlineAtMs,
        abortSignal,
      }),
      readMetricCount(client, {
        project: observation.project,
        filter: cloudRunMetricFilter(
          observation,
          target.expectedRevision,
          "logging.googleapis.com/user/pmi_kc_unresolved_live_effect_count",
        ),
        startTimeMs: interval.startTimeMs,
        endTimeMs: intervalEndMs,
        deadlineAtMs,
        abortSignal,
      }),
      readLoggingCorroboration(
        client,
        observation,
        target.expectedRevision,
        {
          startTimeMs: interval.startTimeMs,
          endTimeMs: intervalEndMs,
        },
        deadlineAtMs,
        abortSignal,
      ),
    ]);
    const corroborated = corroborateMonitoringCounts(
      requestMetric,
      attentionMetric,
      logging,
    );
    monitoring = {
      configurationReady: monitoringReady,
      ...corroborated,
    };
  } catch {
    // Metric/log ingestion can be incomplete or temporarily unreadable while the independently
    // verified monitoring configuration remains ready. Preserve that distinction for the bounded
    // minute-five-to-minute-seven grace.
  }
  return { observedRevision, trafficPercent, configurationVerified, monitoring };
}

async function readExactRevision(
  client: AuthenticatedReadClient,
  observation: Pick<ObservationTarget, "project" | "region" | "service">,
  expectedRevision: string,
  deadlineAtMs = Date.now() + 30_000,
  sharedSignal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const expectedName = `projects/${observation.project}/locations/${observation.region}/services/${observation.service}/revisions/${expectedRevision}`;
  const response = await client.request<Record<string, unknown>>({
    method: "GET",
    url: `https://run.googleapis.com/v2/${expectedName}`,
    signal: signalBefore(deadlineAtMs, sharedSignal),
  });
  if (response.data.name !== expectedName) throw new Error("revision_identity_mismatch");
  return response.data;
}

/**
 * Zero-traffic pre-promotion command mode. It emits only the SHA-256 configuration fingerprint so
 * an operator can pass the exact value back as --expected-config-fingerprint after promotion.
 */
export async function captureRevisionConfigurationFingerprint(
  argv: readonly string[],
): Promise<string> {
  requireExplicitLive(argv);
  const coordinates = resolveRevisionCoordinates(argv);
  const deadlineAtMs = Date.now() + CANDIDATE_ASSURANCE_TIMEOUT_MS;
  const deadline = createAssuranceDeadline(deadlineAtMs);
  try {
    const assuranceContext = await preflightProductionAssurance({
      project: coordinates.project,
      deadlineAtMs,
      abortSignal: deadline.signal,
    });
    const revision = await readExactRevision(
      verifiedAssuranceClient(assuranceContext, coordinates.project),
      coordinates,
      coordinates.expectedRevision,
      deadlineAtMs,
      deadline.signal,
    );
    return fingerprintRevisionRuntimeConfiguration(revision);
  } finally {
    deadline.dispose();
  }
}

async function readMonitoringConfigurationReady(
  observation: MonitoringTarget,
  client: AuthenticatedReadClient,
  abortSignal?: AbortSignal,
): Promise<boolean> {
  // Variable dynamic import keeps the existing runner-neutral .mjs verifier behind this explicit
  // typed adapter without enabling allowJs or weakening TypeScript checks for the repository.
  const modulePath: string = "./verify-monitoring.mjs";
  const verifier = (await import(modulePath)) as unknown as MonitoringVerifierModule;
  if (
    typeof verifier.fetchMonitoringState !== "function" ||
    typeof verifier.evaluateMonitoringState !== "function"
  ) {
    throw new Error("monitoring_verifier_invalid");
  }
  const config: MonitoringVerifierConfig = {
    json: true,
    operatorEmail: observation.operatorEmail,
    project: observation.project,
    region: observation.region,
    service: observation.service,
  };
  const signal = assuranceAbortSignal(undefined, abortSignal);
  const state = await verifier.fetchMonitoringState(config, {
    signal,
    request: (request) => client.request(request),
  });
  return verifier.evaluateMonitoringState(config, state).status === "ready";
}

export function exactRevisionTrafficPercent(
  service: Record<string, unknown>,
  expectedRevision: string,
): number {
  const statuses = service.trafficStatuses;
  if (!Array.isArray(statuses)) return 0;
  let expectedPercent = 0;
  let totalPercent = 0;
  for (const raw of statuses) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;
    const entry = raw as Record<string, unknown>;
    const percent = Number(entry.percent ?? 0);
    if (!Number.isFinite(percent) || percent < 0) return 0;
    totalPercent += percent;
    if (entry.revision === expectedRevision) expectedPercent += percent;
  }
  return totalPercent === 100 ? expectedPercent : 0;
}

function cloudRunMetricFilter(
  target: ObservationTarget,
  revision: string,
  metricType: string,
  suffix?: string,
): string {
  return [
    'resource.type = "cloud_run_revision"',
    `metric.type = "${metricType}"`,
    `resource.label."project_id" = "${target.project}"`,
    `resource.label."location" = "${target.region}"`,
    `resource.label."service_name" = "${target.service}"`,
    `resource.label."revision_name" = "${revision}"`,
    suffix,
  ]
    .filter(Boolean)
    .join(" AND ");
}

export async function readMetricCount(
  client: AuthenticatedReadClient,
  input: {
    readonly project: string;
    readonly filter: string;
    readonly startTimeMs: number;
    readonly endTimeMs: number;
    readonly deadlineAtMs?: number;
    readonly abortSignal?: AbortSignal;
  },
): Promise<MetricCountRead> {
  const url = new URL(
    `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(input.project)}/timeSeries`,
  );
  url.searchParams.set("filter", input.filter);
  url.searchParams.set("interval.startTime", new Date(input.startTimeMs).toISOString());
  url.searchParams.set("interval.endTime", new Date(input.endTimeMs).toISOString());
  url.searchParams.set("aggregation.alignmentPeriod", "300s");
  url.searchParams.set("aggregation.perSeriesAligner", "ALIGN_SUM");
  url.searchParams.set("aggregation.crossSeriesReducer", "REDUCE_SUM");
  url.searchParams.set("view", "FULL");
  const response = await client.request<Record<string, unknown>>({
    method: "GET",
    url: url.toString(),
    signal: signalBefore(input.deadlineAtMs ?? Date.now() + 30_000, input.abortSignal),
  });
  const series = response.data.timeSeries;
  if (series === undefined) return { count: 0, seriesPresent: false };
  if (!Array.isArray(series)) throw new Error("monitoring_read_invalid");
  let total = 0;
  for (const item of series) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("monitoring_read_invalid");
    }
    const points = (item as Record<string, unknown>).points;
    if (!Array.isArray(points)) throw new Error("monitoring_read_invalid");
    for (const point of points) total += pointValue(point);
  }
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("monitoring_read_invalid");
  }
  return { count: total, seriesPresent: series.length > 0 };
}

async function readLoggingCorroboration(
  client: AuthenticatedReadClient,
  observation: Pick<ObservationTarget, "project" | "region" | "service">,
  expectedRevision: string,
  interval: { readonly startTimeMs: number; readonly endTimeMs: number },
  deadlineAtMs = Date.now() + 30_000,
  abortSignal?: AbortSignal,
): Promise<LoggingCorroborationRead> {
  const resourceFilter = cloudRunLogResourceFilter(observation, expectedRevision);
  const [requestLogs, attentionMarkers] = await Promise.all([
    readLogEntryPages(client, {
      project: observation.project,
      filter: [
        resourceFilter,
        `logName = "projects/${observation.project}/logs/run.googleapis.com%2Frequests"`,
      ].join(" AND "),
      interval,
      kind: "request",
      deadlineAtMs,
      abortSignal,
    }),
    readLogEntryPages(client, {
      project: observation.project,
      filter: [
        resourceFilter,
        'jsonPayload.marker = "LIVE_EFFECT_REQUIRES_ATTENTION"',
        'jsonPayload.data_mode = "live"',
      ].join(" AND "),
      interval,
      kind: "attention",
      deadlineAtMs,
      abortSignal,
    }),
  ]);
  return {
    requestLogCount: requestLogs.count,
    requestFiveXxCount: requestLogs.fiveXxCount,
    attentionMarkerCount: attentionMarkers.count,
  };
}

export function cloudRunLogResourceFilter(
  target: Pick<ObservationTarget, "project" | "region" | "service">,
  expectedRevision: string,
): string {
  return [
    'resource.type = "cloud_run_revision"',
    `resource.labels.project_id = "${target.project}"`,
    `resource.labels.location = "${target.region}"`,
    `resource.labels.service_name = "${target.service}"`,
    `resource.labels.revision_name = "${expectedRevision}"`,
  ].join(" AND ");
}

export async function readLogEntryPages(
  client: AuthenticatedReadClient,
  input: {
    readonly project: string;
    readonly filter: string;
    readonly interval: { readonly startTimeMs: number; readonly endTimeMs: number };
    readonly kind: "request" | "attention";
    readonly deadlineAtMs?: number;
    readonly abortSignal?: AbortSignal;
  },
): Promise<{ readonly count: number; readonly fiveXxCount: number }> {
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  let count = 0;
  let fiveXxCount = 0;
  const intervalFilter = [
    input.filter,
    `timestamp >= "${new Date(input.interval.startTimeMs).toISOString()}"`,
    `timestamp < "${new Date(input.interval.endTimeMs).toISOString()}"`,
  ].join(" AND ");
  for (let page = 0; page < MAX_LOG_PAGES; page += 1) {
    const response = await client.request<Record<string, unknown>>({
      method: "POST",
      url: "https://logging.googleapis.com/v2/entries:list",
      signal: signalBefore(input.deadlineAtMs ?? Date.now() + 30_000, input.abortSignal),
      data: {
        resourceNames: [`projects/${input.project}`],
        filter: intervalFilter,
        orderBy: "timestamp asc",
        pageSize: LOG_PAGE_SIZE,
        ...(pageToken ? { pageToken } : {}),
      },
    });
    const entries = response.data.entries ?? [];
    if (!Array.isArray(entries)) throw new Error("logging_read_invalid");
    for (const entry of entries) {
      if (input.kind === "request") {
        const status = requestLogStatus(entry);
        count += 1;
        if (status >= 500) fiveXxCount += 1;
      } else {
        assertAttentionMarker(entry);
        count += 1;
      }
    }
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(fiveXxCount)) {
      throw new Error("logging_read_invalid");
    }
    const nextToken = response.data.nextPageToken;
    if (nextToken === undefined || nextToken === null || nextToken === "") {
      return { count, fiveXxCount };
    }
    if (typeof nextToken !== "string" || seenTokens.has(nextToken)) {
      throw new Error("logging_read_invalid");
    }
    seenTokens.add(nextToken);
    pageToken = nextToken;
  }
  throw new Error("logging_read_incomplete");
}

export function requestLogStatus(value: unknown): number {
  if (!isRecord(value) || !isRecord(value.httpRequest)) {
    throw new Error("logging_read_invalid");
  }
  const status = Number(value.httpRequest.status);
  if (!Number.isSafeInteger(status) || status < 100 || status > 599) {
    throw new Error("logging_read_invalid");
  }
  return status;
}

export function assertAttentionMarker(value: unknown): void {
  if (
    !isRecord(value) ||
    !isRecord(value.jsonPayload) ||
    value.jsonPayload.marker !== "LIVE_EFFECT_REQUIRES_ATTENTION" ||
    value.jsonPayload.data_mode !== "live"
  ) {
    throw new Error("logging_read_invalid");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pointValue(point: unknown): number {
  if (!point || typeof point !== "object" || Array.isArray(point)) {
    throw new Error("monitoring_read_invalid");
  }
  const value = (point as Record<string, unknown>).value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("monitoring_read_invalid");
  }
  const record = value as Record<string, unknown>;
  const raw = record.int64Value ?? record.doubleValue ?? 0;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error("monitoring_read_invalid");
  }
  return Math.round(numeric);
}

function exactServiceOrigin(value: unknown): string {
  if (typeof value !== "string") throw new Error("canonical_origin_mismatch");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/(?:^|\.)a\.run\.app$/.test(url.hostname)
  ) {
    throw new Error("canonical_origin_mismatch");
  }
  return url.origin;
}

function signalBefore(deadlineAtMs: number, sharedSignal?: AbortSignal): AbortSignal {
  return assuranceAbortSignal(remainingAssuranceTime(deadlineAtMs), sharedSignal);
}

function requireReconciliation(
  report: ProductionAssuranceEvidence,
): NonNullable<ProductionAssuranceEvidence["reconciliation"]> {
  if (!report.reconciliation) throw new Error("reconciliation_missing");
  return report.reconciliation;
}

function isAssuranceDeadlineFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    /(?:^|_)deadline_exceeded$|(?:^|_)timeout$/.test(error.message)
  );
}

/**
 * A post-promotion timeout is itself a rollback decision, never an unstructured CLI error. Build
 * the complete bodyless manifest locally so even a late start or serial-check overrun persists the
 * exact predecessor needed by the release compensator.
 */
export function buildObservationDeadlineRollbackReport(input: {
  readonly target: Parameters<typeof verifyExactVersion>[0];
  readonly predecessorRevision: string;
  readonly promotionStartedAtMs: number;
  readonly nowMs?: number;
}): ProductionAssuranceEvidence {
  const nowMs = input.nowMs ?? Date.now();
  const failedRoutes = (["Admin", "Editor"] as const).flatMap((role) =>
    routesForRole(role).map((definition) => ({
      actorRole: role,
      routeKey: definition.key,
      outcome: "failed" as const,
      statusClass: "none" as const,
      elapsedMs: 0,
      landmarkPresent: false,
      diagnostics: addDiagnostic(emptyDiagnosticCounts(), "landmark_missing"),
    })),
  );
  const reconciliation = {
    state: "inconclusive_source_unavailable" as const,
    rentvine: "unavailable" as const,
    sheet: "unavailable" as const,
    application: "unavailable" as const,
    sourceDrift: "unknown" as const,
    counts: emptyReconciliationCounts(),
  };
  const monitoring = unavailableMonitoringSample(false);
  const observation = evaluateReleaseObservation({
    expectedRevision: input.target.expectedRevision,
    observedRevision: "unverified",
    predecessorRevision: input.predecessorRevision,
    trafficPercent: 0,
    configurationVerified: false,
    successfulCheckpoints: 0,
    checkpointStartedOffsetsMs: [],
    elapsedMs: Math.max(0, nowMs - input.promotionStartedAtMs),
    adminRoutes: failedRoutes.filter((route) => route.actorRole === "Admin"),
    editorRoutes: failedRoutes.filter((route) => route.actorRole === "Editor"),
    reconciliation,
    monitoring,
  });
  return buildObservationReport(
    input.target,
    failedRoutes,
    reconciliation,
    monitoring,
    observation,
  );
}

function buildObservationReport(
  target: Parameters<typeof verifyExactVersion>[0],
  routes: ProductionAssuranceEvidence["routes"],
  reconciliation: NonNullable<ProductionAssuranceEvidence["reconciliation"]>,
  monitoring: MonitoringAssuranceEvidence,
  observation: NonNullable<ProductionAssuranceEvidence["observation"]>,
): ProductionAssuranceEvidence {
  return {
    schemaVersion: PRODUCTION_ASSURANCE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    phase: "post_promotion",
    expectedCommit: target.expectedCommit,
    expectedRevision: target.expectedRevision,
    actorRole: null,
    verdict:
      observation.decision === "passed"
        ? "passed"
        : observation.decision === "hold" || observation.decision === "observing"
          ? "inconclusive"
          : "failed",
    routes,
    reconciliation,
    monitoring,
    observation,
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    if (hasArg(argv, "--verify-rollback-recovery")) {
      await verifyRollbackRecoveryFromReceipt(argv);
      process.stdout.write("predecessor_recovery_verified\n");
      return;
    }
    if (hasArg(argv, "--capture-config-fingerprint")) {
      const fingerprint = await captureRevisionConfigurationFingerprint(argv);
      process.stdout.write(`${fingerprint}\n`);
      return;
    }
    if (hasArg(argv, "--prepare-candidate-receipt")) {
      await prepareCandidateAssuranceReceipt(argv);
      return;
    }
    const report = await observeProductionRelease(argv);
    writeAssuranceReport(argv, report);
    if (report.verdict !== "passed") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Production observation refused: ${safeCliFailure(error)}.\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
