import { requireEnvironmentDescriptor } from "@/lib/environment/descriptor";

export type ConsoleDataMode = { kind: "live" };

type Environment = Record<string, string | undefined>;

/** Server-only. No request, cookie, query, header, or browser value participates. */
export function resolveConsoleDataMode(env: Environment = process.env): ConsoleDataMode {
  const descriptor = requireEnvironmentDescriptor(env);
  if (descriptor.dataContext === "demo") {
    throw new Error(
      "The Console fixture lane is retired; use explicit Live-read-only local rehearsal.",
    );
  }
  return { kind: "live" };
}

/**
 * The descriptor selects exactly one server-owned provider. Live and Live-read-only both use the
 * real read provider. The retired Demo fixture context refuses instead of substituting invented
 * rows. No request, cookie, query, header, or browser flag can change provider selection.
 */
export function resolveConsoleDataModes(
  env: Environment = process.env,
): readonly ConsoleDataMode[] {
  return [resolveConsoleDataMode(env)];
}
