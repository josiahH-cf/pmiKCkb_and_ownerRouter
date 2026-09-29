export const RELEASE_LOCK_FD_ENV: "PMI_KC_RELEASE_LOCK_FD";
export function assertReleaseProcessLock(input?: {
  stateRoot?: string;
  env?: Record<string, string | undefined>;
}): number;
export interface ReleaseUnlock {
  (): Promise<void>;
  assertHeld(): void;
  readonly signal: AbortSignal;
  readonly fd: number;
}
export function acquireWatcherLock(root: string): Promise<ReleaseUnlock>;
