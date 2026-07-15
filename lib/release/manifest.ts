import { createHash } from "node:crypto";
import { z } from "zod";

import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { LEASE_EXECUTION_ACTIONS } from "@/lib/lease-renewal/execution/matrix";
import { MAINTENANCE_EXECUTION_ACTIONS } from "@/lib/maintenance/execution/matrix";

export const V1_REQUIRED_ACTION_KEYS = Object.freeze(
  [...new Set([...LEASE_EXECUTION_ACTIONS, ...MAINTENANCE_EXECUTION_ACTIONS])].sort(),
);

const ProofStateSchema = z.enum([
  "Local green",
  "Gated",
  "Sandbox proven",
  "Production allowed",
  "Bounded production proven",
  "Accepted",
]);

const AcceptanceSchema = z.object({
  status: z.enum(["pending", "accepted"]),
  acceptedBy: z.string().trim().min(1).optional(),
  acceptedAt: z.string().datetime().optional(),
  evidenceRef: z.string().trim().min(1).optional(),
});

export const V1ReleaseManifestSchema = z.object({
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
  suites: z.record(
    z.string().regex(/^S2[0-6]$/),
    z.object({ state: ProofStateSchema, acceptanceIds: z.array(z.string()).min(1) }),
  ),
  actions: z.array(
    z.object({
      key: z.string().trim().min(1),
      state: ProofStateSchema,
      productionAllowed: z.boolean(),
      evidenceRef: z.string().trim().min(1).optional(),
      monitoringRef: z.string().trim().min(1).optional(),
      rollbackRef: z.string().trim().min(1).optional(),
    }),
  ),
  migrations: z.array(z.string()),
  smokeCases: z.array(z.string()).min(1),
  monitoringRef: z.string().trim().min(1),
  rollbackRef: z.string().trim().min(1),
  browserAcceptanceRef: z.string().trim().min(1),
  danBusinessAcceptance: AcceptanceSchema,
  josiahTechnicalAcceptance: AcceptanceSchema,
});

export type V1ReleaseManifest = z.infer<typeof V1ReleaseManifestSchema>;

export function actionRegistryHash(registry: readonly CreateActionRegistryInput[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        registry
          .map((entry) => ({
            key: entry.key,
            readiness: entry.readiness,
            evidence_status: entry.evidence_status,
            production_allowed: entry.production_allowed,
          }))
          .sort((left, right) => left.key.localeCompare(right.key)),
      ),
    )
    .digest("hex");
}

export function verifyV1ReleaseManifest(
  value: unknown,
  registry: readonly CreateActionRegistryInput[] = ACTION_REGISTRY_SEED,
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
  if (manifest.registryHash !== actionRegistryHash(registry)) {
    issues.push("Action Registry hash drifted from the pinned manifest.");
  }
  for (const suite of ["S20", "S21", "S22", "S23", "S24", "S25", "S26"] as const) {
    const row = manifest.suites[suite];
    if (!row) issues.push(`${suite} evidence is missing.`);
    else if (row.state !== "Accepted")
      issues.push(`${suite} is ${row.state}, not Accepted.`);
  }
  const actionMap = new Map(manifest.actions.map((action) => [action.key, action]));
  for (const key of V1_REQUIRED_ACTION_KEYS) {
    const action = actionMap.get(key);
    const registryEntry = registry.find((entry) => entry.key === key);
    if (!action) {
      issues.push(`Required action ${key} is missing.`);
      continue;
    }
    if (
      action.state !== "Accepted" ||
      !action.productionAllowed ||
      !registryEntry?.production_allowed ||
      !action.evidenceRef ||
      !action.monitoringRef ||
      !action.rollbackRef
    ) {
      issues.push(`Required action ${key} lacks accepted production proof.`);
    }
  }
  if (manifest.danBusinessAcceptance.status !== "accepted") {
    issues.push("Dan business acceptance is pending.");
  }
  if (manifest.josiahTechnicalAcceptance.status !== "accepted") {
    issues.push("Josiah technical acceptance is pending.");
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

export function buildCurrentPreV1Manifest(commit = "0000000"): V1ReleaseManifest {
  const acceptanceIds = (suite: number, last: number) =>
    Array.from({ length: last }, (_, index) => `AC-S${suite}-${index + 1}`);
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
      S20: { state: "Local green", acceptanceIds: acceptanceIds(20, 8) },
      S21: { state: "Local green", acceptanceIds: acceptanceIds(21, 7) },
      S22: { state: "Local green", acceptanceIds: acceptanceIds(22, 9) },
      S23: { state: "Local green", acceptanceIds: acceptanceIds(23, 7) },
      S24: { state: "Local green", acceptanceIds: acceptanceIds(24, 8) },
      S25: { state: "Gated", acceptanceIds: acceptanceIds(25, 10) },
      S26: { state: "Gated", acceptanceIds: acceptanceIds(26, 10) },
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
