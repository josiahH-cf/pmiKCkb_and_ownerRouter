export type ConsoleDataMode =
  | { kind: "live" }
  | { badge: "Test data"; deploymentName: string; kind: "test" };

type Environment = Record<string, string | undefined>;

/** Server-only. No request, cookie, query, header, or browser value participates. */
export function resolveConsoleDataMode(env: Environment = process.env): ConsoleDataMode {
  const nodeEnvironment = env.NODE_ENV ?? process.env.NODE_ENV ?? "development";
  if (nodeEnvironment !== "production") {
    return {
      badge: "Test data",
      deploymentName: nodeEnvironment === "test" ? "automated-test" : "local",
      kind: "test",
    };
  }

  const explicitTestName = env.CONSOLE_TEST_DEPLOYMENT_NAME?.trim();
  if (explicitTestName && /^test-[a-z0-9-]+$/.test(explicitTestName)) {
    return { badge: "Test data", deploymentName: explicitTestName, kind: "test" };
  }

  return { kind: "live" };
}

/**
 * The production app deliberately carries two server-owned workspaces. Live never falls
 * back to fixtures; Test is a separate, permanently labeled lane. No request, cookie,
 * query, header, or browser flag can change either provider selection.
 */
export function resolveConsoleDataModes(
  env: Environment = process.env,
): readonly ConsoleDataMode[] {
  const nodeEnvironment = env.NODE_ENV ?? process.env.NODE_ENV ?? "development";
  if (nodeEnvironment !== "production") return [resolveConsoleDataMode(env)];
  return [
    { kind: "live" },
    {
      badge: "Test data",
      deploymentName: "production-test-workspace",
      kind: "test",
    },
  ];
}

export function assertFixtureMode(
  mode: ConsoleDataMode,
): asserts mode is Extract<ConsoleDataMode, { kind: "test" }> {
  if (mode.kind !== "test") {
    throw new Error("A Test provider requires the explicit Test workspace.");
  }
}
