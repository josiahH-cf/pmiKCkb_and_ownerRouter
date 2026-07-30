import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { readRuntimeActionSuspension } from "@/lib/firestore/runtime-action-suspensions";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  ActionNotExecutableError,
  assertActionExecutable,
  isActionExecutable,
} from "@/lib/integrations/action-gate";
import {
  RUNTIME_SUSPENSION_UNREADABLE,
  resolveRuntimeExecutable,
} from "@/lib/operations/runtime-suspension";

export type RuntimeSuspensionReader = (actionKey: string) => Promise<unknown>;

export { ActionNotExecutableError };

export class ActionRuntimeSuspendedError extends EditableLayerError {
  readonly code = "action_runtime_suspended";

  constructor(key: string) {
    super(`Action "${key}" is closed by the runtime suspension gate.`, 409);
    this.name = "ActionRuntimeSuspendedError";
  }
}

/**
 * Resolve the committed seed first, then apply the fail-closed runtime term. A closed, unknown, or
 * schema-invalid seed never reads the suspension store and can never be opened by store content.
 */
export async function isRuntimeActionExecutable(
  actionKey: string,
  readSuspension: RuntimeSuspensionReader,
  registry?: CreateActionRegistryInput[],
): Promise<boolean> {
  const seedAllowed =
    registry === undefined
      ? isActionExecutable(actionKey)
      : isActionExecutable(actionKey, registry);
  if (seedAllowed !== true) return false;

  const suspension = await readSuspensionFailClosed(actionKey, readSuspension);
  return resolveRuntimeExecutable(seedAllowed, suspension);
}

/**
 * Preserve ActionNotExecutableError for a seed refusal. Only a seed-open action can reach the
 * runtime read and throw ActionRuntimeSuspendedError.
 */
export async function assertRuntimeActionExecutable(
  actionKey: string,
  readSuspension: RuntimeSuspensionReader,
  registry?: CreateActionRegistryInput[],
): Promise<void> {
  if (registry === undefined) {
    assertActionExecutable(actionKey);
  } else {
    assertActionExecutable(actionKey, registry);
  }

  const suspension = await readSuspensionFailClosed(actionKey, readSuspension);
  if (!resolveRuntimeExecutable(true, suspension)) {
    throw new ActionRuntimeSuspendedError(actionKey);
  }
}

/** Production-bound boolean gate. The reader is fixed to the fresh, fail-closed Firestore reader. */
export function isProductionRuntimeActionExecutable(
  actionKey: string,
  registry?: CreateActionRegistryInput[],
): Promise<boolean> {
  return isRuntimeActionExecutable(actionKey, readRuntimeActionSuspension, registry);
}

/** Production-bound assertion gate. The reader is never optional and never defaults to clear. */
export function assertProductionRuntimeActionExecutable(
  actionKey: string,
  registry?: CreateActionRegistryInput[],
): Promise<void> {
  return assertRuntimeActionExecutable(actionKey, readRuntimeActionSuspension, registry);
}

/**
 * Invoke a provider factory/effect only after the required asynchronous runtime check completes.
 * Keeping construction inside `effect` makes provider-construction ordering structurally testable.
 */
export async function runRuntimeGatedAction<T>(
  actionKey: string,
  readSuspension: RuntimeSuspensionReader,
  effect: () => Promise<T> | T,
  registry?: CreateActionRegistryInput[],
): Promise<T> {
  await assertRuntimeActionExecutable(actionKey, readSuspension, registry);
  return effect();
}

/** Production-bound high-order effect gate. */
export function runProductionRuntimeGatedAction<T>(
  actionKey: string,
  effect: () => Promise<T> | T,
  registry?: CreateActionRegistryInput[],
): Promise<T> {
  return runRuntimeGatedAction(actionKey, readRuntimeActionSuspension, effect, registry);
}

async function readSuspensionFailClosed(
  actionKey: string,
  readSuspension: RuntimeSuspensionReader,
): Promise<unknown> {
  try {
    return await readSuspension(actionKey);
  } catch {
    return RUNTIME_SUSPENSION_UNREADABLE;
  }
}
