/**
 * Independent environment resource manifest (S40, AC-S40-2).
 *
 * Demo and Production must resolve DIFFERENT infrastructure for every resource class. Sharing any
 * one of them means a Demo effect can reach a Production record, credential, queue, or receipt, so
 * this module refuses the manifest and names the exact conflicting field rather than warning.
 *
 * This is deliberately the opposite check from the cutover report's intra-environment validation,
 * which requires every binding WITHIN one environment to resolve to the SAME project. Both are
 * needed and they must not be conflated:
 *
 * - intra-environment: every binding in Production points at the Production project.
 * - cross-environment (here): no binding in Demo points at anything Production also uses.
 *
 * Exact identifiers are supplied at provisioning time and are never invented here or inferred from
 * an existing service name.
 */

import type { EnvironmentKind } from "@/lib/environment/descriptor";

/**
 * The resource classes that must differ. Each key is the field name reported on a conflict, and
 * the value is the operator-facing description used in the refusal message.
 */
export const ISOLATED_RESOURCE_FIELDS = {
  projectId: "cloud project",
  serviceName: "service",
  firestoreDatabaseId: "Firestore database or namespace",
  storageTarget: "storage target",
  queueTopic: "queue or topic",
  secretBoundary: "Secret Manager boundary",
  oauthRedirectUri: "OAuth redirect",
  oauthAudience: "OAuth audience",
  runtimeServiceAccount: "runtime identity",
} as const;

export type IsolatedResourceField = keyof typeof ISOLATED_RESOURCE_FIELDS;

export const ISOLATED_RESOURCE_FIELD_NAMES = Object.keys(
  ISOLATED_RESOURCE_FIELDS,
) as IsolatedResourceField[];

export type EnvironmentResourceManifest = {
  readonly environmentKind: EnvironmentKind;
} & { readonly [K in IsolatedResourceField]: string };

export interface ResourceConflict {
  readonly field: IsolatedResourceField;
  /** Why this field conflicts: the two environments share a value, or one embeds the other's project. */
  readonly kind: "shared_value" | "cross_environment_alias";
  readonly message: string;
}

export type EnvironmentIsolationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly conflicts: readonly ResourceConflict[] };

function normalize(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase();
}

/**
 * True when `identifier` contains `projectId` as a consecutive run of whole name segments.
 *
 * Raw substring matching would flag `pmi-kc-kb-prod-sources` for a project id of `pmi-kc-kb-pro`,
 * which is meaningless. Segment boundaries are the separators that actually appear in GCP
 * resource names, so matching on them is the meaningful comparison.
 *
 * It stays deliberately inclusive: if one environment's project id happens to be a segment-prefix
 * of the other's resource name, that is reported rather than resolved by guessing. A preflight
 * that guesses wrong shares infrastructure between environments, and the cost of being wrong is
 * asymmetric — a spurious report costs one explicit rename, a missed alias costs isolation.
 */
function embedsProjectSegment(identifier: string, projectId: string) {
  if (!identifier || !projectId) return false;
  const segments = identifier.split(/[^a-z0-9]+/).filter(Boolean);
  const target = projectId.split(/[^a-z0-9]+/).filter(Boolean);
  if (target.length === 0) return false;
  for (let index = 0; index + target.length <= segments.length; index += 1) {
    if (target.every((part, offset) => segments[index + offset] === part)) return true;
  }
  return false;
}

/**
 * Refuse any manifest pair that shares infrastructure between Demo and Production.
 *
 * Returns every conflict rather than the first, so one provisioning report names the complete set
 * of fields an operator has to change.
 */
export function checkEnvironmentIsolation(
  demo: EnvironmentResourceManifest,
  production: EnvironmentResourceManifest,
): EnvironmentIsolationResult {
  const conflicts: ResourceConflict[] = [];

  if (demo.environmentKind !== "demo" || production.environmentKind !== "production") {
    conflicts.push({
      field: "projectId",
      kind: "shared_value",
      message: `Manifests must be one demo and one production environment, received "${demo.environmentKind}" and "${production.environmentKind}".`,
    });
    return { ok: false, conflicts };
  }

  for (const field of ISOLATED_RESOURCE_FIELD_NAMES) {
    const demoValue = normalize(demo[field]);
    const productionValue = normalize(production[field]);
    const label = ISOLATED_RESOURCE_FIELDS[field];

    if (!demoValue || !productionValue) {
      conflicts.push({
        field,
        kind: "shared_value",
        message: `The ${label} is not set for ${!demoValue ? "Demo" : "Production"}. Every isolated resource needs an exact value before provisioning.`,
      });
      continue;
    }

    if (demoValue === productionValue) {
      conflicts.push({
        field,
        kind: "shared_value",
        message: `Demo and Production both use "${demo[field]}" as the ${label}. They must be different.`,
      });
      continue;
    }
  }

  // A distinct-looking identifier that still lives inside the other environment's project is the
  // same failure wearing a different name, so catch it separately and say so plainly.
  const demoProject = normalize(demo.projectId);
  const productionProject = normalize(production.projectId);
  if (demoProject && productionProject && demoProject !== productionProject) {
    for (const field of ISOLATED_RESOURCE_FIELD_NAMES) {
      if (field === "projectId") continue;
      const label = ISOLATED_RESOURCE_FIELDS[field];
      if (embedsProjectSegment(normalize(demo[field]), productionProject)) {
        conflicts.push({
          field,
          kind: "cross_environment_alias",
          message: `The Demo ${label} "${demo[field]}" resolves inside the Production project "${production.projectId}".`,
        });
      }
      if (embedsProjectSegment(normalize(production[field]), demoProject)) {
        conflicts.push({
          field,
          kind: "cross_environment_alias",
          message: `The Production ${label} "${production[field]}" resolves inside the Demo project "${demo.projectId}".`,
        });
      }
    }
  }

  return conflicts.length === 0 ? { ok: true } : { ok: false, conflicts };
}

export class EnvironmentIsolationError extends Error {
  readonly conflicts: readonly ResourceConflict[];

  constructor(conflicts: readonly ResourceConflict[]) {
    super(
      `Demo and Production are not independent:\n${conflicts.map((conflict) => `  - ${conflict.message}`).join("\n")}`,
    );
    this.name = "EnvironmentIsolationError";
    this.conflicts = conflicts;
  }
}

export function assertEnvironmentIsolation(
  demo: EnvironmentResourceManifest,
  production: EnvironmentResourceManifest,
) {
  const result = checkEnvironmentIsolation(demo, production);
  if (!result.ok) throw new EnvironmentIsolationError(result.conflicts);
}

/**
 * The provisioning/deploy plan for a manifest pair.
 *
 * AC-S40-2 requires that a colliding manifest emit NO executable command, so commands are produced
 * only on the ok path. A caller cannot accidentally read a command off a failed result, because
 * there is no `commands` key to read.
 */
export type EnvironmentProvisioningPlan =
  | { readonly ok: true; readonly commands: readonly string[] }
  | { readonly ok: false; readonly conflicts: readonly ResourceConflict[] };

export function buildEnvironmentProvisioningPlan(
  demo: EnvironmentResourceManifest,
  production: EnvironmentResourceManifest,
  buildCommands: (manifest: EnvironmentResourceManifest) => readonly string[],
): EnvironmentProvisioningPlan {
  const isolation = checkEnvironmentIsolation(demo, production);
  if (!isolation.ok) return { ok: false, conflicts: isolation.conflicts };
  return { ok: true, commands: buildCommands(demo) };
}
