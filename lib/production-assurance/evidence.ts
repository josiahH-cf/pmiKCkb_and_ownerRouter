import { routesForRole } from "./manifest";
import {
  ASSURANCE_PHASES,
  ASSURANCE_ROLES,
  DIAGNOSTIC_KINDS,
  OBSERVATION_REASONS,
  PRODUCTION_ASSURANCE_SCHEMA_VERSION,
  ROUTE_KEYS,
  type ProductionAssuranceEvidence,
} from "./types";

const ROOT_KEYS = [
  "schemaVersion",
  "generatedAt",
  "phase",
  "expectedCommit",
  "expectedRevision",
  "actorRole",
  "verdict",
  "routes",
  "reconciliation",
  "monitoring",
  "observation",
] as const;
const ROUTE_KEYS_ALLOWED = [
  "actorRole",
  "routeKey",
  "outcome",
  "statusClass",
  "elapsedMs",
  "landmarkPresent",
  "diagnostics",
] as const;
const RECONCILIATION_KEYS = [
  "state",
  "rentvine",
  "sheet",
  "application",
  "sourceDrift",
  "counts",
] as const;
const RECONCILIATION_COUNT_KEYS = [
  "sourceRecords",
  "projectedRecords",
  "renderedRecords",
  "missingInApplication",
  "unexpectedInApplication",
  "duplicateApplicationKeys",
  "fieldMismatches",
  "invalidDestinations",
] as const;
const MONITORING_KEYS = [
  "configurationReady",
  "readComplete",
  "candidateFiveXxCount",
  "unresolvedLiveEffectCount",
] as const;
const OBSERVATION_KEYS = [
  "decision",
  "successfulCheckpoints",
  "elapsedMs",
  "windowMs",
  "reasons",
  "rollbackRevision",
] as const;

export function assertProductionAssuranceEvidence(
  value: unknown,
): asserts value is ProductionAssuranceEvidence {
  if (!isRecord(value)) throw new Error("Assurance evidence must be an object.");
  assertExactKeys(value, ROOT_KEYS, "evidence");
  if (value.schemaVersion !== PRODUCTION_ASSURANCE_SCHEMA_VERSION) {
    throw new Error("Assurance evidence schema version is invalid.");
  }
  if (!isIsoTimestamp(value.generatedAt)) {
    throw new Error("Assurance evidence timestamp is invalid.");
  }
  if (!isOneOf(value.phase, ASSURANCE_PHASES)) {
    throw new Error("Assurance evidence phase is invalid.");
  }
  if (
    typeof value.expectedCommit !== "string" ||
    !/^[a-f0-9]{40}$/i.test(value.expectedCommit)
  ) {
    throw new Error("Assurance evidence commit is invalid.");
  }
  if (
    typeof value.expectedRevision !== "string" ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(value.expectedRevision)
  ) {
    throw new Error("Assurance evidence revision is invalid.");
  }
  if (value.actorRole !== null && !isOneOf(value.actorRole, ASSURANCE_ROLES)) {
    throw new Error("Assurance evidence role is invalid.");
  }
  if (!isOneOf(value.verdict, ["passed", "failed", "inconclusive"] as const)) {
    throw new Error("Assurance evidence verdict is invalid.");
  }
  if (!Array.isArray(value.routes)) throw new Error("Assurance routes are invalid.");
  for (const route of value.routes) assertRoute(route);
  const routes = value.routes as ProductionAssuranceEvidence["routes"];
  if (value.actorRole !== null) {
    // A reconciliation-only artifact intentionally carries no browser routes. Every artifact that
    // does carry canary routes must carry the role's complete manifest exactly once.
    if (routes.length === 0) {
      if (value.reconciliation === null) {
        throw new Error("Assurance canary evidence is missing its exact actor manifest.");
      }
    } else {
      assertExactRoleManifest(routes, value.actorRole);
    }
  } else {
    assertExactCombinedManifest(routes);
  }
  if (value.reconciliation !== null) assertReconciliation(value.reconciliation);
  if (value.monitoring !== null) assertMonitoring(value.monitoring);
  if (value.observation !== null) assertObservation(value.observation);
}

function assertExactCombinedManifest(
  routes: ProductionAssuranceEvidence["routes"],
): void {
  const expectedCount = ASSURANCE_ROLES.reduce(
    (count, role) => count + routesForRole(role).length,
    0,
  );
  if (routes.length !== expectedCount) {
    throw new Error("Combined assurance evidence is missing an exact role manifest.");
  }
  for (const role of ASSURANCE_ROLES) {
    assertExactRoleManifest(
      routes.filter((route) => route.actorRole === role),
      role,
    );
  }
}

function assertExactRoleManifest(
  routes: ProductionAssuranceEvidence["routes"],
  role: (typeof ASSURANCE_ROLES)[number],
): void {
  const expected = routesForRole(role);
  if (routes.length !== expected.length) {
    throw new Error("Assurance evidence is missing an exact actor manifest.");
  }
  const seen = new Set<string>();
  for (const route of routes) {
    if (route.actorRole !== role) {
      throw new Error("Assurance evidence contains a route for a different actor role.");
    }
    if (seen.has(route.routeKey)) {
      throw new Error("Assurance evidence contains a duplicate actor-manifest route.");
    }
    seen.add(route.routeKey);
    const definition = expected.find((candidate) => candidate.key === route.routeKey);
    if (!definition) {
      throw new Error("Assurance evidence contains a route outside the actor manifest.");
    }
    if (route.outcome !== "failed" && route.outcome !== definition.expectedOutcome) {
      throw new Error("Assurance route outcome contradicts the actor manifest.");
    }
  }
  if (expected.some((definition) => !seen.has(definition.key))) {
    throw new Error("Assurance evidence is missing an exact actor-manifest route.");
  }
}

export function serializeProductionAssuranceEvidence(
  value: ProductionAssuranceEvidence,
): string {
  assertProductionAssuranceEvidence(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertRoute(value: unknown): void {
  if (!isRecord(value)) throw new Error("Assurance route evidence is invalid.");
  assertExactKeys(value, ROUTE_KEYS_ALLOWED, "route evidence");
  if (!isOneOf(value.actorRole, ASSURANCE_ROLES)) {
    throw new Error("Route actor role is invalid.");
  }
  if (!isOneOf(value.routeKey, ROUTE_KEYS)) throw new Error("Route key is invalid.");
  if (!isOneOf(value.outcome, ["rendered", "denied", "failed"] as const)) {
    throw new Error("Route outcome is invalid.");
  }
  if (!isOneOf(value.statusClass, ["2xx", "3xx", "4xx", "5xx", "none"] as const)) {
    throw new Error("Route status class is invalid.");
  }
  assertCount(value.elapsedMs, "route elapsed time");
  if (typeof value.landmarkPresent !== "boolean") {
    throw new Error("Route landmark state is invalid.");
  }
  if (!isRecord(value.diagnostics)) throw new Error("Route diagnostics are invalid.");
  assertExactKeys(value.diagnostics, DIAGNOSTIC_KINDS, "route diagnostics");
  for (const kind of DIAGNOSTIC_KINDS) assertCount(value.diagnostics[kind], kind);
}

function assertReconciliation(value: unknown): void {
  if (!isRecord(value)) throw new Error("Reconciliation evidence is invalid.");
  assertExactKeys(value, RECONCILIATION_KEYS, "reconciliation evidence");
  if (
    !isOneOf(value.state, [
      "matched",
      "mismatch",
      "inconclusive_source_changed",
      "inconclusive_source_unavailable",
    ] as const)
  ) {
    throw new Error("Reconciliation state is invalid.");
  }
  for (const key of ["rentvine", "sheet", "application"] as const) {
    if (!isOneOf(value[key], ["complete", "partial", "unavailable"] as const)) {
      throw new Error(`Reconciliation ${key} state is invalid.`);
    }
  }
  if (!isOneOf(value.sourceDrift, ["stable", "changed", "unknown"] as const)) {
    throw new Error("Reconciliation drift state is invalid.");
  }
  if (!isRecord(value.counts)) throw new Error("Reconciliation counts are invalid.");
  assertExactKeys(value.counts, RECONCILIATION_COUNT_KEYS, "reconciliation counts");
  for (const key of RECONCILIATION_COUNT_KEYS) assertCount(value.counts[key], key);
}

function assertMonitoring(value: unknown): void {
  if (!isRecord(value)) throw new Error("Monitoring evidence is invalid.");
  assertExactKeys(value, MONITORING_KEYS, "monitoring evidence");
  if (
    typeof value.configurationReady !== "boolean" ||
    typeof value.readComplete !== "boolean"
  ) {
    throw new Error("Monitoring readiness is invalid.");
  }
  assertCount(value.candidateFiveXxCount, "candidate 5xx count");
  assertCount(value.unresolvedLiveEffectCount, "unresolved live-effect count");
}

function assertObservation(value: unknown): void {
  if (!isRecord(value)) throw new Error("Observation evidence is invalid.");
  assertExactKeys(value, OBSERVATION_KEYS, "observation evidence");
  if (
    !isOneOf(value.decision, [
      "observing",
      "passed",
      "hold",
      "rollback_required",
    ] as const)
  ) {
    throw new Error("Observation decision is invalid.");
  }
  assertCount(value.successfulCheckpoints, "successful observation checkpoints");
  if ((value.successfulCheckpoints as number) > 2) {
    throw new Error("Successful observation checkpoints cannot exceed two.");
  }
  assertCount(value.elapsedMs, "observation elapsed time");
  assertCount(value.windowMs, "observation window");
  if (
    !Array.isArray(value.reasons) ||
    !value.reasons.every((reason) => isOneOf(reason, OBSERVATION_REASONS))
  ) {
    throw new Error("Observation reasons are invalid.");
  }
  if (
    value.rollbackRevision !== null &&
    (typeof value.rollbackRevision !== "string" ||
      !/^[a-z][a-z0-9-]{0,62}$/.test(value.rollbackRevision))
  ) {
    throw new Error("Observation rollback revision is invalid.");
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(allowed)) {
    throw new Error(`${label} contains a missing or forbidden field.`);
  }
}

function assertCount(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<const T extends readonly unknown[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return values.includes(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
