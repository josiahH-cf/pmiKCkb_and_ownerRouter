import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import {
  assertActionExecutable,
  isActionExecutable,
} from "@/lib/integrations/action-gate";
import {
  RUNTIME_SUSPENSION_UNREADABLE,
  resolveRuntimeExecutable,
} from "@/lib/operations/runtime-suspension";

export type RuntimeSuspensionReader = (actionKey: string) => Promise<unknown>;

export class ActionRuntimeSuspendedError extends Error {
  readonly code = "action_runtime_suspended";
  readonly status = 409;

  constructor(key: string) {
    super(`Action "${key}" is closed by the runtime suspension gate.`);
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
