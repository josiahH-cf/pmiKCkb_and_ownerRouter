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
export function isActionExecutable(
  key: string,
  registry: CreateActionRegistryInput[] = ACTION_REGISTRY_SEED,
): boolean {
  const entry = registry.find((candidate) => candidate.key === key);
  if (!entry) return false;
  // Re-parse through the schema so the same governance refinement (production_allowed ⇒ Approved +
  // Documented) is enforced here, not just at seed time.
  return CreateActionRegistryInputSchema.parse(entry).production_allowed === true;
}

/** Throw ActionNotExecutableError unless the action is production_allowed. */
export function assertActionExecutable(
  key: string,
  registry: CreateActionRegistryInput[] = ACTION_REGISTRY_SEED,
): void {
  if (!isActionExecutable(key, registry)) {
    throw new ActionNotExecutableError(key);
  }
}
