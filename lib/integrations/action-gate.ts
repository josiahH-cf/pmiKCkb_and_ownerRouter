// Runtime execution gate for external actions. An Action Registry entry may only execute when the
// governance-reviewed seed says so: production_allowed === true (which the schema permits ONLY when
// readiness is "Approved for Execution" AND evidence_status is "Documented"). This reads the committed
// SEED — not Firestore — on purpose: the gate can then be opened ONLY by a reviewed code change (which
// also trips the schema pins in tests/unit/action-registry-schema.test.ts and requires the documented
// grant evidence), never by toggling a value in a console. The `registry` parameter is the test seam:
// a test may pass a flipped fake entry to exercise the gate-true path WITHOUT editing the real seed.

import {
  CreateActionRegistryInputSchema,
  type CreateActionRegistryInput,
} from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";

export class ActionNotExecutableError extends Error {
  readonly code = "action_not_production_allowed";
  readonly status = 409;
  constructor(key: string) {
    super(`Action "${key}" is not enabled for execution (production_allowed:false).`);
    this.name = "ActionNotExecutableError";
  }
}

/** True only when the (seed) registry entry for `key` is production_allowed. Missing key → false. */
// Validate the immutable compiled catalog once. This caches no actor, record, provider health,
// suspension, quota or permission decision. Caller-owned/test catalogs are still parsed per lookup.
const productionExecutability = new Map<string, boolean>();
for (const entry of ACTION_REGISTRY_SEED) {
  if (productionExecutability.has(entry.key))
    throw new Error("Duplicate committed action key.");
  productionExecutability.set(
    entry.key,
    CreateActionRegistryInputSchema.parse(entry).production_allowed === true,
  );
}

export function isActionExecutable(
  key: string,
  registry: readonly CreateActionRegistryInput[] = ACTION_REGISTRY_SEED,
): boolean {
  if (registry === ACTION_REGISTRY_SEED) return productionExecutability.get(key) === true;
  const entry = registry.find((candidate) => candidate.key === key);
  if (!entry) return false;
  return CreateActionRegistryInputSchema.parse(entry).production_allowed === true;
}

/** Throw ActionNotExecutableError unless the action is production_allowed. */
export function assertActionExecutable(
  key: string,
  registry: readonly CreateActionRegistryInput[] = ACTION_REGISTRY_SEED,
): void {
  if (!isActionExecutable(key, registry)) {
    throw new ActionNotExecutableError(key);
  }
}
