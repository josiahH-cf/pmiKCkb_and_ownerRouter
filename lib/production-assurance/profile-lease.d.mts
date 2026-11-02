export interface ManagedProfileOwner {
  readonly pid?: number | null;
  readonly caller_pid?: number;
  readonly label?: string;
  readonly started_at?: number;
  readonly boot_id?: string;
  readonly process_start?: string;
}
export class ManagedProfileError extends Error {
  readonly code: string;
  readonly owner: ManagedProfileOwner | null;
  constructor(code: string, detail: string, owner?: ManagedProfileOwner | null);
}
export interface ManagedProfileLease {
  readonly owner: ManagedProfileOwner;
  readonly nativeState: string;
  release(): Promise<void>;
}
export function inspectChromiumProfile(
  profile: string,
): Promise<{ state: string; pid?: number | null; pid_reused?: boolean }>;
export function acquireManagedProfileLease(
  profile: string,
  options?: {
    label?: string;
    waitMs?: number;
    signal?: AbortSignal;
    onWait?: (owner: ManagedProfileOwner | null) => void;
  },
): Promise<ManagedProfileLease>;
