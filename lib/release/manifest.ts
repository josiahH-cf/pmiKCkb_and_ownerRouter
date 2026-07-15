import { createHash } from "node:crypto";
import { z } from "zod";

import {
  CreateActionRegistryInputSchema,
  type CreateActionRegistryInput,
  type ParsedActionRegistryInput,
} from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { LEASE_EXECUTION_ACTIONS } from "@/lib/lease-renewal/execution/matrix";
import { MAINTENANCE_EXECUTION_ACTIONS } from "@/lib/maintenance/execution/matrix";

export const V1_REQUIRED_ACTION_KEYS = Object.freeze(
  [...new Set([...LEASE_EXECUTION_ACTIONS, ...MAINTENANCE_EXECUTION_ACTIONS])].sort(),
);

function acceptanceIds(suite: number, last: number) {
  return Object.freeze(
    Array.from({ length: last }, (_, index) => `AC-S${suite}-${index + 1}`),
  );
}

export const V1_REQUIRED_SUITE_ACCEPTANCE_IDS = Object.freeze({
  S20: acceptanceIds(20, 8),
  S21: acceptanceIds(21, 7),
  S22: acceptanceIds(22, 9),
  S23: acceptanceIds(23, 7),
  S24: acceptanceIds(24, 8),
  S25: acceptanceIds(25, 10),
  S26: acceptanceIds(26, 10),
});

type V1RequiredSuite = keyof typeof V1_REQUIRED_SUITE_ACCEPTANCE_IDS;

const ProofStateSchema = z.enum([
  "Local green",
  "Gated",
  "Sandbox proven",
  "Production allowed",
  "Bounded production proven",
  "Accepted",
]);

const DurableReferenceSchema = z.string().trim().min(1).max(500);

const PendingAcceptanceSchema = z
  .object({
    status: z.literal("pending"),
  })
  .strict();

const AcceptedAcceptanceSchema = z
  .object({
    status: z.literal("accepted"),
    acceptedBy: z.string().trim().min(1),
    acceptedAt: z.string().datetime(),
    evidenceRef: DurableReferenceSchema,
    releaseIdentityHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

const AcceptanceSchema = z.discriminatedUnion("status", [
  PendingAcceptanceSchema,
  AcceptedAcceptanceSchema,
]);

const SuiteProofSchema = z
  .object({
    state: ProofStateSchema,
    acceptanceIds: z.array(z.string().regex(/^AC-S2[0-6]-\d+$/)).min(1),
    evidenceRef: DurableReferenceSchema.optional(),
  })
  .strict();

const ActionProofSchema = z
  .object({
    key: z.string().trim().min(1),
    state: ProofStateSchema,
    productionAllowed: z.boolean(),
    evidenceRef: DurableReferenceSchema.optional(),
    monitoringRef: DurableReferenceSchema.optional(),
    rollbackRef: DurableReferenceSchema.optional(),
  })
  .strict();

export const V1ReleaseManifestSchema = z
  .object({
    schemaVersion: z.literal("v1-release-manifest:1.0"),
    stage: z.enum([
      "pre-v1-foundation",
      "pre-v1-data-comms",
      "pre-v1-vendor",
      "pre-v1-renewal",
      "pre-v1-maintenance",
      "v1-candidate",
      "v1",
    ]),
    commit: z.string().regex(/^[0-9a-f]{7,40}$/),
    revision: z.string().trim().min(1),
    environment: z.enum(["local", "emulator", "sandbox", "production"]),
    registryHash: z.string().regex(/^[0-9a-f]{64}$/),
    rulesVersion: z.string().trim().min(1),
    indexesVersion: z.string().trim().min(1),
    artifactVersion: z.literal("communications-artifacts:v1.0"),
    retentionVersion: z.literal("communications-retention:v1.0"),
    suites: z
      .object({
        S20: SuiteProofSchema,
        S21: SuiteProofSchema,
        S22: SuiteProofSchema,
        S23: SuiteProofSchema,
        S24: SuiteProofSchema,
        S25: SuiteProofSchema,
        S26: SuiteProofSchema,
      })
      .strict(),
    actions: z.array(ActionProofSchema),
    migrations: z.array(z.string()),
    smokeCases: z.array(z.string().trim().min(1)).min(1),
    monitoringRef: DurableReferenceSchema,
    rollbackRef: DurableReferenceSchema,
    browserAcceptanceRef: DurableReferenceSchema,
    danBusinessAcceptance: AcceptanceSchema,
    josiahTechnicalAcceptance: AcceptanceSchema,
  })
  .strict();

export type V1ReleaseManifest = z.infer<typeof V1ReleaseManifestSchema>;

export interface V1EvidenceResolution {
  fileExists: boolean;
  anchorExists: boolean;
}

/**
 * Trusted observations supplied by the release command, never by the manifest
 * being verified. Keeping this dependency explicit lets the local Pre-V1
 * report stay pure while making a final V1 verdict impossible from self-
 * asserted JSON alone.
 */
export interface V1ReleaseVerificationAuthority {
  commit: string;
  revision: string;
  rulesVersion: string;
  indexesVersion: string;
  registryHash: string;
  resolveEvidence: (reference: string) => V1EvidenceResolution;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function normalizedRegistry(
  registry: readonly CreateActionRegistryInput[],
): ParsedActionRegistryInput[] {
  return registry
    .map((entry) => CreateActionRegistryInputSchema.parse(entry))
    .sort((left, right) => left.key.localeCompare(right.key));
}

/** Hash every operational Registry field after schema defaults, not only gate booleans. */
export function actionRegistryHash(registry: readonly CreateActionRegistryInput[]) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(normalizedRegistry(registry))))
    .digest("hex");
}

const unresolvedMarker =
  /(?:\bfake\b|\bfixture\b|\bsynthetic\b|\bsample\b|\bexample\b|\bplaceholder\b|\bpending\b|\btodo\b|\btbd\b|\bunreleased\b|\blocal\b|undocumented|not documented|vendor[- ]confirmation[- ]required|<[^>]+>)/i;

function isProductionEvidenceRef(value: string | undefined): value is string {
  return productionEvidenceIdentity(value) !== null;
}

/** Case-folded identity prevents filesystem/path aliases from satisfying two release gates. */
function productionEvidenceIdentity(value: string | undefined) {
  if (!value || unresolvedMarker.test(value) || value.includes("\\")) return null;
  const match =
    /^(docs\/evidence\/[A-Za-z0-9._/-]+\.(?:md|json|html))#([A-Za-z0-9._-]+)$/.exec(
      value,
    );
  if (!match) return null;
  const pathSegments = match[1].split("/");
  if (
    pathSegments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    ) ||
    match[2] === "." ||
    match[2] === ".."
  ) {
    return null;
  }
  return `${match[1].toLowerCase()}#${match[2].toLowerCase()}`;
}

function isProductionPin(value: string) {
  return value.trim().length >= 7 && !unresolvedMarker.test(value);
}

function hasExactValues(actual: readonly string[], expected: readonly string[]) {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) {
    return false;
  }
  const expectedSet = new Set(expected);
  return actual.every((value) => expectedSet.has(value));
}

function validateNamedAcceptance(
  label: string,
  expectedName: "Dan" | "Josiah",
  acceptance: V1ReleaseManifest["danBusinessAcceptance"],
  expectedReleaseIdentityHash: string,
  issues: string[],
) {
  if (acceptance.status !== "accepted") {
    issues.push(`${label} acceptance is pending.`);
    return;
  }
  if (acceptance.acceptedBy !== expectedName) {
    issues.push(`${label} acceptance must be recorded by ${expectedName}.`);
  }
  if (!isProductionEvidenceRef(acceptance.evidenceRef)) {
    issues.push(`${label} acceptance lacks durable production evidence.`);
  }
  if (acceptance.releaseIdentityHash !== expectedReleaseIdentityHash) {
    issues.push(`${label} acceptance does not match this release identity.`);
  }
}

/**
 * Non-circular candidate identity signed by Dan and Josiah. It binds every immutable release pin,
 * proof, and operational reference while deliberately excluding the two acceptance objects.
 */
export function v1ReleaseIdentityHash(manifest: V1ReleaseManifest) {
  const suites = Object.fromEntries(
    Object.entries(manifest.suites).map(([suite, proof]) => [
      suite,
      { ...proof, acceptanceIds: [...proof.acceptanceIds].sort() },
    ]),
  );
  const actions = [...manifest.actions].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  const identity = {
    schemaVersion: manifest.schemaVersion,
    stage: manifest.stage,
    commit: manifest.commit,
    revision: manifest.revision,
    environment: manifest.environment,
    registryHash: manifest.registryHash,
    rulesVersion: manifest.rulesVersion,
    indexesVersion: manifest.indexesVersion,
    artifactVersion: manifest.artifactVersion,
    retentionVersion: manifest.retentionVersion,
    suites,
    actions,
    migrations: [...manifest.migrations].sort(),
    smokeCases: [...manifest.smokeCases].sort(),
    monitoringRef: manifest.monitoringRef,
    rollbackRef: manifest.rollbackRef,
    browserAcceptanceRef: manifest.browserAcceptanceRef,
  };
  return createHash("sha256")
    .update(JSON.stringify(stableValue(identity)))
    .digest("hex");
}

export function verifyV1ReleaseManifest(
  value: unknown,
  registry: readonly CreateActionRegistryInput[] = ACTION_REGISTRY_SEED,
  authority?: V1ReleaseVerificationAuthority,
) {
  const parsed = V1ReleaseManifestSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false as const,
      state: "pre-v1" as const,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  }

  const manifest = parsed.data;
  const issues: string[] = [];
  const releaseIdentityHash = v1ReleaseIdentityHash(manifest);

  if (manifest.stage !== "v1") {
    issues.push(`Release stage is ${manifest.stage}, not v1.`);
  }
  if (manifest.environment !== "production") {
    issues.push(`Release environment is ${manifest.environment}, not production.`);
  }
  if (/^0+$/.test(manifest.commit)) {
    issues.push("Release commit is an unpinned placeholder.");
  }
  if (!isProductionPin(manifest.revision)) {
    issues.push("Release revision is not a durable production revision.");
  }
  if (!isProductionPin(manifest.rulesVersion)) {
    issues.push("Firestore rules are not pinned to a production version.");
  }
  if (!isProductionPin(manifest.indexesVersion)) {
    issues.push("Firestore indexes are not pinned to a production version.");
  }
  let parsedRegistry: ParsedActionRegistryInput[] = [];
  let computedRegistryHash: string | undefined;
  try {
    parsedRegistry = normalizedRegistry(registry);
    computedRegistryHash = actionRegistryHash(registry);
    if (manifest.registryHash !== computedRegistryHash) {
      issues.push("Action Registry hash drifted from the pinned manifest.");
    }
  } catch {
    issues.push("Action Registry does not satisfy its schema.");
  }

  const registryKeys = parsedRegistry.map((entry) => entry.key);
  if (new Set(registryKeys).size !== registryKeys.length) {
    issues.push("Action Registry contains duplicate action keys.");
  }

  for (const suite of Object.keys(
    V1_REQUIRED_SUITE_ACCEPTANCE_IDS,
  ) as V1RequiredSuite[]) {
    const row = manifest.suites[suite];
    if (!hasExactValues(row.acceptanceIds, V1_REQUIRED_SUITE_ACCEPTANCE_IDS[suite])) {
      issues.push(`${suite} acceptance IDs do not match the exact required set.`);
    }
    if (row.state !== "Accepted") {
      issues.push(`${suite} is ${row.state}, not Accepted.`);
    }
    if (!isProductionEvidenceRef(row.evidenceRef)) {
      issues.push(`${suite} lacks durable production acceptance evidence.`);
    }
  }

  const requiredActionSet = new Set<string>(V1_REQUIRED_ACTION_KEYS);
  const manifestActionKeys = manifest.actions.map((action) => action.key);
  if (!hasExactValues(manifestActionKeys, V1_REQUIRED_ACTION_KEYS)) {
    issues.push(
      "Manifest actions do not exactly match the unique required V1 action set.",
    );
  }
  const actionMap = new Map(manifest.actions.map((action) => [action.key, action]));
  const registryMap = new Map(parsedRegistry.map((entry) => [entry.key, entry]));

  for (const action of manifest.actions) {
    if (!requiredActionSet.has(action.key)) {
      issues.push(`Unexpected manifest action ${action.key}.`);
    }
  }

  for (const key of V1_REQUIRED_ACTION_KEYS) {
    const action = actionMap.get(key);
    const registryEntry = registryMap.get(key);
    if (!action) {
      issues.push(`Required action ${key} is missing.`);
      continue;
    }
    if (
      action.state !== "Accepted" ||
      !action.productionAllowed ||
      !registryEntry?.production_allowed ||
      registryEntry.readiness !== "Approved for Execution" ||
      registryEntry.evidence_status !== "Documented"
    ) {
      issues.push(`Required action ${key} lacks accepted production proof.`);
    }
    if (!isProductionEvidenceRef(action.evidenceRef)) {
      issues.push(`Required action ${key} lacks durable execution evidence.`);
    }
    if (!isProductionEvidenceRef(action.monitoringRef)) {
      issues.push(`Required action ${key} lacks durable monitoring evidence.`);
    }
    if (!isProductionEvidenceRef(action.rollbackRef)) {
      issues.push(`Required action ${key} lacks durable rollback evidence.`);
    }
    if (
      action.evidenceRef &&
      action.monitoringRef &&
      action.rollbackRef &&
      new Set(
        [action.evidenceRef, action.monitoringRef, action.rollbackRef].map(
          productionEvidenceIdentity,
        ),
      ).size !== 3
    ) {
      issues.push(
        `Required action ${key} conflates execution, monitor, and rollback evidence.`,
      );
    }
    if (
      !registryEntry?.documented_evidence.includes("docs/evidence/") ||
      unresolvedMarker.test(registryEntry.documented_evidence)
    ) {
      issues.push(`Required action ${key} has unresolved Registry evidence.`);
    }
    if (
      !registryEntry?.connection_health_check_ref ||
      unresolvedMarker.test(registryEntry.connection_health_check_ref)
    ) {
      issues.push(`Required action ${key} lacks a resolved Registry health monitor.`);
    }
    if (
      !registryEntry?.rollback_note ||
      unresolvedMarker.test(registryEntry.rollback_note)
    ) {
      issues.push(`Required action ${key} lacks a resolved Registry rollback contract.`);
    }
    if (
      action.evidenceRef &&
      registryEntry &&
      !registryEntry.documented_evidence.includes(action.evidenceRef)
    ) {
      issues.push(`Required action ${key} Registry evidence does not match its proof.`);
    }
  }

  const globalEvidence = [
    ["Release monitoring", manifest.monitoringRef],
    ["Release rollback", manifest.rollbackRef],
    ["Browser acceptance", manifest.browserAcceptanceRef],
  ] as const;
  for (const [label, reference] of globalEvidence) {
    if (!isProductionEvidenceRef(reference)) {
      issues.push(`${label} lacks durable production evidence.`);
    }
  }
  if (
    new Set(globalEvidence.map(([, reference]) => productionEvidenceIdentity(reference)))
      .size !== 3
  ) {
    issues.push("Release monitoring, rollback, and browser evidence must be distinct.");
  }
  const evidenceReferences = releaseEvidenceReferences(manifest);
  const seenEvidence = new Set<string>();
  for (const [, reference] of evidenceReferences) {
    const evidenceIdentity = productionEvidenceIdentity(reference);
    if (!evidenceIdentity) continue;
    if (seenEvidence.has(evidenceIdentity)) {
      issues.push(`Release evidence reference is reused across gates: ${reference}.`);
    }
    seenEvidence.add(evidenceIdentity);
  }
  if (manifest.smokeCases.some((smokeCase) => !isProductionEvidenceRef(smokeCase))) {
    issues.push("Release smoke cases still reference local or synthetic evidence.");
  }
  if (manifest.stage === "v1" && manifest.migrations.length === 0) {
    issues.push(
      "Release migrations require durable evidence, including an explicit none-required proof.",
    );
  }
  if (manifest.migrations.some((migration) => !isProductionEvidenceRef(migration))) {
    issues.push("Release migrations still reference local or synthetic artifacts.");
  }

  validateNamedAcceptance(
    "Dan business",
    "Dan",
    manifest.danBusinessAcceptance,
    releaseIdentityHash,
    issues,
  );
  validateNamedAcceptance(
    "Josiah technical",
    "Josiah",
    manifest.josiahTechnicalAcceptance,
    releaseIdentityHash,
    issues,
  );

  if (manifest.stage === "v1") {
    if (!authority) {
      issues.push(
        "V1 verification requires authoritative pins and an evidence resolver.",
      );
    } else {
      if (manifest.commit !== authority.commit) {
        issues.push("Release commit does not match the authoritative commit pin.");
      }
      if (manifest.revision !== authority.revision) {
        issues.push("Release revision does not match the authoritative revision pin.");
      }
      if (manifest.rulesVersion !== authority.rulesVersion) {
        issues.push("Firestore rules do not match the authoritative version pin.");
      }
      if (manifest.indexesVersion !== authority.indexesVersion) {
        issues.push("Firestore indexes do not match the authoritative version pin.");
      }
      if (
        manifest.registryHash !== authority.registryHash ||
        computedRegistryHash !== authority.registryHash
      ) {
        issues.push("Action Registry does not match the authoritative Registry pin.");
      }

      for (const [label, reference] of evidenceReferences) {
        if (!isProductionEvidenceRef(reference)) continue;
        let resolution: V1EvidenceResolution | undefined;
        try {
          resolution = authority.resolveEvidence(reference);
        } catch {
          resolution = undefined;
        }
        if (!resolution?.fileExists || !resolution.anchorExists) {
          issues.push(
            `${label} does not resolve to an existing evidence file and anchor.`,
          );
        }
      }
    }
  }

  if (manifest.stage === "v1" && issues.length) {
    issues.push("The V1 label is forbidden while acceptance gates remain open.");
  }
  return {
    ok: issues.length === 0,
    state: issues.length === 0 ? ("v1" as const) : ("pre-v1" as const),
    issues,
    manifest,
  };
}

function releaseEvidenceReferences(
  manifest: V1ReleaseManifest,
): Array<readonly [string, string | undefined]> {
  const references: Array<readonly [string, string | undefined]> = [];
  for (const [suite, proof] of Object.entries(manifest.suites)) {
    references.push([`${suite} acceptance evidence`, proof.evidenceRef]);
  }
  for (const action of manifest.actions) {
    references.push(
      [`${action.key} execution evidence`, action.evidenceRef],
      [`${action.key} monitoring evidence`, action.monitoringRef],
      [`${action.key} rollback evidence`, action.rollbackRef],
    );
  }
  references.push(
    ["Release monitoring evidence", manifest.monitoringRef],
    ["Release rollback evidence", manifest.rollbackRef],
    ["Browser acceptance evidence", manifest.browserAcceptanceRef],
    ...manifest.smokeCases.map(
      (reference, index) => [`Release smoke evidence ${index + 1}`, reference] as const,
    ),
    ...manifest.migrations.map(
      (reference, index) =>
        [`Release migration evidence ${index + 1}`, reference] as const,
    ),
  );
  if (manifest.danBusinessAcceptance.status === "accepted") {
    references.push([
      "Dan business acceptance evidence",
      manifest.danBusinessAcceptance.evidenceRef,
    ]);
  }
  if (manifest.josiahTechnicalAcceptance.status === "accepted") {
    references.push([
      "Josiah technical acceptance evidence",
      manifest.josiahTechnicalAcceptance.evidenceRef,
    ]);
  }
  return references;
}

export function buildCurrentPreV1Manifest(commit = "0000000"): V1ReleaseManifest {
  return {
    schemaVersion: "v1-release-manifest:1.0",
    stage: "pre-v1-maintenance",
    commit,
    revision: "local-unreleased",
    environment: "local",
    registryHash: actionRegistryHash(ACTION_REGISTRY_SEED),
    rulesVersion: "firestore.rules:local",
    indexesVersion: "firestore.indexes.json:local",
    artifactVersion: "communications-artifacts:v1.0",
    retentionVersion: "communications-retention:v1.0",
    suites: {
      S20: {
        state: "Local green",
        acceptanceIds: [...V1_REQUIRED_SUITE_ACCEPTANCE_IDS.S20],
      },
      S21: {
        state: "Local green",
        acceptanceIds: [...V1_REQUIRED_SUITE_ACCEPTANCE_IDS.S21],
      },
      S22: {
        state: "Local green",
        acceptanceIds: [...V1_REQUIRED_SUITE_ACCEPTANCE_IDS.S22],
      },
      S23: {
        state: "Local green",
        acceptanceIds: [...V1_REQUIRED_SUITE_ACCEPTANCE_IDS.S23],
      },
      S24: {
        state: "Local green",
        acceptanceIds: [...V1_REQUIRED_SUITE_ACCEPTANCE_IDS.S24],
      },
      S25: { state: "Gated", acceptanceIds: [...V1_REQUIRED_SUITE_ACCEPTANCE_IDS.S25] },
      S26: { state: "Gated", acceptanceIds: [...V1_REQUIRED_SUITE_ACCEPTANCE_IDS.S26] },
    },
    actions: V1_REQUIRED_ACTION_KEYS.map((key) => ({
      key,
      state: "Gated",
      productionAllowed: false,
      rollbackRef: "docs/v1-monitoring-and-rollback-plan-2026-07-14.md",
    })),
    migrations: [],
    smokeCases: ["integrated synthetic fake-provider acceptance"],
    monitoringRef: "docs/v1-monitoring-and-rollback-plan-2026-07-14.md",
    rollbackRef: "docs/v1-monitoring-and-rollback-plan-2026-07-14.md",
    browserAcceptanceRef: "docs/v1-tab-browser-acceptance-plan-2026-07-14.md",
    danBusinessAcceptance: { status: "pending" },
    josiahTechnicalAcceptance: { status: "pending" },
  };
}
