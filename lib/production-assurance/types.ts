export const PRODUCTION_ASSURANCE_SCHEMA_VERSION =
  "pmi-kc-production-assurance.v1" as const;

export const ASSURANCE_ROLES = ["Admin", "Editor"] as const;
export type AssuranceRole = (typeof ASSURANCE_ROLES)[number];

export const ASSURANCE_PHASES = ["candidate", "post_promotion", "rollback"] as const;
export type AssurancePhase = (typeof ASSURANCE_PHASES)[number];

export const ROUTE_KEYS = [
  "dashboard",
  "my_work",
  "access_center",
  "connections",
  "renewal_desk",
  "renewal_workspace",
  "maintenance",
  "communications",
  "internal_processes",
  "notifications",
  "approval_queue_access",
  "admin_hub",
  "people_and_access",
  "admin_hub_denied",
  "people_and_access_denied",
] as const;
export type AssuranceRouteKey = (typeof ROUTE_KEYS)[number];

export const DIAGNOSTIC_KINDS = [
  "console_error",
  "page_error",
  "request_failed",
  "unexpected_response",
  "route_error_boundary",
  "global_error_boundary",
  "mutation_attempt",
  "auth_mismatch",
  "landmark_missing",
] as const;
export type DiagnosticKind = (typeof DIAGNOSTIC_KINDS)[number];

export type StatusClass = "2xx" | "3xx" | "4xx" | "5xx" | "none";
export type AssuranceVerdict = "passed" | "failed" | "inconclusive";

export type DiagnosticCounts = Readonly<Record<DiagnosticKind, number>>;

export interface RouteAssuranceEvidence {
  readonly actorRole: AssuranceRole;
  readonly routeKey: AssuranceRouteKey;
  readonly outcome: "rendered" | "denied" | "failed";
  readonly statusClass: StatusClass;
  readonly elapsedMs: number;
  readonly landmarkPresent: boolean;
  readonly diagnostics: DiagnosticCounts;
}

export type SourceReadState = "complete" | "partial" | "unavailable";
export type SourceDriftState = "stable" | "changed" | "unknown";
export type ReconciliationState =
  | "matched"
  | "mismatch"
  | "inconclusive_source_changed"
  | "inconclusive_source_unavailable";

export interface ReconciliationCounts {
  readonly sourceRecords: number;
  readonly projectedRecords: number;
  readonly renderedRecords: number;
  readonly missingInApplication: number;
  readonly unexpectedInApplication: number;
  readonly duplicateApplicationKeys: number;
  readonly fieldMismatches: number;
  readonly invalidDestinations: number;
}

export interface ReconciliationAssuranceEvidence {
  readonly state: ReconciliationState;
  readonly rentvine: SourceReadState;
  readonly sheet: SourceReadState;
  readonly application: SourceReadState;
  readonly sourceDrift: SourceDriftState;
  readonly counts: ReconciliationCounts;
}

export interface MonitoringAssuranceEvidence {
  readonly configurationReady: boolean;
  readonly readComplete: boolean;
  readonly candidateFiveXxCount: number;
  readonly unresolvedLiveEffectCount: number;
}

export const OBSERVATION_REASONS = [
  "revision_mismatch",
  "traffic_mismatch",
  "configuration_unverified",
  "admin_canary_failed",
  "editor_canary_failed",
  "browser_diagnostic",
  "reconciliation_mismatch",
  "source_changed",
  "source_unavailable",
  "monitoring_unavailable",
  "candidate_5xx",
  "unresolved_live_effect",
  "checkpoint_incomplete",
  "checkpoint_schedule_invalid",
  "window_incomplete",
] as const;
export type ObservationReason = (typeof OBSERVATION_REASONS)[number];

export type ObservationDecision = "observing" | "passed" | "hold" | "rollback_required";

export interface ObservationAssuranceEvidence {
  readonly decision: ObservationDecision;
  /** Successful full Admin+Editor+reconciliation checkpoints; release success requires exactly 2. */
  readonly successfulCheckpoints: number;
  readonly elapsedMs: number;
  readonly windowMs: number;
  readonly reasons: readonly ObservationReason[];
  readonly rollbackRevision: string | null;
}

export interface ProductionAssuranceEvidence {
  readonly schemaVersion: typeof PRODUCTION_ASSURANCE_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly phase: AssurancePhase;
  readonly expectedCommit: string;
  readonly expectedRevision: string;
  readonly actorRole: AssuranceRole | null;
  readonly verdict: AssuranceVerdict;
  readonly routes: readonly RouteAssuranceEvidence[];
  readonly reconciliation: ReconciliationAssuranceEvidence | null;
  readonly monitoring: MonitoringAssuranceEvidence | null;
  readonly observation: ObservationAssuranceEvidence | null;
}

export function emptyDiagnosticCounts(): Record<DiagnosticKind, number> {
  return Object.fromEntries(DIAGNOSTIC_KINDS.map((kind) => [kind, 0])) as Record<
    DiagnosticKind,
    number
  >;
}
