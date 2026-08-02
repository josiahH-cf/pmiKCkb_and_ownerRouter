import {
  EnvironmentContextError,
  requireEnvironmentDescriptor,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";

type Environment = Record<string, string | undefined>;

/**
 * Temporary S56 stage-one fence for product Test-lane routes while their runtime machinery still
 * exists. Automated tests run under NODE_ENV=test and retain the Demo+Demo compatibility context;
 * Production and the local Demo+Live-read-only rehearsal surface both refuse before store or
 * provider construction.
 */
export function assertTestLaneSurfaceAllowed(env: Environment = process.env) {
  const descriptor = requireEnvironmentDescriptor(env);
  if (descriptor.environmentKind !== "demo" || descriptor.dataContext !== "demo") {
    throw retiredTestLaneError(descriptor);
  }
}

/** Refuse any explicit Test record write outside the isolated automated-test compatibility lane. */
export function assertTestDataModeWriteAllowed(
  dataMode: "live" | "test",
  env: Environment = process.env,
) {
  if (dataMode === "test") assertTestLaneSurfaceAllowed(env);
}

function retiredTestLaneError(descriptor: EnvironmentDescriptor) {
  return new EnvironmentContextError(
    "The product Test lane is retired here. Rehearsal is Live read-only and cannot create Test records.",
    descriptor,
  );
}
