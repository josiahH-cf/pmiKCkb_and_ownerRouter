import { requireEnvironmentDescriptor } from "@/lib/environment/descriptor";

export type ConsoleDataMode =
  | { kind: "live" }
  | { badge: "Test data"; deploymentName: string; kind: "test" };

type Environment = Record<string, string | undefined>;

/** Server-only. No request, cookie, query, header, or browser value participates. */
export function resolveConsoleDataMode(env: Environment = process.env): ConsoleDataMode {
  const descriptor = requireEnvironmentDescriptor(env);
  if (descriptor.dataContext !== "demo") return { kind: "live" };

  const nodeEnvironment = env.NODE_ENV ?? process.env.NODE_ENV ?? "development";
  return {
    badge: "Test data",
    deploymentName: nodeEnvironment === "test" ? "automated-test" : "local",
    kind: "test",
  };
}

/**
 * The descriptor selects exactly one server-owned provider. Live and Live-read-only both use the
 * real read provider; only the Demo data context may use fixtures. No request, cookie, query,
 * header, or browser flag can change provider selection.
 */
export function resolveConsoleDataModes(
  env: Environment = process.env,
): readonly ConsoleDataMode[] {
  return [resolveConsoleDataMode(env)];
}

export function assertFixtureMode(
  mode: ConsoleDataMode,
): asserts mode is Extract<ConsoleDataMode, { kind: "test" }> {
  if (mode.kind !== "test") {
    throw new Error("A Test provider requires the explicit Test workspace.");
  }
}
