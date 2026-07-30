export type RuntimeSuspensionState =
  | Readonly<{ status: "clear" }>
  | Readonly<{ status: "action_suspended" }>
  | Readonly<{ status: "global_suspended" }>
  | Readonly<{ status: "unreadable" }>;

export const RUNTIME_SUSPENSION_CLEAR = Object.freeze({ status: "clear" } as const);
export const RUNTIME_ACTION_SUSPENDED = Object.freeze({
  status: "action_suspended",
} as const);
export const RUNTIME_GLOBAL_SUSPENDED = Object.freeze({
  status: "global_suspended",
} as const);
export const RUNTIME_SUSPENSION_UNREADABLE = Object.freeze({
  status: "unreadable",
} as const);

const RUNTIME_SUSPENSION_STATUSES = new Set<RuntimeSuspensionState["status"]>([
  "clear",
  "action_suspended",
  "global_suspended",
  "unreadable",
]);

/**
 * Only one exact normalized shape means clear. Unknown, malformed, or embellished values are
 * suspended so an unreadable or forged runtime state can never open an action.
 */
export function isSuspended(state: unknown): boolean {
  const status = canonicalStatus(state);
  return status === null || status !== "clear";
}

/**
 * Runtime state is a close-only second term. It cannot turn a false seed decision into true.
 */
export function resolveRuntimeExecutable(
  seedAllowed: boolean,
  suspension: unknown,
): boolean {
  return seedAllowed === true && !isSuspended(suspension);
}

function canonicalStatus(state: unknown): RuntimeSuspensionState["status"] | null {
  try {
    if (!state || typeof state !== "object" || Array.isArray(state)) return null;
    const candidate = state as object;
    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const keys = Reflect.ownKeys(candidate);
    if (keys.length !== 1 || keys[0] !== "status") return null;

    const descriptor = Object.getOwnPropertyDescriptor(candidate, "status");
    if (!descriptor || !("value" in descriptor)) return null;
    return RUNTIME_SUSPENSION_STATUSES.has(
      descriptor.value as RuntimeSuspensionState["status"],
    )
      ? (descriptor.value as RuntimeSuspensionState["status"])
      : null;
  } catch {
    return null;
  }
}
