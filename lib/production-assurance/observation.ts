import { hasBrowserDiagnostics } from "./browser-policy";
import { routesForRole } from "./manifest";
import { MONITORING_INGESTION_DELAY_MS } from "./runtime-observation";
import type {
  AssuranceRole,
  MonitoringAssuranceEvidence,
  ObservationAssuranceEvidence,
  ObservationReason,
  ReconciliationAssuranceEvidence,
  RouteAssuranceEvidence,
} from "./types";

export const POST_PROMOTION_OBSERVATION_MS = 5 * 60 * 1_000;
export const IMMEDIATE_CHECKPOINT_GRACE_MS = 60_000;
/** Earliest point at which the closed observation interval can have complete monitoring evidence. */
export const POST_PROMOTION_EVIDENCE_READY_MS =
  POST_PROMOTION_OBSERVATION_MS + MONITORING_INGESTION_DELAY_MS;

export interface ReleaseObservationInput {
  readonly expectedRevision: string;
  readonly observedRevision: string;
  readonly predecessorRevision: string;
  readonly trafficPercent: number;
  readonly configurationVerified: boolean;
  readonly successfulCheckpoints: number;
  readonly checkpointStartedOffsetsMs: readonly number[];
  readonly elapsedMs: number;
  readonly adminRoutes: readonly RouteAssuranceEvidence[];
  readonly editorRoutes: readonly RouteAssuranceEvidence[];
  readonly reconciliation: ReconciliationAssuranceEvidence;
  readonly monitoring: MonitoringAssuranceEvidence;
}

export function evaluateReleaseObservation(
  input: ReleaseObservationInput,
): ObservationAssuranceEvidence {
  validateObservationInput(input);
  const rollbackReasons: ObservationReason[] = [];
  const holdReasons: ObservationReason[] = [];
  const observationWindowComplete = input.elapsedMs >= POST_PROMOTION_OBSERVATION_MS;
  const monitoringDeadlineReached = input.elapsedMs >= POST_PROMOTION_EVIDENCE_READY_MS;
  if (
    !validCheckpointSchedule(
      input.checkpointStartedOffsetsMs,
      input.successfulCheckpoints,
    )
  ) {
    rollbackReasons.push("checkpoint_schedule_invalid");
  }

  if (input.observedRevision !== input.expectedRevision) {
    rollbackReasons.push("revision_mismatch");
  }
  if (input.trafficPercent !== 100) rollbackReasons.push("traffic_mismatch");
  if (!input.configurationVerified) rollbackReasons.push("configuration_unverified");
  classifyRouteResults(
    input.adminRoutes,
    "Admin",
    "admin_canary_failed",
    rollbackReasons,
  );
  classifyRouteResults(
    input.editorRoutes,
    "Editor",
    "editor_canary_failed",
    rollbackReasons,
  );

  if (input.reconciliation.state === "mismatch") {
    rollbackReasons.push("reconciliation_mismatch");
  } else if (input.reconciliation.state === "inconclusive_source_changed") {
    holdReasons.push("source_changed");
  } else if (input.reconciliation.state === "inconclusive_source_unavailable") {
    holdReasons.push("source_unavailable");
  }

  if (!input.monitoring.configurationReady) {
    rollbackReasons.push("monitoring_unavailable");
  }
  // Metric/log ingestion can legitimately be incomplete after the five-minute interval closes.
  // It becomes a hard failure at the fixed ingestion deadline; no absent series can pass the gate.
  if (!input.monitoring.readComplete && monitoringDeadlineReached) {
    rollbackReasons.push("monitoring_unavailable");
  }
  if (input.successfulCheckpoints !== 2 && monitoringDeadlineReached) {
    rollbackReasons.push("checkpoint_incomplete");
  }
  if (input.monitoring.candidateFiveXxCount > 0) {
    rollbackReasons.push("candidate_5xx");
  }
  if (input.monitoring.unresolvedLiveEffectCount > 0) {
    rollbackReasons.push("unresolved_live_effect");
  }

  if (rollbackReasons.length > 0) {
    return {
      decision: "rollback_required",
      successfulCheckpoints: input.successfulCheckpoints,
      elapsedMs: input.elapsedMs,
      windowMs: POST_PROMOTION_OBSERVATION_MS,
      reasons: uniqueReasons(rollbackReasons),
      rollbackRevision: input.predecessorRevision,
    };
  }
  if (holdReasons.length > 0) {
    return {
      decision: "hold",
      successfulCheckpoints: input.successfulCheckpoints,
      elapsedMs: input.elapsedMs,
      windowMs: POST_PROMOTION_OBSERVATION_MS,
      reasons: uniqueReasons(holdReasons),
      rollbackRevision: null,
    };
  }
  if (
    !observationWindowComplete ||
    !input.monitoring.readComplete ||
    input.successfulCheckpoints !== 2
  ) {
    return {
      decision: "observing",
      successfulCheckpoints: input.successfulCheckpoints,
      elapsedMs: input.elapsedMs,
      windowMs: POST_PROMOTION_OBSERVATION_MS,
      reasons: ["window_incomplete"],
      rollbackRevision: null,
    };
  }
  return {
    decision: "passed",
    successfulCheckpoints: input.successfulCheckpoints,
    elapsedMs: input.elapsedMs,
    windowMs: POST_PROMOTION_OBSERVATION_MS,
    reasons: [],
    rollbackRevision: null,
  };
}

function classifyRouteResults(
  routes: readonly RouteAssuranceEvidence[],
  role: AssuranceRole,
  failedReason: "admin_canary_failed" | "editor_canary_failed",
  reasons: ObservationReason[],
): void {
  if (
    !routeManifestComplete(routes, role) ||
    routes.some((route) => route.outcome === "failed" || !route.landmarkPresent)
  ) {
    reasons.push(failedReason);
  }
  if (routes.some((route) => hasBrowserDiagnostics(route.diagnostics))) {
    reasons.push("browser_diagnostic");
  }
}

function routeManifestComplete(
  routes: readonly RouteAssuranceEvidence[],
  role: AssuranceRole,
): boolean {
  const expected = routesForRole(role);
  if (routes.length !== expected.length) return false;
  const observedByKey = new Map(routes.map((route) => [route.routeKey, route]));
  if (observedByKey.size !== routes.length) return false;
  return expected.every((definition) => {
    const route = observedByKey.get(definition.key);
    return route?.actorRole === role && route.outcome === definition.expectedOutcome;
  });
}

function validateObservationInput(input: ReleaseObservationInput): void {
  if (!isRevision(input.expectedRevision) || !isRevision(input.observedRevision)) {
    throw new Error("Observation requires valid expected and observed revisions.");
  }
  if (
    !isRevision(input.predecessorRevision) ||
    input.predecessorRevision === input.expectedRevision
  ) {
    throw new Error("Observation requires one distinct exact predecessor revision.");
  }
  if (
    !Number.isFinite(input.trafficPercent) ||
    input.trafficPercent < 0 ||
    input.trafficPercent > 100
  ) {
    throw new Error("Observation traffic percent is invalid.");
  }
  if (typeof input.configurationVerified !== "boolean") {
    throw new Error("Observation configuration verification is invalid.");
  }
  if (!Number.isSafeInteger(input.elapsedMs) || input.elapsedMs < 0) {
    throw new Error("Observation elapsed time is invalid.");
  }
  if (
    !Number.isSafeInteger(input.successfulCheckpoints) ||
    input.successfulCheckpoints < 0 ||
    input.successfulCheckpoints > 2
  ) {
    throw new Error("Observation checkpoint count is invalid.");
  }
  if (
    !Array.isArray(input.checkpointStartedOffsetsMs) ||
    input.checkpointStartedOffsetsMs.length > 2 ||
    input.checkpointStartedOffsetsMs.some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    )
  ) {
    throw new Error("Observation checkpoint schedule is invalid.");
  }
}

function validCheckpointSchedule(
  offsets: readonly number[],
  successfulCheckpoints: number,
): boolean {
  if (offsets.length === 0 || offsets[0] > IMMEDIATE_CHECKPOINT_GRACE_MS) return false;
  if (successfulCheckpoints === 2 && offsets.length !== 2) return false;
  if (offsets.length === 1) return true;
  return offsets[1] >= POST_PROMOTION_OBSERVATION_MS;
}

function isRevision(value: string): boolean {
  return /^[a-z][a-z0-9-]{0,62}$/.test(value);
}

function uniqueReasons(reasons: readonly ObservationReason[]): ObservationReason[] {
  return [...new Set(reasons)];
}
