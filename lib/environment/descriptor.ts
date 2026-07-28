/**
 * Server-owned environment descriptor (S40, AC-S40-1).
 *
 * PMI KC runs one product in two independently provisioned environments. This module is the
 * single typed boundary that answers "which environment am I" and "which data am I allowed to
 * touch". It replaces the weak single-variable `NODE_ENV`/`CONSOLE_TEST_DEPLOYMENT_NAME`
 * distinction and the co-resident Production Live+Test lanes.
 *
 * Two rules make this safe:
 *
 * 1. **Server-owned.** The only input is a validated server environment record. No request,
 *    cookie, query parameter, header, local/session storage value, or record name participates.
 *    A browser cannot choose an environment, a data context, a provider adapter, or an authority.
 * 2. **Fail closed.** A missing, unknown, or internally inconsistent combination is refused. It
 *    never defaults to Production and never defaults to Live.
 *
 * Exactly three combinations are valid:
 *
 * | environmentKind | dataContext     | Meaning                                                    |
 * | --------------- | --------------- | ---------------------------------------------------------- |
 * | `demo`          | `demo`          | Realistic invented Demo records in Demo-owned resources.   |
 * | `demo`          | `live_readonly` | Explicitly selected, labeled, non-mutating Live inspection. |
 * | `production`    | `live`          | Real PMI KC data and enabled Live integrations.             |
 *
 * `production` + `demo`/`live_readonly` and `demo` + `live` are refused: Production holds Live
 * data only, and a Demo deployment never receives Production write authority.
 */

export const ENVIRONMENT_KINDS = ["demo", "production"] as const;
export type EnvironmentKind = (typeof ENVIRONMENT_KINDS)[number];

export const DATA_CONTEXTS = ["demo", "live_readonly", "live"] as const;
export type DataContext = (typeof DATA_CONTEXTS)[number];

/**
 * How the descriptor was determined.
 *
 * `explicit` means the deployment set `ENVIRONMENT_KIND` and `DATA_CONTEXT`. `legacy-node-env` is
 * the bounded stage-one compatibility bridge described in {@link resolveEnvironmentDescriptor}: it
 * keeps local development, automated tests, and the currently deployed revision working while the
 * explicit variables roll out. The Production cutover preflight refuses `legacy-node-env`, so a
 * Production environment can never ship without explicit configuration.
 */
export const DESCRIPTOR_SOURCES = ["explicit", "legacy-node-env"] as const;
export type DescriptorSource = (typeof DESCRIPTOR_SOURCES)[number];

export interface EnvironmentDescriptor {
  readonly environmentKind: EnvironmentKind;
  readonly dataContext: DataContext;
  readonly source: DescriptorSource;
}

export type EnvironmentDescriptorResult =
  | { readonly ok: true; readonly descriptor: EnvironmentDescriptor }
  | { readonly ok: false; readonly issues: readonly string[] };

type Environment = Record<string, string | undefined>;

/** The only valid (environmentKind, dataContext) pairs. Anything else is refused. */
const VALID_COMBINATIONS: ReadonlyArray<readonly [EnvironmentKind, DataContext]> = [
  ["demo", "demo"],
  ["demo", "live_readonly"],
  ["production", "live"],
];

export const ENVIRONMENT_KIND_VAR = "ENVIRONMENT_KIND";
export const DATA_CONTEXT_VAR = "DATA_CONTEXT";

function normalize(value: string | undefined) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function isValidCombination(kind: EnvironmentKind, context: DataContext) {
  return VALID_COMBINATIONS.some(
    ([validKind, validContext]) => validKind === kind && validContext === context,
  );
}

/**
 * Strictly parse an explicit descriptor. Both variables must be present and valid, and the pair
 * must be one of the three supported combinations. Returns every issue rather than the first so a
 * preflight can report a complete, actionable failure.
 */
export function parseEnvironmentDescriptor(
  env: Environment = process.env,
): EnvironmentDescriptorResult {
  const rawKind = normalize(env[ENVIRONMENT_KIND_VAR]);
  const rawContext = normalize(env[DATA_CONTEXT_VAR]);
  const issues: string[] = [];

  if (!rawKind) {
    issues.push(
      `${ENVIRONMENT_KIND_VAR} is not set. Set it to exactly one of: ${ENVIRONMENT_KINDS.join(", ")}.`,
    );
  } else if (!(ENVIRONMENT_KINDS as readonly string[]).includes(rawKind)) {
    issues.push(
      `${ENVIRONMENT_KIND_VAR} is "${rawKind}", which is not one of: ${ENVIRONMENT_KINDS.join(", ")}.`,
    );
  }

  if (!rawContext) {
    issues.push(
      `${DATA_CONTEXT_VAR} is not set. Set it to exactly one of: ${DATA_CONTEXTS.join(", ")}.`,
    );
  } else if (!(DATA_CONTEXTS as readonly string[]).includes(rawContext)) {
    issues.push(
      `${DATA_CONTEXT_VAR} is "${rawContext}", which is not one of: ${DATA_CONTEXTS.join(", ")}.`,
    );
  }

  if (issues.length > 0) return { ok: false, issues };

  const environmentKind = rawKind as EnvironmentKind;
  const dataContext = rawContext as DataContext;

  if (!isValidCombination(environmentKind, dataContext)) {
    return {
      ok: false,
      issues: [
        `${ENVIRONMENT_KIND_VAR}="${environmentKind}" with ${DATA_CONTEXT_VAR}="${dataContext}" is not a supported combination. ` +
          `Supported: ${VALID_COMBINATIONS.map(([kind, context]) => `${kind}+${context}`).join(", ")}.`,
      ],
    };
  }

  return { ok: true, descriptor: { environmentKind, dataContext, source: "explicit" } };
}

/**
 * Resolve the descriptor for the running process.
 *
 * When both explicit variables are set, this is exactly {@link parseEnvironmentDescriptor}: an
 * unknown value or unsupported pair is refused even if `NODE_ENV` would have implied something.
 *
 * When BOTH are absent, a bounded stage-one bridge derives the descriptor from `NODE_ENV` so the
 * currently deployed revision, local development, and the existing test suite keep working during
 * the rollout. `NODE_ENV=production` maps to Production+Live; anything else maps to Demo+Demo,
 * which is the fail-safe direction (a misconfigured process gets the environment with no Live
 * authority, never the one with it). The result is marked `legacy-node-env`, and the Production
 * cutover preflight refuses that source. Stage two deletes the bridge once every deployment sets
 * the variables.
 *
 * A partially configured deployment (one variable set, the other missing) is always refused —
 * that is a configuration mistake, not a legacy deployment.
 */
export function resolveEnvironmentDescriptor(
  env: Environment = process.env,
): EnvironmentDescriptorResult {
  const rawKind = normalize(env[ENVIRONMENT_KIND_VAR]);
  const rawContext = normalize(env[DATA_CONTEXT_VAR]);

  if (rawKind || rawContext) return parseEnvironmentDescriptor(env);

  const nodeEnvironment = normalize(env.NODE_ENV ?? process.env.NODE_ENV);
  return {
    ok: true,
    descriptor:
      nodeEnvironment === "production"
        ? {
            environmentKind: "production",
            dataContext: "live",
            source: "legacy-node-env",
          }
        : { environmentKind: "demo", dataContext: "demo", source: "legacy-node-env" },
  };
}

/** Resolve the descriptor or throw. Use at startup and wherever a caller cannot handle a refusal. */
export function requireEnvironmentDescriptor(
  env: Environment = process.env,
): EnvironmentDescriptor {
  const result = resolveEnvironmentDescriptor(env);
  if (!result.ok) {
    throw new Error(`Environment descriptor is invalid: ${result.issues.join(" ")}`);
  }
  return result.descriptor;
}

export function isProductionEnvironment(descriptor: EnvironmentDescriptor) {
  return descriptor.environmentKind === "production";
}

/**
 * Process-level "am I Production" for a safety fence that cannot take a descriptor parameter.
 *
 * An unreadable environment resolves to `true`. That is deliberate and is the opposite default
 * from {@link resolveEnvironmentDescriptor}: when choosing an *authority* an unknown environment
 * must get the one with no Live power, but when choosing how strict a *fence* is, an unknown
 * environment must get the strictest setting. Both directions fail closed.
 */
export function isProductionRuntime(env: Environment = process.env) {
  const result = resolveEnvironmentDescriptor(env);
  return result.ok ? isProductionEnvironment(result.descriptor) : true;
}

export function isDemoEnvironment(descriptor: EnvironmentDescriptor) {
  return descriptor.environmentKind === "demo";
}

/** True only for the explicitly selected, non-mutating Live inspection context inside Demo. */
export function isLiveReadOnlyContext(descriptor: EnvironmentDescriptor) {
  return descriptor.dataContext === "live_readonly";
}

/**
 * Whether this context may create or update app workflow state at all.
 *
 * Live-read-only is inspection only: it cannot create/update workflow state, prepare or send a
 * draft, execute a provider action, or write a receipt.
 */
export function allowsMutation(descriptor: EnvironmentDescriptor) {
  return descriptor.dataContext !== "live_readonly";
}

/**
 * Whether a real external provider client may be constructed and invoked for a Live effect.
 *
 * Only Production+Live qualifies. Demo completes the same product workflow through Demo-owned
 * adapters and persists a Demo receipt that states no Live provider was contacted; Live-read-only
 * is refused before construction, not after the call.
 */
export function allowsLiveProviderAction(descriptor: EnvironmentDescriptor) {
  return descriptor.environmentKind === "production" && descriptor.dataContext === "live";
}

/**
 * Whether Demo/Test product surfaces (seeders, simulators, fixture panels, mode choosers) may be
 * reachable. Production ships none of them.
 */
export function allowsDemoProductSurface(descriptor: EnvironmentDescriptor) {
  return descriptor.environmentKind === "demo";
}

export class EnvironmentContextError extends Error {
  readonly descriptor: EnvironmentDescriptor;

  constructor(message: string, descriptor: EnvironmentDescriptor) {
    super(message);
    this.name = "EnvironmentContextError";
    this.descriptor = descriptor;
  }
}

/** Refuse a mutation attempted from the Live-read-only inspection context. */
export function assertMutationAllowed(descriptor: EnvironmentDescriptor) {
  if (!allowsMutation(descriptor)) {
    throw new EnvironmentContextError(
      "Live read-only is an inspection context. Switch to a context that owns its data to make this change.",
      descriptor,
    );
  }
}

/** Refuse a Live provider action from any context that is not Production+Live. */
export function assertLiveProviderActionAllowed(descriptor: EnvironmentDescriptor) {
  if (!allowsLiveProviderAction(descriptor)) {
    throw new EnvironmentContextError(
      `A Live provider action requires the Production environment with Live data. This process is ${environmentLabel(descriptor)} with ${dataContextLabel(descriptor)}.`,
      descriptor,
    );
  }
}

/** Refuse a Demo-only product surface outside the Demo environment. */
export function assertDemoProductSurfaceAllowed(descriptor: EnvironmentDescriptor) {
  if (!allowsDemoProductSurface(descriptor)) {
    throw new EnvironmentContextError(
      "This tool exists only in the Demo environment.",
      descriptor,
    );
  }
}

/**
 * Operator copy. `Test` and `Sample` are retired from operator surfaces under D-14: `Test` stays an
 * engineering term for automated verification.
 */
export function environmentLabel(descriptor: EnvironmentDescriptor) {
  return descriptor.environmentKind === "production" ? "Production" : "Demo environment";
}

export function dataContextLabel(descriptor: EnvironmentDescriptor) {
  switch (descriptor.dataContext) {
    case "live":
      return "Live data";
    case "live_readonly":
      return "Live read-only";
    case "demo":
      return "Demo data";
  }
}
