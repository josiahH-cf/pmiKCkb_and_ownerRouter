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

export const PROVIDER_ACTIVATION_STATES = Object.freeze([
  "unavailable",
  "test_ready",
  "live_configured",
  "live_proven",
  "enabled",
  "suspended",
] as const);

export type ProviderActivationState = (typeof PROVIDER_ACTIVATION_STATES)[number];

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
  "Production test passed",
  "Live passed",
  "Accepted",
]);

const EvidenceLaneSchema = z.enum(["production_test", "live"]);
const WorkflowCoverageSchema = z.enum(["unverified", "production_test", "live"]);
const ProviderActivationStateSchema = z.enum(PROVIDER_ACTIVATION_STATES);
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

const SuiteProofSchema = z
  .object({
    state: ProofStateSchema,
    acceptanceIds: z.array(z.string().regex(/^AC-S2[0-6]-\d+$/)).min(1),
    evidenceLane: EvidenceLaneSchema.optional(),
    evidenceRef: DurableReferenceSchema.optional(),
  })
  .strict();

const ActionProofSchema = z
  .object({
    key: z.string().trim().min(1),
    applicationCoverage: WorkflowCoverageSchema,
    activation: ProviderActivationStateSchema,
    workflowEvidenceRef: DurableReferenceSchema.optional(),
    oneAttemptVerified: z.boolean(),
    idempotencyVerified: z.boolean(),
    correctionVerified: z.boolean(),
    liveEvidenceRef: DurableReferenceSchema.optional(),
    monitoringRef: DurableReferenceSchema.optional(),
    rollbackRef: DurableReferenceSchema.optional(),
  })
  .strict();

const SmokeCaseSchema = z
  .object({
    lane: EvidenceLaneSchema,
    evidenceRef: DurableReferenceSchema,
  })
  .strict();

export const V1ReleaseManifestSchema = z
  .object({
    schemaVersion: z.literal("v1-release-manifest:2.0"),
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
    migrations: z.array(DurableReferenceSchema),
    smokeCases: z.array(SmokeCaseSchema).min(1),
    deploymentEvidenceRef: DurableReferenceSchema,
    buildEvidenceRef: DurableReferenceSchema,
    authenticationEvidenceRef: DurableReferenceSchema,
    safetyEvidenceRef: DurableReferenceSchema,
    monitoringRef: DurableReferenceSchema,
    rollbackRef: DurableReferenceSchema,
    browserAcceptanceRef: DurableReferenceSchema,
    // Signoffs are advisory metadata. Their inner shape is validated separately so a
    // malformed or stale supplied signoff can never demote an otherwise-ready V1 app.
    danBusinessAcceptance: z.unknown(),
    josiahTechnicalAcceptance: z.unknown(),
  })
  .strict();

export type V1ReleaseManifest = z.infer<typeof V1ReleaseManifestSchema>;

export interface V1EvidenceResolution {
  fileExists: boolean;
  anchorExists: boolean;
}

/**
 * Trusted observations supplied by the release command, never by the manifest.
 * The authority proves immutable pins and that referenced evidence really exists.
 */
export interface V1ReleaseVerificationAuthority {
  commit: string;
  revision: string;
  rulesVersion: string;
  indexesVersion: string;
  registryHash: string;
  resolveEvidence: (reference: string) => V1EvidenceResolution;
}

export interface ProviderActivationSummary {
  ok: boolean;
  issues: string[];
  counts: Record<ProviderActivationState, number>;
}

export type AdvisorySignoffStatus = "pending" | "accepted" | "invalid";

export interface AdvisorySignoffSummary {
  complete: boolean;
  issues: string[];
  statuses: {
    danBusiness: AdvisorySignoffStatus;
    josiahTechnical: AdvisorySignoffStatus;
  };
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

/** Hash every operational Registry field after schema defaults. */
export function actionRegistryHash(registry: readonly CreateActionRegistryInput[]) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(normalizedRegistry(registry))))
    .digest("hex");
}

const pendingMarker =
  /(?:\bplaceholder\b|\bpending\b|\btodo\b|\btbd\b|\bunreleased\b|\blocal\b|undocumented|not documented|vendor[- ]confirmation[- ]required|<[^>]+>)/i;
const nonLiveMarker =
  /(?:\bfake\b|\bfixture\b|\bsynthetic\b|\bsample\b|\bexample\b|\bemulator\b|\bsandbox\b|production[-_ ]test|test[-_ ]lane|(?:^|[/#_.-])test(?:[/#_.-]|$))/i;

/** Durable application evidence may describe either the production Test lane or Live lane. */
function durableEvidenceIdentity(value: string | undefined) {
  if (!value || pendingMarker.test(value) || value.includes("\\")) return null;
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

/** A Test/synthetic/fake marker can never be accepted as proof of a Live provider. */
function liveEvidenceIdentity(value: string | undefined) {
  const identity = durableEvidenceIdentity(value);
  return identity && !nonLiveMarker.test(value ?? "") ? identity : null;
}

function evidenceMatchesLane(
  value: string | undefined,
  lane: "production_test" | "live" | undefined,
) {
  if (lane === "live") return liveEvidenceIdentity(value) !== null;
  if (lane === "production_test") return durableEvidenceIdentity(value) !== null;
  return false;
}

function isProductionPin(value: string) {
  return (
    value.trim().length >= 7 && !pendingMarker.test(value) && !nonLiveMarker.test(value)
  );
}

function hasExactValues(actual: readonly string[], expected: readonly string[]) {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) {
    return false;
  }
  const expectedSet = new Set(expected);
  return actual.every((value) => expectedSet.has(value));
}

interface NamedSignoffValidation {
  status: AdvisorySignoffStatus;
  evidenceRef?: string;
}

function validateNamedSignoff(
  label: string,
  expectedName: "Dan" | "Josiah",
  acceptance: unknown,
  expectedReleaseIdentityHash: string,
  issues: string[],
): NamedSignoffValidation {
  if (PendingAcceptanceSchema.safeParse(acceptance).success) {
    return { status: "pending" };
  }

  const parsed = AcceptedAcceptanceSchema.safeParse(acceptance);
  if (!parsed.success) {
    issues.push(`${label} advisory signoff is malformed.`);
    return { status: "invalid" };
  }

  let valid = true;
  if (parsed.data.acceptedBy !== expectedName) {
    issues.push(`${label} advisory signoff must be recorded by ${expectedName}.`);
    valid = false;
  }
  if (!liveEvidenceIdentity(parsed.data.evidenceRef)) {
    issues.push(`${label} advisory signoff lacks durable production evidence.`);
    valid = false;
  }
  if (parsed.data.releaseIdentityHash !== expectedReleaseIdentityHash) {
    issues.push(`${label} advisory signoff does not match this release identity.`);
    valid = false;
  }
  return {
    status: valid ? "accepted" : "invalid",
    evidenceRef: parsed.data.evidenceRef,
  };
}

/**
 * Non-circular identity signed by Dan and Josiah. It binds application readiness and the
 * independently reported provider activation snapshot, excluding only the signatures.
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
    smokeCases: [...manifest.smokeCases].sort((left, right) =>
      left.evidenceRef.localeCompare(right.evidenceRef),
    ),
    deploymentEvidenceRef: manifest.deploymentEvidenceRef,
    buildEvidenceRef: manifest.buildEvidenceRef,
    authenticationEvidenceRef: manifest.authenticationEvidenceRef,
    safetyEvidenceRef: manifest.safetyEvidenceRef,
    monitoringRef: manifest.monitoringRef,
    rollbackRef: manifest.rollbackRef,
    browserAcceptanceRef: manifest.browserAcceptanceRef,
  };
  return createHash("sha256")
    .update(JSON.stringify(stableValue(identity)))
    .digest("hex");
}

function emptyActivationCounts(): Record<ProviderActivationState, number> {
  return {
    unavailable: 0,
    test_ready: 0,
    live_configured: 0,
    live_proven: 0,
    enabled: 0,
    suspended: 0,
  };
}

function registryHasConfiguredProvider(entry: ParsedActionRegistryInput | undefined) {
  return (
    !!entry &&
    (entry.readiness === "Ready for Test" ||
      entry.readiness === "Approved for Execution") &&
    entry.evidence_status === "Documented" &&
    !!entry.connection_health_check_ref &&
    !pendingMarker.test(entry.connection_health_check_ref) &&
    !pendingMarker.test(entry.rollback_note)
  );
}

function validateLiveActivation(
  action: V1ReleaseManifest["actions"][number],
  registryEntry: ParsedActionRegistryInput | undefined,
  issues: string[],
) {
  const requiresConfiguredProvider = [
    "live_configured",
    "live_proven",
    "enabled",
  ].includes(action.activation);
  const requiresLiveProof = ["live_proven", "enabled", "suspended"].includes(
    action.activation,
  );

  if (requiresConfiguredProvider && !registryHasConfiguredProvider(registryEntry)) {
    issues.push(
      `${action.key} claims ${action.activation} without a configured, documented Registry provider contract.`,
    );
  }

  if (requiresLiveProof) {
    if (!liveEvidenceIdentity(action.liveEvidenceRef)) {
      issues.push(
        `${action.key} claims ${action.activation} without durable Live execution evidence.`,
      );
    }
    if (!liveEvidenceIdentity(action.monitoringRef)) {
      issues.push(
        `${action.key} claims ${action.activation} without durable Live monitoring evidence.`,
      );
    }
    if (!liveEvidenceIdentity(action.rollbackRef)) {
      issues.push(
        `${action.key} claims ${action.activation} without durable Live rollback evidence.`,
      );
    }
    const identities = [
      liveEvidenceIdentity(action.liveEvidenceRef),
      liveEvidenceIdentity(action.monitoringRef),
      liveEvidenceIdentity(action.rollbackRef),
    ];
    if (identities.every(Boolean) && new Set(identities).size !== 3) {
      issues.push(
        `${action.key} conflates Live execution, monitoring, and rollback evidence.`,
      );
    }
  }

  if (action.activation === "enabled") {
    if (
      !registryEntry?.production_allowed ||
      registryEntry.readiness !== "Approved for Execution" ||
      registryEntry.evidence_status !== "Documented"
    ) {
      issues.push(
        `${action.key} claims enabled while the pinned Action Registry does not allow production execution.`,
      );
    }
  }

  if (action.activation === "suspended") {
    if (registryEntry?.production_allowed || registryEntry?.readiness !== "Disabled") {
      issues.push(
        `${action.key} claims suspended while the pinned Action Registry is not disabled.`,
      );
    }
  }

  if (
    ["unavailable", "test_ready", "live_configured"].includes(action.activation) &&
    (action.liveEvidenceRef || action.monitoringRef || action.rollbackRef)
  ) {
    issues.push(
      `${action.key} includes Live proof fields while claiming ${action.activation}.`,
    );
  }
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
      activation: {
        ok: false,
        issues: ["Provider activation snapshot does not satisfy the manifest schema."],
        counts: emptyActivationCounts(),
      } satisfies ProviderActivationSummary,
      signoff: {
        complete: false,
        issues: [],
        statuses: {
          danBusiness: "invalid",
          josiahTechnical: "invalid",
        },
      } satisfies AdvisorySignoffSummary,
    };
  }

  const manifest = parsed.data;
  const issues: string[] = [];
  const activationIssues: string[] = [];
  const signoffIssues: string[] = [];
  const activationCounts = emptyActivationCounts();
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
  const registryMap = new Map(parsedRegistry.map((entry) => [entry.key, entry]));

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
    if (!evidenceMatchesLane(row.evidenceRef, row.evidenceLane)) {
      issues.push(`${suite} lacks durable ${row.evidenceLane ?? "workflow"} evidence.`);
    }
  }

  const requiredActionSet = new Set<string>(V1_REQUIRED_ACTION_KEYS);
  const manifestActionKeys = manifest.actions.map((action) => action.key);
  if (!hasExactValues(manifestActionKeys, V1_REQUIRED_ACTION_KEYS)) {
    issues.push(
      "Manifest actions do not exactly match the unique required V1 action set.",
    );
  }
  for (const action of manifest.actions) {
    if (!requiredActionSet.has(action.key)) {
      issues.push(`Unexpected manifest action ${action.key}.`);
    }
    activationCounts[action.activation] += 1;
    validateLiveActivation(action, registryMap.get(action.key), activationIssues);
  }

  const actionMap = new Map(manifest.actions.map((action) => [action.key, action]));
  const unverifiedCoverage: string[] = [];
  const missingWorkflowEvidence: string[] = [];
  const unavailableActions: string[] = [];
  const missingOneAttempt: string[] = [];
  const missingIdempotency: string[] = [];
  const missingCorrection: string[] = [];
  for (const key of V1_REQUIRED_ACTION_KEYS) {
    const action = actionMap.get(key);
    if (!action) continue;
    if (action.applicationCoverage === "unverified") unverifiedCoverage.push(key);
    if (
      action.applicationCoverage !== "unverified" &&
      !evidenceMatchesLane(action.workflowEvidenceRef, action.applicationCoverage)
    ) {
      missingWorkflowEvidence.push(key);
    }
    if (action.activation === "unavailable") unavailableActions.push(key);
    if (!action.oneAttemptVerified) missingOneAttempt.push(key);
    if (!action.idempotencyVerified) missingIdempotency.push(key);
    if (!action.correctionVerified) missingCorrection.push(key);
  }
  if (unverifiedCoverage.length) {
    issues.push(
      `${unverifiedCoverage.length} required actions lack production Test or Live workflow coverage.`,
    );
  }
  if (missingWorkflowEvidence.length) {
    issues.push(
      `${missingWorkflowEvidence.length} covered actions lack lane-correct durable workflow evidence.`,
    );
  }
  if (unavailableActions.length) {
    issues.push(
      `${unavailableActions.length} required actions are unavailable instead of at least test_ready.`,
    );
  }
  if (missingOneAttempt.length) {
    issues.push(
      `${missingOneAttempt.length} required actions lack one-attempt verification.`,
    );
  }
  if (missingIdempotency.length) {
    issues.push(
      `${missingIdempotency.length} required actions lack idempotency verification.`,
    );
  }
  if (missingCorrection.length) {
    issues.push(
      `${missingCorrection.length} required actions lack correction/rollback verification.`,
    );
  }

  // Invalid Live claims are release-integrity failures; merely being test_ready is not.
  issues.push(...activationIssues);

  for (const smokeCase of manifest.smokeCases) {
    if (!evidenceMatchesLane(smokeCase.evidenceRef, smokeCase.lane)) {
      issues.push(
        `Release smoke case lacks durable ${smokeCase.lane} workflow evidence.`,
      );
    }
  }

  const coreEvidence = [
    ["Production deployment", manifest.deploymentEvidenceRef],
    ["Production build", manifest.buildEvidenceRef],
    ["Production authentication", manifest.authenticationEvidenceRef],
    ["Production safety", manifest.safetyEvidenceRef],
    ["Release monitoring", manifest.monitoringRef],
    ["Release rollback", manifest.rollbackRef],
    ["Browser acceptance", manifest.browserAcceptanceRef],
  ] as const;
  for (const [label, reference] of coreEvidence) {
    if (!liveEvidenceIdentity(reference)) {
      issues.push(`${label} lacks durable production evidence.`);
    }
  }
  if (
    liveEvidenceIdentity(manifest.monitoringRef) ===
    liveEvidenceIdentity(manifest.rollbackRef)
  ) {
    issues.push("Release monitoring and rollback evidence must be distinct.");
  }
  if (manifest.stage === "v1" && manifest.migrations.length === 0) {
    issues.push(
      "Release migrations require durable evidence, including an explicit none-required proof.",
    );
  }
  if (manifest.migrations.some((migration) => !liveEvidenceIdentity(migration))) {
    issues.push("Release migrations still reference non-production artifacts.");
  }

  const danSignoff = validateNamedSignoff(
    "Dan business",
    "Dan",
    manifest.danBusinessAcceptance,
    releaseIdentityHash,
    signoffIssues,
  );
  const josiahSignoff = validateNamedSignoff(
    "Josiah technical",
    "Josiah",
    manifest.josiahTechnicalAcceptance,
    releaseIdentityHash,
    signoffIssues,
  );

  const evidenceReferences = releaseEvidenceReferences(manifest);
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

      const resolved = new Map<string, V1EvidenceResolution | undefined>();
      for (const [label, reference] of evidenceReferences) {
        if (!reference || !durableEvidenceIdentity(reference)) continue;
        let resolution = resolved.get(reference);
        if (!resolved.has(reference)) {
          try {
            resolution = authority.resolveEvidence(reference);
          } catch {
            resolution = undefined;
          }
          resolved.set(reference, resolution);
        }
        if (!resolution?.fileExists || !resolution.anchorExists) {
          issues.push(
            `${label} does not resolve to an existing evidence file and anchor.`,
          );
        }
      }

      for (const [label, signoff] of [
        ["Dan business advisory signoff", danSignoff],
        ["Josiah technical advisory signoff", josiahSignoff],
      ] as const) {
        if (signoff.status !== "accepted" || !signoff.evidenceRef) continue;
        let resolution: V1EvidenceResolution | undefined;
        try {
          resolution = authority.resolveEvidence(signoff.evidenceRef);
        } catch {
          resolution = undefined;
        }
        if (!resolution?.fileExists || !resolution.anchorExists) {
          signoff.status = "invalid";
          signoffIssues.push(
            `${label} does not resolve to an existing evidence file and anchor.`,
          );
        }
      }
    }
  }

  if (manifest.stage === "v1" && issues.length) {
    issues.push(
      "The V1 application label is forbidden while readiness gates remain open.",
    );
  }
  return {
    ok: issues.length === 0,
    state: issues.length === 0 ? ("v1" as const) : ("pre-v1" as const),
    issues,
    activation: {
      ok: activationIssues.length === 0,
      issues: activationIssues,
      counts: activationCounts,
    } satisfies ProviderActivationSummary,
    signoff: {
      complete:
        danSignoff.status === "accepted" &&
        josiahSignoff.status === "accepted" &&
        signoffIssues.length === 0,
      issues: signoffIssues,
      statuses: {
        danBusiness: danSignoff.status,
        josiahTechnical: josiahSignoff.status,
      },
    } satisfies AdvisorySignoffSummary,
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
    references.push([`${action.key} workflow evidence`, action.workflowEvidenceRef]);
    if (action.liveEvidenceRef) {
      references.push([`${action.key} Live execution evidence`, action.liveEvidenceRef]);
    }
    if (action.monitoringRef) {
      references.push([`${action.key} Live monitoring evidence`, action.monitoringRef]);
    }
    if (action.rollbackRef) {
      references.push([`${action.key} Live rollback evidence`, action.rollbackRef]);
    }
  }
  references.push(
    ["Production deployment evidence", manifest.deploymentEvidenceRef],
    ["Production build evidence", manifest.buildEvidenceRef],
    ["Production authentication evidence", manifest.authenticationEvidenceRef],
    ["Production safety evidence", manifest.safetyEvidenceRef],
    ["Release monitoring evidence", manifest.monitoringRef],
    ["Release rollback evidence", manifest.rollbackRef],
    ["Browser acceptance evidence", manifest.browserAcceptanceRef],
    ...manifest.smokeCases.map(
      (row, index) => [`Release smoke evidence ${index + 1}`, row.evidenceRef] as const,
    ),
    ...manifest.migrations.map(
      (reference, index) =>
        [`Release migration evidence ${index + 1}`, reference] as const,
    ),
  );
  return references;
}

export function buildCurrentV1CandidateManifest(commit = "0000000"): V1ReleaseManifest {
  return {
    schemaVersion: "v1-release-manifest:2.0",
    stage: "v1-candidate",
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
      S25: {
        state: "Gated",
        acceptanceIds: [...V1_REQUIRED_SUITE_ACCEPTANCE_IDS.S25],
      },
      S26: {
        state: "Gated",
        acceptanceIds: [...V1_REQUIRED_SUITE_ACCEPTANCE_IDS.S26],
      },
    },
    actions: V1_REQUIRED_ACTION_KEYS.map((key) => ({
      key,
      applicationCoverage: "unverified",
      activation: "unavailable",
      oneAttemptVerified: false,
      idempotencyVerified: false,
      correctionVerified: false,
    })),
    migrations: [],
    smokeCases: [
      {
        lane: "production_test",
        evidenceRef: "docs/evidence/pending-production-test.md#workflow",
      },
    ],
    deploymentEvidenceRef: "docs/evidence/pending-production-deploy.md#revision",
    buildEvidenceRef: "docs/evidence/pending-production-build.md#verification",
    authenticationEvidenceRef: "docs/evidence/pending-production-auth.md#roles",
    safetyEvidenceRef: "docs/evidence/pending-production-safety.md#boundaries",
    monitoringRef: "docs/evidence/pending-production-operations.md#monitoring",
    rollbackRef: "docs/evidence/pending-production-operations.md#rollback",
    browserAcceptanceRef: "docs/evidence/pending-production-browser.md#tabs",
    danBusinessAcceptance: { status: "pending" },
    josiahTechnicalAcceptance: { status: "pending" },
  };
}

/** @deprecated Use buildCurrentV1CandidateManifest; retained for existing callers. */
export const buildCurrentPreV1Manifest = buildCurrentV1CandidateManifest;
