export function resolveAttendedDisplay(
  env?: NodeJS.ProcessEnv,
  probe?: (path: string) => Promise<boolean>,
  healthProbe?: () => Promise<{ state: string }>,
): Promise<
  | { ready: true; source: string; env: NodeJS.ProcessEnv }
  | { ready: false; source: string; code: string; detail: string }
>;
